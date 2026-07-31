//! Combat: legality, settling freeform damage, choosing blocks, planning
//! attacks, and threat scoring.

use super::*;

/// Enforced rooms: can this creature legally be declared an attacker?
pub(crate) fn attack_legal(app: &App, room: &Room, card: &Card) -> bool {
    if !crate::rules::enforced(room) {
        return true;
    }
    let f = crate::rules::facts(app, card);
    let sick = card.entered_turn == Some(room.turn_number)
        && !f.as_ref().map(|f| f.has("haste")).unwrap_or(false);
    if sick {
        return false;
    }
    !f.map(|f| f.has("defender")).unwrap_or(false)
}

/// Enforced rooms: may `blocker` legally block `attacker`? Delegates to the
/// validator's full evasion table (flying, fear, shadow, skulk, protection,
/// ...), so the bot never proposes a block the engine would reject.
pub(crate) fn block_legal(app: &App, room: &Room, blocker: &Card, attacker: &Card) -> bool {
    if !crate::rules::enforced(room) {
        return true;
    }
    crate::rules::may_block(app, room, blocker, attacker).is_ok()
}

/// Enforced rooms: does this seat defend against the declared attack?
pub(crate) fn defends_enforced(room: &Room, combat: &Combat, seat: usize) -> bool {
    let fallback = room
        .players
        .iter()
        .filter(|p| p.seat != room.active_seat && !p.conceded)
        .map(|p| p.seat)
        .min();
    combat
        .attackers
        .iter()
        .any(|a| a.defender_seat.or(fallback) == Some(seat))
}

// ----------------------------------------------------------- combat: settle

/// True when `a` (an attacker record) is aimed at `seat`: explicitly, or
/// implicitly in a two-player game where there is only one possible defender.
pub(crate) fn aimed_at(a: &crate::rooms::Attacker, seat: usize, two_player: bool) -> bool {
    match a.defender_seat {
        Some(d) => d == seat,
        None => two_player,
    }
}

/// A combat ended: settle everything that concerns this bot.
/// - As the defender: apply unblocked (and trampling) damage to its own life
///   (commander attackers via cmd.damage, which also lowers life), and put
///   its own dead blockers into the graveyard.
/// - As the attacker: put its own dead attackers into the graveyard and bank
///   any lifelink.
/// It never touches anyone else's cards or totals. Stats are declared-first
/// (the declaring client knows its own counters), falling back to the full
/// effective read (oracle facts, counters, anthems, `*` powers); first
/// strike, deathtouch, trample and lifelink are honored from oracle facts.
pub(crate) fn settle_combat(app: &App, room: &Room, me: &Player, ended: &EndedCombat, mind: &mut BotMind, say: &mut Vec<String>) {
    let combat = &ended.combat;
    let live = room.players.iter().filter(|p| !p.conceded).count();
    let two_player = live <= 2;
    let mut life_loss = 0i64;
    let mut cmd_loss = 0i64;
    let mut life_gain = 0i64;
    let kw = |card: Option<&Card>, k: &str| {
        card.and_then(|c| crate::rules::facts(app, c)).map(|f| f.has(k)).unwrap_or(false)
    };
    let strikes_first =
        |card: Option<&Card>| kw(card, "first strike") || kw(card, "double strike");

    for a in &combat.attackers {
        let found = find_on_battlefields(room, &a.iid);
        let acard = found.map(|(_, c)| c);
        let mine = me.battlefield.iter().any(|c| c.iid == a.iid);
        let blockers: Vec<&crate::rooms::Block> =
            combat.blocks.iter().filter(|b| b.attacker_iid == a.iid).collect();
        let apower = stat(a.power.as_deref())
            .or_else(|| acard.map(|c| power_of(app, room, c)))
            .unwrap_or(0);
        let atough = stat(a.toughness.as_deref())
            .or_else(|| acard.map(|c| toughness(c)))
            .unwrap_or(if mine { 0 } else { 1 });

        if mine {
            // My attacker. The blockers that actually get to strike back are
            // the ones my attacker does not fell first: with first strike and
            // enough power to clear the whole gang (any assignment is lethal
            // under deathtouch), nobody without first strike of their own
            // ever swings.
            struct Blow {
                power: i64,
                tough: i64,
                first: bool,
                deathtouch: bool,
            }
            let blows: Vec<Blow> = blockers
                .iter()
                .map(|b| {
                    let bc = find_on_battlefields(room, &b.blocker_iid).map(|(_, c)| c);
                    Blow {
                        power: stat(b.power.as_deref())
                            .or_else(|| bc.map(|c| power_of(app, room, c)))
                            .unwrap_or(0),
                        tough: stat(b.toughness.as_deref())
                            .or_else(|| bc.map(|c| toughness(c)))
                            .unwrap_or(1),
                        first: strikes_first(bc),
                        deathtouch: kw(bc, "deathtouch"),
                    }
                })
                .collect();
            let clears = if kw(acard, "deathtouch") {
                apower >= blows.len() as i64
            } else {
                apower >= blows.iter().map(|b| b.tough.max(0)).sum()
            };
            let preempted = strikes_first(acard) && clears;
            let striking: Vec<&Blow> =
                blows.iter().filter(|b| !preempted || b.first).collect();
            let incoming: i64 = striking.iter().map(|b| b.power).sum();
            let poisoned = striking.iter().any(|b| b.deathtouch && b.power > 0);
            if !blockers.is_empty() && (poisoned || (atough > 0 && incoming >= atough)) {
                mind.queue.push_back(Action::CardMove {
                    iid: a.iid.clone(),
                    to: Zone::Graveyard,
                    x: None,
                    y: None,
                    index: None,
                    face_down: false,
                });
            }
            // Lifelink: my attacker dealt its power somewhere - blockers or
            // the defender's face - UNLESS a first-strike blow felled it
            // before it ever struck.
            let fs_blow: i64 = blows.iter().filter(|b| b.first).map(|b| b.power).sum();
            let fs_poison = blows.iter().any(|b| b.first && b.deathtouch && b.power > 0);
            let struck = strikes_first(acard)
                || blows.is_empty()
                || !(atough > 0 && (fs_blow >= atough || fs_poison));
            if kw(acard, "lifelink") && apower > 0 && struck {
                life_gain += apower;
            }
            continue;
        }

        // Someone else's attacker. Ignore it unless it was aimed at me.
        if !aimed_at(a, me.seat, two_player) {
            continue;
        }
        let owner_seat = found.map(|(seat, _)| seat);
        if owner_seat == Some(me.seat) {
            continue;
        }

        // My blockers on it. The attacker's power is a damage BUDGET assigned
        // across the whole gang in declared order - it cannot kill more
        // toughness than it has (deathtouch makes each kill cost 1). A
        // blocker whose lone first strike fells the attacker pre-damage
        // (preempts) is never touched; a blocker felled by the attacker's own
        // first strike never lands its blow (no lifelink credit).
        let a_dt = kw(acard, "deathtouch");
        let a_fs = strikes_first(acard);
        let mut budget = apower.max(0);
        let mut gang_tough = 0i64;
        let mut attacker_preempted = false;
        for b in &blockers {
            let bcard = find_on_battlefields(room, &b.blocker_iid).map(|(_, c)| c);
            let bpower = stat(b.power.as_deref())
                .or_else(|| bcard.map(|c| power_of(app, room, c)))
                .unwrap_or(0);
            let btough = stat(b.toughness.as_deref())
                .or_else(|| bcard.map(|c| toughness(c)))
                .unwrap_or(1)
                .max(1);
            gang_tough += btough;
            let b_fs = strikes_first(bcard);
            let preempts = b_fs
                && !a_fs
                && atough > 0
                && (bpower >= atough || (kw(bcard, "deathtouch") && bpower > 0));
            if preempts {
                attacker_preempted = true;
            }
            let cost = if a_dt { 1 } else { btough };
            let dies = !preempts && apower > 0 && budget >= cost;
            if dies {
                budget -= cost;
            }
            let Some(bl) = me.battlefield.iter().find(|c| c.iid == b.blocker_iid) else {
                continue; // another defender's blocker, not mine to move or credit
            };
            // Lifelink blocker: it dealt its blow unless the attacker's first
            // strike felled it first.
            let silenced = a_fs && !b_fs && dies;
            if kw(Some(bl), "lifelink") && bpower > 0 && !silenced {
                life_gain += bpower;
            }
            if dies {
                mind.queue.push_back(Action::CardMove {
                    iid: bl.iid.clone(),
                    to: Zone::Graveyard,
                    x: None,
                    y: None,
                    index: None,
                    face_down: false,
                });
            }
        }
        // Damage to my face: everything when unblocked; with trample, the
        // excess over the gang's combined toughness still gets through - but
        // an attacker slain in the first-strike step deals nothing at all.
        let through = if attacker_preempted {
            0
        } else if blockers.is_empty() {
            apower
        } else if kw(acard, "trample") {
            (apower - gang_tough).max(0)
        } else {
            0
        };
        if through <= 0 {
            continue;
        }

        // Commander damage IS life loss server-side, so a commander attacker
        // goes through cmd.damage alone; anything else is a plain adjustment.
        let is_cmd = acard.map(|c| c.is_commander).unwrap_or(false);
        if is_cmd {
            if let Some(owner_seat) = owner_seat {
                cmd_loss += through;
                mind.queue.push_back(Action::CmdDamage {
                    from_seat: owner_seat,
                    delta: through,
                    commander_iid: Some(a.iid.clone()),
                });
            } else {
                life_loss += through;
            }
        } else {
            life_loss += through;
        }
    }

    let net = life_gain - life_loss;
    if net != 0 {
        mind.queue.push_front(Action::LifeAdd { delta: net });
    }
    let total = life_loss + cmd_loss;
    if total > 0 {
        say.push(damage_line(total, me.life - total + life_gain));
    }
}

// ----------------------------------------------------------- combat: blocks

/// The Forge-ish ordered block pipeline, one declaration per tick:
/// 1. free blocks (kill and survive), 2. profitable trades, 3. gang blocks on
/// the biggest attacker, 4. chump blocks when life is actually in danger.
/// Attacker stats come from the combat declaration (the attacking client
/// knows its own counters); blocker stats from the embedded attrs.
pub(crate) fn choose_block(
    app: &App,
    room: &Room,
    me: &Player,
    combat: &Combat,
    style: Style,
    mind: &mut BotMind,
    say: &mut Vec<String>,
) -> Option<Action> {
    let tier = tier_of(me);
    let live = room.players.iter().filter(|p| !p.conceded).count();
    let two_player = live <= 2;

    // Attackers aimed at me, with their declared stats and block status.
    struct Atk<'a> {
        a: &'a crate::rooms::Attacker,
        card: Option<&'a Card>,
        power: i64,
        toughness: i64,
        name: String,
        blocked: bool,
    }
    let mut incoming: Vec<Atk> = combat
        .attackers
        .iter()
        .filter(|a| aimed_at(a, me.seat, two_player))
        .filter_map(|a| {
            let found = find_on_battlefields(room, &a.iid);
            if let Some((owner_seat, _)) = found {
                if owner_seat == me.seat {
                    return None;
                }
            }
            let p = stat(a.power.as_deref())
                .or_else(|| found.map(|(_, c)| power_of(app, room, c)))
                .unwrap_or(0);
            let t = stat(a.toughness.as_deref())
                .or_else(|| found.map(|(_, c)| toughness(c)))
                .unwrap_or(1);
            let name = found.map(|(_, c)| c.name.clone()).unwrap_or_else(|| "an attacker".into());
            let blocked = combat.blocks.iter().any(|b| b.attacker_iid == a.iid);
            Some(Atk { a, card: found.map(|(_, c)| c), power: p, toughness: t, name, blocked })
        })
        .collect();
    if incoming.is_empty() {
        return None;
    }
    incoming.sort_by_key(|x| std::cmp::Reverse(x.power));

    let mut free: Vec<&Card> = me
        .battlefield
        .iter()
        .filter(|c| {
            is_creature(c)
                && !c.tapped
                && !combat.blocks.iter().any(|b| b.blocker_iid == c.iid)
        })
        .collect();
    if free.is_empty() {
        return None;
    }
    free.sort_by_key(|c| std::cmp::Reverse(eval_creature_at(app, room, c)));

    let unblocked_total: i64 = incoming.iter().filter(|x| !x.blocked).map(|x| x.power).sum();
    let danger_threshold = if crate::rooms::format_has_commander(&room.format) { 8 } else { 4 };
    let in_danger = me.life - unblocked_total < danger_threshold;

    // Ward & Cowling race check: healthy and out-racing? Keep everything back
    // for the counterattack instead of trading it away. Defensive bots block
    // anyway; that is their whole personality.
    if !in_danger && style == Style::Aggro {
        let my_power: i64 = me
            .battlefield
            .iter()
            .filter(|c| is_creature(c))
            .map(|c| power_of(app, room, c))
            .sum();
        if my_power > unblocked_total * 2 {
            return None;
        }
    }

    let enforced_room = crate::rules::enforced(room);
    let pairable = |b: &Card, atk: &Atk, allow_single_menace: bool| -> bool {
        let Some(card) = atk.card else { return true };
        if !block_legal(app, room, b, card) {
            return false;
        }
        if enforced_room && !allow_single_menace {
            let menace = crate::rules::facts(app, card).map(|f| f.has("menace")).unwrap_or(false);
            if menace {
                return false;
            }
        }
        true
    };
    let declare = |blocker: &Card, atk: &Atk, mind: &mut BotMind, say: &mut Vec<String>| {
        if mind.block_says < 2 {
            mind.block_says += 1;
            say.push(block_line(&blocker.name, &atk.name));
        }
        Some(Action::CombatBlock {
            blocker_iid: blocker.iid.clone(),
            attacker_iid: atk.a.iid.clone(),
            power: Some(power_of(app, room, blocker).to_string()),
            toughness: Some(toughness(blocker).to_string()),
        })
    };

    // Pass 1: free blocks. Kill it, keep the blocker.
    for atk in incoming.iter().filter(|x| !x.blocked) {
        for b in &free {
            if atk.toughness > 0
                && power_of(app, room, b) >= atk.toughness
                && toughness(b) > atk.power
                && pairable(b, atk, false)
            {
                return declare(b, atk, mind, say);
            }
        }
    }

    // Pass 2: profitable trades (mutual kill, their creature worth at least
    // ours; the margin collapses as life gets low).
    let margin = if in_danger { -40 } else { 0 };
    for atk in incoming.iter().filter(|x| !x.blocked) {
        let atk_eval = 100 + 15 * atk.power + 10 * atk.toughness;
        for b in free.iter().rev() {
            // Smallest adequate blocker first.
            let kills = atk.toughness > 0 && power_of(app, room, b) >= atk.toughness;
            let dies = atk.power >= toughness(b);
            if kills
                && dies
                && atk_eval >= eval_creature_at(app, room, b) + margin
                && pairable(b, atk, false)
            {
                return declare(b, atk, mind, say);
            }
        }
    }

    // Pass 3: gang up on the biggest attacker when two blockers finish it.
    if (in_danger || style == Style::Defensive) && tier >= 0 {
        if let Some(atk) = incoming.iter().find(|x| !x.blocked) {
            if free.len() >= 2 && atk.toughness > 0 {
                let combined =
                    power_of(app, room, free[0]) + power_of(app, room, free[1]);
                if combined >= atk.toughness
                    && pairable(free[0], atk, true)
                    && pairable(free[1], atk, true)
                {
                    return declare(free[0], atk, mind, say);
                }
            }
        }
        // Second gang member: an attacker already blocked (by me) but not yet
        // dead to the declared blockers.
        for atk in incoming.iter().filter(|x| x.blocked) {
            let committed: i64 = combat
                .blocks
                .iter()
                .filter(|b| b.attacker_iid == atk.a.iid)
                .filter_map(|b| stat(b.power.as_deref()))
                .sum();
            if atk.toughness > 0 && committed < atk.toughness {
                if let Some(b) = free
                    .iter()
                    .find(|b| {
                        committed + power_of(app, room, b) >= atk.toughness
                            && pairable(b, atk, true)
                    })
                {
                    return declare(b, atk, mind, say);
                }
            }
        }
    }

    // Pass 4: chump blocks, only when the unblocked damage would actually
    // put me in the red. Cheapest creature onto the biggest attacker.
    if in_danger && tier >= 0 {
        for atk in incoming.iter().filter(|x| !x.blocked) {
            if let Some(b) = free.iter().rev().find(|b| pairable(b, atk, false)) {
                return declare(b, atk, mind, say);
            }
        }
    }
    None
}

// ---------------------------------------------------------- combat: attacks

/// Threat score for an opponent (recomputed every combat so the bot never
/// tunnels on one player): board value + resources + a finisher bonus for low
/// life, discounted by how well-defended they are. Jittered so a table of
/// bots does not dogpile identically.
pub(crate) fn threat_score(app: &App, room: &Room, p: &Player, starting_life: i64) -> i64 {
    let creature = |c: &&Card| {
        is_creature(c) || crate::rules::facts(app, c).map(|f| f.is_creature()).unwrap_or(false)
    };
    let board: i64 =
        p.battlefield.iter().filter(creature).map(|c| eval_creature_at(app, room, c)).sum();
    let permanents = p.battlefield.len() as i64;
    let above_start = if p.life > starting_life { 20 } else { 0 };
    // Nearness to death is absolute: 5 life is 5 damage away in any format.
    let kill_bonus = if p.life < 20 { (20 - p.life) * (20 - p.life) } else { 0 };
    let resistance: i64 = p
        .battlefield
        .iter()
        .filter(|c| creature(c) && !c.tapped)
        .map(toughness)
        .sum();
    let base = board + 10 * permanents + above_start + kill_bonus - resistance;
    // +-10% jitter.
    let jitter = base / 10;
    if jitter > 0 {
        base + rand::random_range(-jitter..=jitter)
    } else {
        base
    }
}

/// Race math on the Forge ladder: how the boards clock each other, folded
/// into the style's baseline aggression. Only creatures the bot can actually
/// read (attrs or declared stats) count; a human's unknown cards read as 0,
/// which biases bots toward attacking humans - acceptable for a freeform
/// table where the human settles their own defense.
pub(crate) fn aggression(app: &App, room: &Room, me: &Player, defender: &Player, style: Style) -> i32 {
    let creature = |c: &&Card| {
        is_creature(c) || crate::rules::facts(app, c).map(|f| f.is_creature()).unwrap_or(false)
    };
    let my_dmg: i64 = me
        .battlefield
        .iter()
        .filter(creature)
        .map(|c| power_of(app, room, c))
        .sum::<i64>()
        .max(1);
    let incoming: i64 = room
        .players
        .iter()
        .filter(|p| p.seat != me.seat && !p.conceded)
        .flat_map(|p| p.battlefield.iter())
        .filter(creature)
        .map(|c| power_of(app, room, c))
        .sum();
    let my_turns_to_die = me.life / incoming.max(1);
    let their_turns_to_die = defender.life / my_dmg;
    let mut level = base_aggression(style);
    if my_turns_to_die > their_turns_to_die {
        level += 1;
    } else if my_turns_to_die < their_turns_to_die {
        level -= 1;
    }
    // Lethal on the board: alpha strike, no holding back.
    let untapped_power: i64 = me
        .battlefield
        .iter()
        .filter(|c| creature(c) && !c.tapped)
        .map(|c| power_of(app, room, c))
        .sum();
    let absorb: i64 =
        defender.battlefield.iter().filter(|c| is_creature(c) && !c.tapped).count() as i64 * 2;
    if untapped_power >= defender.life + absorb {
        level = 5;
    }
    level.clamp(0, 5)
}

/// Pick who to attack: lethal target first, then the archenemy rule, then the
/// best threat-vs-resistance score.
pub(crate) fn pick_target<'a>(app: &App, room: &'a Room, me: &Player) -> Option<&'a Player> {
    let starting_life = room
        .settings
        .starting_life
        .unwrap_or_else(|| crate::rooms::format_default_life(&room.format));
    let opps: Vec<&Player> =
        room.players.iter().filter(|p| p.seat != me.seat && !p.conceded).collect();
    if opps.is_empty() {
        return None;
    }
    // Lethal check: my untapped power vs their life and untapped defense.
    let untapped_power: i64 = me
        .battlefield
        .iter()
        .filter(|c| is_creature(c) && !c.tapped)
        .map(|c| power_of(app, room, c))
        .sum();
    if let Some(&dead) = opps
        .iter()
        .filter(|p| {
            let blockers = p.battlefield.iter().filter(|c| is_creature(c) && !c.tapped).count();
            untapped_power >= p.life + 2 * blockers as i64
        })
        .min_by_key(|p| p.life)
    {
        return Some(dead);
    }
    let mut scored: Vec<(i64, &Player)> =
        opps.iter().map(|p| (threat_score(app, room, p, starting_life), *p)).collect();
    scored.sort_by_key(|(s, _)| std::cmp::Reverse(*s));
    // Archenemy rule: a runaway leader eats every attack.
    if scored.len() >= 2 && scored[0].0 > scored[1].0 + scored[1].0 / 2 {
        return Some(scored[0].1);
    }
    Some(scored[0].1)
}

/// Build this turn's attack: who to hit and with what. None = stay home.
pub(crate) fn plan_attack(app: &App, room: &Room, me: &Player, mind: &BotMind, style: Style, tier: i32) -> Option<AttackPlan> {
    let defender = pick_target(app, room, me)?;
    let level = (aggression(app, room, me, defender, style) + tier).clamp(0, 5);
    if level <= 0 {
        return None;
    }
    let their_blockers: Vec<&Card> = defender
        .battlefield
        .iter()
        .filter(|c| is_creature(c) && !c.tapped)
        .collect();

    let mut ready: Vec<&Card> = me
        .battlefield
        .iter()
        .filter(|c| {
            is_creature(c)
                && !c.tapped
                && power_of(app, room, c) > 0
                && !mind.played_this_turn.iter().any(|iid| iid == &c.iid)
                && attack_legal(app, room, c)
        })
        .collect();
    if ready.is_empty() {
        return None;
    }
    ready.sort_by_key(|c| std::cmp::Reverse(power_of(app, room, c)));

    // Per-creature safety classes (Forge): unblockable-ish always goes; safe
    // attackers from level 1; even trades from level 3; sacrifices only at 5.
    let mut chosen: Vec<&Card> = Vec::new();
    for &c in &ready {
        let class = if their_blockers.is_empty() {
            0 // nothing can block: free damage
        } else {
            let mut killed_by_any = false;
            let mut all_trade_back = true;
            for &b in &their_blockers {
                if toughness(c) > 0 && power_of(app, room, b) >= toughness(c) {
                    killed_by_any = true;
                    if !(toughness(b) > 0 && power_of(app, room, c) >= toughness(b)) {
                        all_trade_back = false;
                    }
                }
            }
            if !killed_by_any {
                1 // safe: survives anything they can put in front
            } else if all_trade_back {
                3 // trades at worst
            } else {
                5 // dies for free to something
            }
        };
        if level >= class {
            chosen.push(c);
        }
    }
    if chosen.is_empty() {
        return None;
    }

    // Hold back a defender when a THIRD party still threatens me at home
    // (never when alpha-striking).
    if level < 5 {
        let outside_threat = room
            .players
            .iter()
            .filter(|p| p.seat != me.seat && p.seat != defender.seat && !p.conceded)
            .any(|p| {
                p.battlefield
                    .iter()
                    .any(|c| is_creature(c) && power_of(app, room, c) >= 2)
            });
        let hold = if outside_threat {
            if style == Style::Defensive {
                2
            } else {
                1
            }
        } else {
            0
        };
        for _ in 0..hold {
            if chosen.len() <= 1 {
                break;
            }
            // Keep home the best blocker: highest toughness.
            let (idx, _) = chosen
                .iter()
                .enumerate()
                .max_by_key(|(_, c)| toughness(c))
                .unwrap();
            chosen.remove(idx);
        }
    }
    if chosen.is_empty() {
        return None;
    }

    Some(AttackPlan {
        defender_seat: defender.seat,
        pending: chosen.iter().rev().map(|c| c.iid.clone()).collect(),
        announced: false,
        announced_at: 0,
        defender_life: 0,
        blocks_seen: 0,
        respond_grace_until: 0,
        needs_lock: false,
    })
}

