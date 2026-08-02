//! The duelist: a bot that plays Yu-Gi-Oh rather than Magic.
//!
//! Nothing in the Magic brain transfers. There is no mana, so there is no
//! curve to climb and no payment to solve; a turn's whole resource is ONE
//! Normal Summon, paid for with tributes off the bot's own board. Rotation
//! means Defense Position instead of tapped. Attacks name the monster they
//! battle instead of being answered with blocks, and battle damage is a
//! subtraction both duelists can do in their heads.
//!
//! Yu-Gi-Oh tables are always freeform (`rules::enforced` is Magic-only), so
//! this brain plays by the same contract a human does: it acts on its OWN
//! cards, announces what it is doing, and settles what happens to its own side
//! of the table. Card TEXT is out of reach - the server has no duel oracle, so
//! the bot never pretends to activate an effect it cannot resolve. It summons,
//! sets, attacks, and takes its losses; that is a real duel skeleton and an
//! honest one.
//!
//! What the bot may look at is what a duelist across the table may look at:
//! face-up cards, public counts, and its own hand. A face-down card is unknown
//! here even though the server struct holds it.

use super::*;
use crate::rooms::Attacker;

// ------------------------------------------------------------------ reading

/// The bot's own monsters that are face-up in Attack Position, strongest
/// first. These are the ones that can declare an attack.
fn my_attackers(me: &Player) -> Vec<&Card> {
    let mut list: Vec<&Card> = me
        .battlefield
        .iter()
        .filter(|c| !c.face_down && !c.tapped && is_monster(c))
        .collect();
    list.sort_by_key(|c| -atk_of(c));
    list
}

/// Every monster on my field, whatever position - the tribute fodder pool.
fn my_monsters(me: &Player) -> Vec<&Card> {
    me.battlefield.iter().filter(|c| is_monster(c)).collect()
}

fn is_monster(card: &Card) -> bool {
    ygo_attr(card).map(|a| a.k == "M").unwrap_or(false)
}

fn is_trap(card: &Card) -> bool {
    ygo_attr(card).map(|a| a.k == "T").unwrap_or(false)
}

fn is_spell(card: &Card) -> bool {
    ygo_attr(card).map(|a| a.k == "S").unwrap_or(false)
}

/// A Field Spell, which occupies the mat's single Field Zone rather than one
/// of the five Spell & Trap Zones.
fn is_field_spell(card: &Card) -> bool {
    ygo_attr(card)
        .map(|a| a.k == "S" && a.sub.as_deref() == Some("Field"))
        .unwrap_or(false)
}

/// An Extra Deck monster can never be Normal Summoned out of the hand, and the
/// bot has no way to Fusion/Synchro/Xyz/Link Summon one.
fn from_extra(card: &Card) -> bool {
    ygo_attr(card).map(|a| a.x).unwrap_or(false)
}

fn atk_of(card: &Card) -> i64 {
    ygo_attr(card).map(|a| a.atk).unwrap_or(0)
}

fn def_of(card: &Card) -> i64 {
    ygo_attr(card).map(|a| a.def).unwrap_or(0)
}

fn level_of(card: &Card) -> i64 {
    ygo_attr(card).map(|a| a.lv).unwrap_or(0)
}

/// The number this monster defends with, given how it is sitting.
fn wall_of(card: &Card) -> i64 {
    if card.tapped || card.face_down {
        def_of(card)
    } else {
        atk_of(card)
    }
}

/// The seat this bot is duelling. Multiplayer duels are freeform pods rather
/// than a real format, so the bot simply picks the leader: whoever has the
/// most LP is the one worth attacking down.
fn opponent(room: &Room, me: &Player) -> Option<usize> {
    room.players
        .iter()
        .filter(|p| p.seat != me.seat && !p.conceded)
        .max_by_key(|p| p.life)
        .map(|p| p.seat)
}

fn seat<'a>(room: &'a Room, s: usize) -> Option<&'a Player> {
    room.players.iter().find(|p| p.seat == s)
}

// ------------------------------------------------------------------ placing

/// The Yu-Gi-Oh playmat is a fixed lattice, not open felt, and the client
/// snaps a dropped card to the nearest cell. These are the same coordinates
/// (src/app/pages/table/yugiohZones.tsx) so a bot's cards land in the printed
/// zones instead of floating between them.
const COLS: f64 = 7.0;
const PAD_X: f64 = 0.025;
const GAP_X: f64 = 0.008;
const PAD_TOP: f64 = 0.04;
const PAD_BOTTOM: f64 = 0.18;
const GAP_Y: f64 = 0.03;
const CELL_W: f64 = (1.0 - 2.0 * PAD_X - (COLS - 1.0) * GAP_X) / COLS;
const CELL_H: f64 = (1.0 - PAD_TOP - PAD_BOTTOM - 2.0 * GAP_Y) / 3.0;

fn cell(col: usize, row: usize) -> (f64, f64) {
    (
        PAD_X + col as f64 * (CELL_W + GAP_X) + CELL_W / 2.0,
        PAD_TOP + row as f64 * (CELL_H + GAP_Y) + CELL_H / 2.0,
    )
}

/// How close a card must sit to a cell's center to count as filling it - the
/// client's own occupancy window, so both sides agree which zones are free.
const OCCUPIED_X: f64 = 0.045;
const OCCUPIED_Y: f64 = 0.07;

/// The first free zone in a row (monsters row 1, Spell & Trap row 2), or None
/// when all five are taken.
fn free_zone(me: &Player, row: usize) -> Option<(f64, f64)> {
    (1..=5).map(|col| cell(col, row)).find(|&(x, y)| {
        !me.battlefield.iter().any(|c| {
            c.attached_to.is_none()
                && (c.x - x).abs() <= OCCUPIED_X
                && (c.y - y).abs() <= OCCUPIED_Y
        })
    })
}

const MONSTER_ROW: usize = 1;
const BACKROW: usize = 2;

// ------------------------------------------------------------------- turn

/// One decision for a bot at a duel table. Mirrors `decide` for Magic: the
/// out-of-turn work first (settling battles fought against me), then my own
/// turn.
pub(crate) fn ygo_decide(room: &Room, me: &Player, mind: &mut BotMind, now: i64) -> Decision {
    let mut say: Vec<String> = Vec::new();

    // A battle where I was the defender: apply what it did to MY side. The
    // attacker named the target on its declaration, so there is nothing to
    // guess. A fresh mind adopts the current marker rather than settling
    // history it never saw (restart safety), exactly like the Magic brain.
    if room.combat.is_none() {
        match (&room.last_combat, mind.adopted) {
            (Some(ended), true) => {
                if mind.settled_combat != Some(ended.seq) {
                    mind.settled_combat = Some(ended.seq);
                    if let Some(d) =
                        settle_battles(room, me, mind, &ended.combat.attackers, &mut say)
                    {
                        return d;
                    }
                }
            }
            (ended, false) => {
                mind.adopted = true;
                mind.settled_combat = ended.as_ref().map(|e| e.seq);
            }
            (None, true) => {}
        }
    } else {
        mind.adopted = true;
    }
    if let Some(action) = mind.queue.pop_front() {
        return Decision { action: Some(action), say, fast: true };
    }
    // Out of LP: concede so the duel can actually end.
    if me.life <= 0 {
        if !mind.said_gg {
            mind.said_gg = true;
            say.push(gg_line());
        }
        return Decision { action: Some(Action::Concede), say, fast: false };
    }
    if room.active_seat != me.seat {
        return Decision { action: None, say, fast: false };
    }

    let mut d = ygo_turn(room, me, mind, now);
    if !say.is_empty() {
        let mut merged = say;
        merged.extend(d.say);
        d.say = merged;
    }
    d
}

/// My own turn: Main Phase 1 (one Normal Summon, then fill the backrow), the
/// Battle Phase, then pass. Never stalls past the failsafe.
fn ygo_turn(room: &Room, me: &Player, mind: &mut BotMind, now: i64) -> Decision {
    let tn = room.turn_number;
    if mind.turn_started.map(|(t, _)| t) != Some(tn) {
        mind.turn_started = Some((tn, now));
        mind.ygo_summoned = false;
        mind.ygo_tributes_paid = 0;
        mind.ygo_summon_iid = None;
        mind.ygo_attacked.clear();
        return Decision::none();
    }
    if now - mind.turn_started.map(|(_, ts)| ts).unwrap_or(now) < TURN_MIN_THINK_MS {
        return Decision::none();
    }
    if now - mind.turn_started.map(|(_, ts)| ts).unwrap_or(now) > TURN_FAILSAFE_MS {
        if room.combat.is_some() {
            return Decision::act(Action::CombatEnd);
        }
        return Decision::act(Action::TurnPass);
    }

    // --- Main Phase 1 -----------------------------------------------------
    if !mind.ygo_summoned {
        if let Some(d) = normal_summon(room, me, mind) {
            return d;
        }
    }
    if let Some(d) = set_backrow(me) {
        return d;
    }

    // --- Battle Phase -----------------------------------------------------
    // A duel's first turn has no battle: the player who goes first may not
    // attack, and with an empty board there is nothing to attack with anyway.
    if room.turn_number > 1 || room.starting_seat != me.seat {
        if let Some(d) = battle(room, me, mind) {
            return d;
        }
    }
    if room.combat.is_some() {
        return Decision::act(Action::CombatEnd);
    }
    Decision::act(Action::TurnPass)
}

// ------------------------------------------------------------------ summon

/// The Normal Summon: one per turn, paid for with tributes. Picks the biggest
/// monster the board can actually pay for, and sets it face-down in Defense
/// Position instead when it would be outclassed the moment it arrives.
fn normal_summon(room: &Room, me: &Player, mind: &mut BotMind) -> Option<Decision> {
    let (x, y) = free_zone(me, MONSTER_ROW)?;
    let biggest_threat = opponent(room, me)
        .and_then(|s| seat(room, s))
        .map(|p| {
            p.battlefield
                .iter()
                .filter(|c| !c.face_down && is_monster(c))
                .map(atk_of)
                .max()
                .unwrap_or(0)
        })
        .unwrap_or(0);

    // Tribute fodder, worst first: a monster is only worth tributing if the
    // summon it pays for is bigger than it is.
    let mut fodder: Vec<&Card> = my_monsters(me);
    fodder.sort_by_key(|c| atk_of(c).max(def_of(c)));

    // A summon already being paid for stays the summon. Re-deciding each tick
    // was how a tribute got eaten for nothing: once the fodder was in the
    // Graveyard the monster it paid for no longer looked affordable, so the
    // bot quietly picked something else and the board just shrank.
    let committed = mind
        .ygo_summon_iid
        .as_ref()
        .and_then(|iid| me.hand.iter().find(|c| c.iid == *iid));

    let best = match committed {
        Some(card) => card,
        None => {
            // Tributes still on the field count toward what this turn can pay.
            let affordable = |level: i64| tributes_for(level) <= fodder.len();
            let pick = me
                .hand
                .iter()
                .filter(|c| is_monster(c) && !from_extra(c) && affordable(level_of(c)))
                // Value a summon by what it will actually do: attack with its
                // ATK, or hold the line with its DEF.
                .max_by_key(|c| atk_of(c).max(def_of(c)))?;
            // Paying two bodies for one that is not clearly better is how a
            // duelist loses a board: only tribute when the summon beats what
            // it eats.
            let owed = tributes_for(level_of(pick));
            if owed > 0 {
                let cost: i64 =
                    fodder.iter().take(owed).map(|c| atk_of(c).max(def_of(c))).sum();
                if atk_of(pick) <= cost {
                    return None;
                }
            }
            pick
        }
    };

    let owed = tributes_for(level_of(best)).saturating_sub(mind.ygo_tributes_paid);
    if owed > 0 {
        // One tribute per tick, then the summon: the table watches the
        // monsters go to the Graveyard before the big one lands.
        let victim = *fodder.first()?;
        let first = mind.ygo_tributes_paid == 0;
        mind.ygo_tributes_paid += 1;
        mind.ygo_summon_iid = Some(best.iid.clone());
        return Some(Decision {
            action: Some(Action::CardMove {
                iid: victim.iid.clone(),
                to: Zone::Graveyard,
                x: None,
                y: None,
                index: None,
                face_down: false,
            }),
            say: if first { vec![ygo_tribute_line(&victim.name, &best.name)] } else { Vec::new() },
            fast: true,
        });
    }

    mind.ygo_summoned = true;
    mind.ygo_tributes_paid = 0;
    mind.ygo_summon_iid = None;
    // Outclassed on arrival: Set it in Defense Position instead of feeding it
    // to the biggest thing across the table. A Set also hides what it is.
    let defensive = atk_of(best) <= biggest_threat && def_of(best) > atk_of(best);
    let name = best.name.clone();
    let action = Action::CardMove {
        iid: best.iid.clone(),
        to: Zone::Battlefield,
        x: Some(x),
        y: Some(y),
        index: None,
        face_down: defensive,
    };
    if defensive {
        // A Set monster lies rotated (Defense Position); the move lands it
        // face-down and the rotation follows on the next tick.
        mind.queue.push_back(Action::CardTap { iid: best.iid.clone(), tapped: true, mana: None });
        return Some(Decision { action: Some(action), say: vec![ygo_set_line()], fast: false });
    }
    Some(Decision { action: Some(action), say: vec![ygo_summon_line(&name, atk_of(best))], fast: false })
}

/// Fill the Spell & Trap Zones with face-down cards. The bot cannot resolve
/// card text, so a Set is the whole of its backrow game - which is also what
/// a set card looks like to the opponent either way.
fn set_backrow(me: &Player) -> Option<Decision> {
    // A Field Spell has its own single zone and does not compete for the
    // Spell & Trap row; it only goes down if that zone is still empty.
    if let Some(field) = me.hand.iter().find(|c| is_field_spell(c)) {
        let (fx, fy) = cell(0, MONSTER_ROW);
        let occupied = me
            .battlefield
            .iter()
            .any(|c| (c.x - fx).abs() <= OCCUPIED_X && (c.y - fy).abs() <= OCCUPIED_Y);
        if !occupied {
            return Some(Decision {
                action: Some(Action::CardMove {
                    iid: field.iid.clone(),
                    to: Zone::Battlefield,
                    x: Some(fx),
                    y: Some(fy),
                    index: None,
                    face_down: true,
                }),
                say: Vec::new(),
                fast: false,
            });
        }
    }
    let (x, y) = free_zone(me, BACKROW)?;
    // Traps first: a Trap is useless in hand and can only ever be Set.
    let card = me
        .hand
        .iter()
        .find(|c| is_trap(c))
        .or_else(|| me.hand.iter().find(|c| is_spell(c) && !is_field_spell(c)))?;
    Some(Decision {
        action: Some(Action::CardMove {
            iid: card.iid.clone(),
            to: Zone::Battlefield,
            x: Some(x),
            y: Some(y),
            index: None,
            face_down: true,
        }),
        say: Vec::new(),
        fast: false,
    })
}

// ------------------------------------------------------------------ battle

/// Declare the next attack, one per tick. Returns None when there is nothing
/// worth attacking with, which ends the Battle Phase.
///
/// The Battle Phase has to be OPENED before an attack can be declared - the
/// engine rejects a declaration with no combat on the table - so the first
/// tick that finds something to swing at spends itself on `combat.begin`.
fn battle(room: &Room, me: &Player, mind: &mut BotMind) -> Option<Decision> {
    let plan = next_attack(room, me, mind)?;
    if room.combat.is_none() {
        return Some(Decision::fast(Action::CombatBegin));
    }
    mind.ygo_attacked.push(plan.attacker_iid.clone());
    Some(Decision {
        action: Some(Action::CombatAttack {
            iid: plan.attacker_iid,
            defender_seat: plan.defender_seat,
            target_iid: plan.target_iid,
            power: Some(plan.atk.to_string()),
            toughness: Some(plan.def.to_string()),
        }),
        say: vec![plan.line],
        fast: false,
    })
}

/// One attack declaration, worked out but not yet made.
struct AttackPlanYgo {
    attacker_iid: String,
    defender_seat: Option<usize>,
    target_iid: Option<String>,
    atk: i64,
    def: i64,
    line: String,
}

/// The next attack worth declaring, or None to end the Battle Phase.
fn next_attack(room: &Room, me: &Player, mind: &BotMind) -> Option<AttackPlanYgo> {
    let target_seat = opponent(room, me)?;
    let them = seat(room, target_seat)?;
    let attacker = my_attackers(me)
        .into_iter()
        .find(|c| !mind.ygo_attacked.contains(&c.iid))?;
    let atk = atk_of(attacker);

    let their_monsters: Vec<&Card> = them.battlefield.iter().filter(|c| is_monster(c)).collect();
    let (target, line) = if their_monsters.is_empty() {
        // A clear field: attack directly for the full ATK.
        (None, ygo_direct_line(&attacker.name, atk))
    } else {
        // Battle the monster this attack actually beats. Face-up numbers are
        // public, so the choice is plain arithmetic; a face-down is a gamble
        // the bot only takes when it is swinging big enough for most of them.
        let victim = their_monsters
            .iter()
            .filter(|c| if c.face_down { atk >= 1800 } else { atk > wall_of(c) })
            // The one that clears the most board: kill the biggest thing I beat.
            .max_by_key(|c| wall_of(c))?;
        let name = if victim.face_down { "a set monster".to_string() } else { victim.name.clone() };
        (Some((*victim).clone()), ygo_attack_line(&attacker.name, &name))
    };

    let explicit_defender = room.players.len() > 2 || target.is_none();
    Some(AttackPlanYgo {
        attacker_iid: attacker.iid.clone(),
        defender_seat: explicit_defender.then_some(target_seat),
        target_iid: target.as_ref().map(|c| c.iid.clone()),
        atk,
        def: def_of(attacker),
        line,
    })
}

/// Apply every attack that was aimed at ME: LP lost, and my monsters that lost
/// their battle sent to the Graveyard. This is the freeform contract - each
/// duelist resolves what happened to their own side - and the attacker having
/// NAMED its target is what makes it unambiguous.
///
/// Returns the first action; the rest ride the queue so a multi-attack turn
/// settles across ticks instead of all at once.
fn settle_battles(
    room: &Room,
    me: &Player,
    mind: &mut BotMind,
    attackers: &[Attacker],
    say: &mut Vec<String>,
) -> Option<Decision> {
    let mut lp_lost = 0i64;
    let mut dead: Vec<String> = Vec::new();
    // Damage bounced back at an attacker that ran into a bigger wall. The
    // attacking duelist's own monster is theirs to bin; the Life Points are
    // public arithmetic, so whoever settles first states them.
    let mut reflect: Vec<(usize, i64)> = Vec::new();
    // A Set monster that was attacked is flipped face-up, win or lose.
    let mut flip: Vec<String> = Vec::new();

    for a in attackers {
        // Whose attack was this? Mine never damages me.
        let Some((owner_seat, _)) = find_on_battlefields(room, &a.iid) else { continue };
        if owner_seat == me.seat {
            continue;
        }
        let atk: i64 = a.power.as_deref().and_then(|p| p.trim().parse().ok()).unwrap_or(0);
        match a.target_iid.as_deref() {
            // No named target. With an empty field that can only be a direct
            // attack, and the full ATK comes off my LP. With monsters out it
            // is ambiguous - a human client does not name a target yet - and
            // guessing which of my monsters was battled would be worse than
            // leaving the arithmetic to the duelist who declared it.
            None => {
                let aimed_at_me =
                    a.defender_seat.map(|s| s == me.seat).unwrap_or(room.players.len() == 2);
                if aimed_at_me && !me.battlefield.iter().any(|c| is_monster(c)) {
                    lp_lost += atk;
                }
            }
            Some(target) => {
                let Some(card) = me.battlefield.iter().find(|c| c.iid == target) else { continue };
                if card.face_down {
                    flip.push(card.iid.clone());
                }
                // Defense Position battles DEF: the monster shields its
                // controller either way (no piercing here), but a wall bigger
                // than the attacker sends the difference back.
                if card.tapped || card.face_down {
                    let def = def_of(card);
                    if atk > def {
                        dead.push(card.iid.clone());
                    } else if def > atk {
                        reflect.push((owner_seat, def - atk));
                    }
                } else {
                    // Attack Position battles ATK; the loser's controller eats
                    // the difference and equal ATK destroys both.
                    let mine = atk_of(card);
                    if atk > mine {
                        lp_lost += atk - mine;
                        dead.push(card.iid.clone());
                    } else if atk == mine {
                        dead.push(card.iid.clone());
                    } else {
                        reflect.push((owner_seat, mine - atk));
                    }
                }
            }
        }
    }

    if lp_lost == 0 && dead.is_empty() && reflect.is_empty() && flip.is_empty() {
        return None;
    }
    // Flip first: a Set monster is revealed by the battle it fought, and the
    // table should see what it was before it leaves.
    let mut actions: Vec<Action> = flip
        .into_iter()
        .map(|iid| Action::CardFace { iid, face_down: false })
        .collect();
    actions.extend(dead.into_iter().map(|iid| Action::CardMove {
        iid,
        to: Zone::Graveyard,
        x: None,
        y: None,
        index: None,
        face_down: false,
    }));
    for (seat, amount) in reflect {
        say.push(ygo_reflect_line(amount));
        actions.push(Action::LifeDeal { seat, delta: -amount });
    }
    if lp_lost > 0 {
        say.push(ygo_damage_line(lp_lost, me.life - lp_lost));
        actions.insert(0, Action::LifeAdd { delta: -lp_lost });
    }
    let first = actions.remove(0);
    // The rest ride the queue: a four-attack turn settles over a few ticks,
    // which is also how it reads at the table.
    mind.queue.extend(actions);
    Some(Decision { action: Some(first), say: std::mem::take(say), fast: true })
}
