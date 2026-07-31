//! Arena-lite rules enforcement for rooms that opted in (`settings.enforced`).
//!
//! The freeform engine stays exactly what it is - `game::apply` records and
//! never judges - and the coach stays advisory. This module is the third
//! stance: a table that ASKED to have the structural rules enforced. It gates
//! the actions that matter (land drops, casting with real colored costs,
//! attack and block legality with the core keywords, turn ownership) and runs
//! the enforced combat machine: declare -> lock -> block -> ready -> preview
//! -> resolve, with the engine doing the damage math.
//!
//! What it deliberately does NOT do in v1: spell effects (still manual - this
//! is a tabletop, the card's text is executed by its caster), instant-speed
//! priority windows (sorcery-speed only), triggered abilities, or anything
//! needing text beyond Scryfall's keyword list. Unknown cards (no oracle
//! data) are treated permissively rather than bricking a deck.

use crate::oracle::{self, OracleCard};
use crate::rooms::{Card, Combat, CombatPreview, Player, PreviewRow, Room};
use crate::App;
use std::collections::BTreeMap;
use std::sync::Arc;

pub type RuleError = (&'static str, String);

/// How long the table waits for responses before the top spell may resolve
/// without every pass. Bots pass within a tick; this guards silent humans.
pub const RESPONSE_TIMEOUT_MS: i64 = 30_000;

/// Every non-conceded seat other than `owner_seat` has passed priority.
pub fn all_passed(room: &Room, owner_seat: usize) -> bool {
    room.players
        .iter()
        .filter(|p| !p.conceded && p.seat != owner_seat)
        .all(|p| room.stack_passed.contains(&p.seat))
}

/// May the top of the stack resolve? Everyone passed, or the window lapsed.
pub fn stack_resolvable(room: &Room, owner_seat: usize) -> bool {
    all_passed(room, owner_seat)
        || crate::now_ms() - room.stack_changed_ms >= RESPONSE_TIMEOUT_MS
}

/// Is this room playing under enforcement?
pub fn enforced(room: &Room) -> bool {
    room.settings.enforced && room.game == "mtg"
}

fn err(msg: impl Into<String>) -> RuleError {
    ("illegal", msg.into())
}

pub fn facts(app: &App, card: &Card) -> Option<Arc<OracleCard>> {
    card.scryfall_id.as_deref().and_then(|sid| oracle::get(app, sid))
}

/// A creature as far as enforcement can tell: oracle says so, or (unknown
/// card) it carries printed/declared power.
fn is_creature(app: &App, card: &Card) -> bool {
    match facts(app, card) {
        Some(f) => f.is_creature(),
        None => card.power.is_some(),
    }
}

fn has_kw(app: &App, card: &Card, kw: &str) -> bool {
    facts(app, card).map(|f| f.has(kw)).unwrap_or(false)
}

/// Does this permanent arrive tapped? Enforced tables only - in a freeform
/// room the engine deliberately knows nothing about cards, and there the
/// player taps whatever the card says by hand.
pub fn enters_tapped(app: &App, room: &Room, card: &Card) -> bool {
    enforced(room) && facts(app, card).map(|f| f.tapped_on_entry).unwrap_or(false)
}

/// How many permanents a `*` power counts, from the controller's point of
/// view. Only the counting CDA shape is modelled (see `oracle::CountCda`).
fn cda_count(app: &App, room: &Room, controller: usize, cda: &crate::oracle::CountCda) -> i64 {
    // Type lines are matched as Scryfall prints them: "artifact" -> "Artifact".
    let mut want = cda.counts.clone();
    if let Some(first) = want.get_mut(..1) {
        first.make_ascii_uppercase();
    }
    room.players
        .iter()
        .filter(|p| if cda.opponents { p.seat != controller && !p.conceded } else { p.seat == controller })
        .flat_map(|p| p.battlefield.iter())
        .filter(|c| facts(app, c).map(|f| f.type_line.contains(&want)).unwrap_or(false))
        .count() as i64
}

/// Effective power/toughness: oracle printed stats plus +N/+N-style counters.
/// Tokens and unknowns fall back to the instance's own printed strings.
/// `controller` is the seat the card is under, which a `*` power needs.
pub fn effective_pt(app: &App, room: &Room, controller: usize, card: &Card) -> (i64, i64) {
    let stat = |s: &Option<String>| s.as_deref().and_then(|v| v.trim().parse::<i64>().ok());
    let (mut p, mut t) = match facts(app, card) {
        Some(f) => {
            // A `*` power is defined by an ability, not printed. Count it
            // rather than letting the unparsed stat fall through as 0 - that
            // is what kept Bronze Guardian from ever attacking.
            let starred = f.cda.as_ref().map(|cda| cda_count(app, room, controller, cda));
            (
                starred.or(f.power).or_else(|| stat(&card.power)).unwrap_or(0),
                f.cda
                    .as_ref()
                    .filter(|cda| cda.toughness)
                    .and(starred)
                    .or(f.toughness)
                    .or_else(|| stat(&card.toughness))
                    .unwrap_or(0),
            )
        }
        None => (stat(&card.power).unwrap_or(0), stat(&card.toughness).unwrap_or(0)),
    };
    for (kind, count) in &card.counters {
        let c = *count;
        if c <= 0 {
            continue;
        }
        let parts: Vec<&str> = kind.trim().split('/').collect();
        if parts.len() == 2 {
            if let (Ok(dp), Ok(dt)) = (parts[0].parse::<i64>(), parts[1].parse::<i64>()) {
                p += dp * c;
                t += dt * c;
            }
        }
    }
    (p, t)
}

/// Summoning sickness: entered the battlefield this turn round, no haste.
/// Only meaningful for the active player's own creatures.
fn is_sick(app: &App, room: &Room, card: &Card) -> bool {
    card.entered_turn == Some(room.turn_number) && !has_kw(app, card, "haste")
}

/// The seat an attacker is aimed at, resolved for damage purposes: explicit
/// defender, else (1v1 or open swing) the lowest-seat non-conceded opponent.
fn resolved_defender(room: &Room, attacker_owner: usize, declared: Option<usize>) -> Option<usize> {
    if let Some(seat) = declared {
        return Some(seat);
    }
    room.players
        .iter()
        .filter(|p| p.seat != attacker_owner && !p.conceded)
        .map(|p| p.seat)
        .min()
}

/// Does this seat defend against any declared attacker?
fn seat_defends(room: &Room, combat: &Combat, seat: usize) -> bool {
    let active = room.active_seat;
    combat
        .attackers
        .iter()
        .any(|a| resolved_defender(room, active, a.defender_seat) == Some(seat))
}

// ------------------------------------------------------------------ mana

/// Solve payment for a cost of `generic` + colored `pips`, spending the
/// player's floating pool first and then choosing untapped lands to tap.
/// Returns the land iids to tap plus the pool amounts to consume, or an
/// error naming what is missing. `payment` (manual override) restricts the
/// land choice to exactly those iids.
pub fn solve_payment(
    app: &App,
    player: &Player,
    generic: i64,
    pips: &BTreeMap<char, i64>,
    payment: Option<&[String]>,
) -> Result<(Vec<String>, BTreeMap<char, i64>), RuleError> {
    // Floating pool first (manual tappers build the pool, then cast).
    let mut pool_spend: BTreeMap<char, i64> = BTreeMap::new();
    let mut need: BTreeMap<char, i64> = pips.clone();
    let mut need_generic = generic;
    let mut pool: BTreeMap<char, i64> = player
        .mana
        .iter()
        .filter(|(_, v)| **v > 0)
        .filter_map(|(k, v)| k.chars().next().map(|c| (c, *v)))
        .collect();
    for (color, n) in need.iter_mut() {
        let have = pool.get_mut(color);
        if let Some(have) = have {
            let take = (*n).min(*have);
            if take > 0 {
                *n -= take;
                *have -= take;
                *pool_spend.entry(*color).or_insert(0) += take;
            }
        }
    }
    // Leftover pool of any color pays generic.
    for (color, have) in pool.iter_mut() {
        if need_generic == 0 {
            break;
        }
        let take = need_generic.min(*have);
        if take > 0 {
            need_generic -= take;
            *have -= take;
            *pool_spend.entry(*color).or_insert(0) += take;
        }
    }

    // Candidate lands: untapped, on the battlefield, oracle-known producers.
    let candidates: Vec<(&Card, Vec<char>)> = player
        .battlefield
        .iter()
        .filter(|c| !c.tapped)
        .filter(|c| payment.map(|p| p.iter().any(|iid| *iid == c.iid)).unwrap_or(true))
        .filter_map(|c| {
            let f = facts(app, c)?;
            if !f.is_land() || f.produced.is_empty() {
                return None;
            }
            Some((c, f.produced.clone()))
        })
        .collect();

    let mut used: Vec<String> = Vec::new();
    let mut available: Vec<(&Card, Vec<char>)> = candidates;

    // Colored pips first, scarcest color first, preferring the least flexible
    // land that can pay it (save duals for later pips).
    let mut colors: Vec<char> = need.iter().filter(|(_, n)| **n > 0).map(|(c, _)| *c).collect();
    colors.sort_by_key(|color| {
        available.iter().filter(|(_, produced)| produced.contains(color)).count()
    });
    for color in colors {
        let mut remaining = need.get(&color).copied().unwrap_or(0);
        while remaining > 0 {
            let pick = available
                .iter()
                .enumerate()
                .filter(|(_, (_, produced))| produced.contains(&color))
                .min_by_key(|(_, (_, produced))| produced.len())
                .map(|(i, _)| i);
            let Some(i) = pick else {
                return Err(err(format!("not enough {color} mana")));
            };
            let (card, _) = available.remove(i);
            used.push(card.iid.clone());
            remaining -= 1;
        }
        need.insert(color, 0);
    }
    // Generic from whatever is left, least flexible first.
    while need_generic > 0 {
        available.sort_by_key(|(_, produced)| produced.len());
        let Some((card, _)) = available.first() else {
            return Err(err("not enough mana"));
        };
        used.push(card.iid.clone());
        available.remove(0);
        need_generic -= 1;
    }
    Ok((used, pool_spend))
}

/// Can this player afford a cost right now (dry run)?
pub fn can_afford(app: &App, player: &Player, generic: i64, pips: &BTreeMap<char, i64>) -> bool {
    solve_payment(app, player, generic, pips, None).is_ok()
}

// ------------------------------------------------------------------ checks

/// Validate one action under enforcement. Ok(()) = proceed into the normal
/// freeform apply. Anything not explicitly gated here stays legal - manual
/// spell effects need the freeform verbs.
pub fn check(app: &App, room: &Room, pi: usize, action: &crate::game::Action) -> Result<(), RuleError> {
    use crate::game::{Action, Zone};
    let me = &room.players[pi];
    let my_turn = room.active_seat == me.seat;
    let main_phase = room.phase == "main1" || room.phase == "main2";

    match action {
        Action::CardMove { iid, to, .. } => {
            // Only the hand -> battlefield gesture is gated: that is where
            // "just put it into play without paying" happens. Everything else
            // (effects, cleanup, reanimation agreed at the table) stays open.
            if *to == Zone::Battlefield && me.hand.iter().any(|c| c.iid == *iid) {
                let card = me.hand.iter().find(|c| c.iid == *iid).unwrap();
                match facts(app, card) {
                    Some(f) if f.is_land() => {
                        if !my_turn {
                            return Err(err("you can only play a land on your own turn"));
                        }
                        if !main_phase {
                            return Err(err("lands are played in your main phases"));
                        }
                        if room.combat.is_some() {
                            return Err(err("finish combat before playing a land"));
                        }
                        if me.lands_this_turn >= 1 {
                            return Err(err("you already played a land this turn"));
                        }
                        if !room.stack.is_empty() {
                            return Err(err("lands wait for an empty stack"));
                        }
                    }
                    Some(_) => {
                        return Err(("must_cast", "that card must be cast - click it to pay its cost".to_string()));
                    }
                    None => {} // unknown card: permissive
                }
            }
            Ok(())
        }
        Action::StackPush { iid } => {
            if let Some(card) = me.hand.iter().find(|c| c.iid == *iid) {
                if facts(app, card).is_some() {
                    return Err(("must_cast", "cast that card instead so its cost is paid".to_string()));
                }
            }
            Ok(())
        }
        Action::Cast { iid, payment, .. } => {
            let Some(card) = me.hand.iter().find(|c| c.iid == *iid) else {
                return Err(err("that card is not in your hand"));
            };
            let Some(f) = facts(app, card) else {
                return Err(err("that card has no rules data yet - try again in a moment"));
            };
            if f.is_land() {
                return Err(err("lands are played, not cast - drag it out"));
            }
            let instant_speed = f.is_instant() || f.has("flash");
            if !instant_speed {
                if !my_turn {
                    return Err(err("sorcery-speed spells wait for your own turn"));
                }
                if !main_phase {
                    return Err(err("sorcery-speed spells are cast in your main phases"));
                }
                if room.combat.is_some() {
                    return Err(err("finish combat first (or respond with an instant)"));
                }
                if !room.stack.is_empty() {
                    return Err(err("wait for the stack to empty (or respond with an instant)"));
                }
            }
            let paylist = payment.as_deref();
            solve_payment(app, me, f.generic, &f.pips, paylist).map(|_| ())
        }
        Action::CmdCast { iid, .. } => {
            let Some(card) = me.command.iter().find(|c| c.iid == *iid) else {
                return Err(err("that card is not in your command zone"));
            };
            if !my_turn || !main_phase {
                return Err(err("your commander is cast in your own main phase"));
            }
            if room.combat.is_some() {
                return Err(err("finish combat first"));
            }
            match facts(app, card) {
                Some(f) => {
                    let tax = me.commander_tax.get(iid).copied().unwrap_or(0);
                    solve_payment(app, me, f.generic + tax, &f.pips, None).map(|_| ())
                }
                None => Ok(()), // unknown commander: permissive
            }
        }
        Action::CardTap { iid, tapped, .. } => {
            if !*tapped {
                // Untapping is the engine's job (turn start, vigilance).
                let on_field = me.battlefield.iter().any(|c| c.iid == *iid);
                if on_field {
                    return Err(err("cards untap at the start of your turn"));
                }
            }
            Ok(())
        }
        Action::UntapAll => {
            // The engine untaps at turn start, but the button stays usable on
            // your own turn - a harmless no-op beats a confusing rejection.
            if !my_turn {
                return Err(err("your permanents untap at the start of your own turn"));
            }
            Ok(())
        }
        Action::TurnSet { .. } => Err(err("turns pass in order at an enforced table")),
        Action::PhaseSet { .. } => {
            if !my_turn {
                return Err(err("only the active player moves the phase along"));
            }
            Ok(())
        }
        Action::TurnPass => {
            if !my_turn {
                return Err(err("it is not your turn"));
            }
            if let Some(combat) = &room.combat {
                if !combat.attackers.is_empty() {
                    return Err(err("resolve or cancel combat before ending the turn"));
                }
            }
            Ok(())
        }
        Action::CombatBegin => {
            if !my_turn {
                return Err(err("combat happens on your own turn"));
            }
            if room.combat.is_some() {
                return Err(err("combat is already underway"));
            }
            Ok(())
        }
        Action::CombatAttack { iid, .. } => {
            let Some(combat) = &room.combat else {
                return Err(err("combat has not begun"));
            };
            if !my_turn {
                return Err(err("only the active player declares attackers"));
            }
            if combat.locked {
                return Err(err("attackers are locked in"));
            }
            // Toggling an existing attacker off is always fine pre-lock.
            if combat.attackers.iter().any(|a| a.iid == *iid) {
                return Ok(());
            }
            let Some(card) = me.battlefield.iter().find(|c| c.iid == *iid) else {
                return Err(err("that card is not on your battlefield"));
            };
            if !is_creature(app, card) {
                return Err(err("only creatures attack"));
            }
            if card.tapped {
                return Err(err("tapped creatures cannot attack"));
            }
            if is_sick(app, room, card) {
                return Err(err("that creature has summoning sickness"));
            }
            if has_kw(app, card, "defender") {
                return Err(err("creatures with defender cannot attack"));
            }
            Ok(())
        }
        Action::CombatLock => {
            let Some(combat) = &room.combat else {
                return Err(err("combat has not begun"));
            };
            if !my_turn {
                return Err(err("only the attacker locks in attackers"));
            }
            if combat.locked {
                return Err(err("attackers are already locked"));
            }
            if combat.attackers.is_empty() {
                return Err(err("declare at least one attacker (or end combat)"));
            }
            Ok(())
        }
        Action::CombatBlock { blocker_iid, attacker_iid, .. } => {
            let Some(combat) = &room.combat else {
                return Err(err("combat has not begun"));
            };
            if !combat.locked {
                return Err(err("wait until attackers are locked in"));
            }
            if combat.blocks_ready {
                return Err(err("blocks are locked in"));
            }
            if !seat_defends(room, combat, me.seat) {
                return Err(err("you are not being attacked"));
            }
            // Toggle-off pre-ready is fine.
            if combat
                .blocks
                .iter()
                .any(|b| b.blocker_iid == *blocker_iid && b.attacker_iid == *attacker_iid)
            {
                return Ok(());
            }
            let Some(attacker_entry) = combat.attackers.iter().find(|a| a.iid == *attacker_iid) else {
                return Err(err("that creature is not attacking"));
            };
            if resolved_defender(room, room.active_seat, attacker_entry.defender_seat) != Some(me.seat) {
                return Err(err("that attacker is not coming at you"));
            }
            let Some(blocker) = me.battlefield.iter().find(|c| c.iid == *blocker_iid) else {
                return Err(err("that blocker is not on your battlefield"));
            };
            if !is_creature(app, blocker) {
                return Err(err("only creatures block"));
            }
            if blocker.tapped {
                return Err(err("tapped creatures cannot block"));
            }
            if combat.blocks.iter().any(|b| b.blocker_iid == *blocker_iid) {
                return Err(err("that creature is already blocking"));
            }
            // Evasion: flying is blocked only by flying or reach.
            let attacker_card = find_card(room, attacker_iid);
            if let Some(atk) = attacker_card {
                if has_kw(app, atk, "flying")
                    && !has_kw(app, blocker, "flying")
                    && !has_kw(app, blocker, "reach")
                {
                    return Err(err("only flying or reach can block a flyer"));
                }
            }
            Ok(())
        }
        Action::CombatReady { .. } => {
            let Some(combat) = &room.combat else {
                return Err(err("combat has not begun"));
            };
            if !combat.locked {
                return Err(err("attackers are not locked yet"));
            }
            if combat.blocks_ready {
                return Err(err("blocks are already locked"));
            }
            if !seat_defends(room, combat, me.seat) {
                return Err(err("you are not being attacked"));
            }
            // Menace: each menace attacker is blocked by zero or 2+ creatures.
            for a in &combat.attackers {
                let n = combat.blocks.iter().filter(|b| b.attacker_iid == a.iid).count();
                if n == 1 {
                    if let Some(card) = find_card(room, &a.iid) {
                        if has_kw(app, card, "menace") {
                            return Err(err(format!(
                                "{} has menace - block with two or more, or none",
                                card.name
                            )));
                        }
                    }
                }
            }
            Ok(())
        }
        Action::CombatResolve => {
            let Some(combat) = &room.combat else {
                return Err(err("combat has not begun"));
            };
            if combat.preview.is_none() {
                return Err(err("blocks are not locked in yet"));
            }
            if !my_turn {
                return Err(err("the attacker resolves combat"));
            }
            Ok(())
        }
        Action::CombatEnd => {
            if !my_turn {
                return Err(err("only the active player ends combat"));
            }
            Ok(())
        }
        Action::StackResolve { iid, .. } => {
            let Some(top) = room.stack.last() else {
                return Err(err("the stack is empty"));
            };
            if top.card.iid != *iid {
                return Err(err("the stack resolves top-down - resolve the newest spell first"));
            }
            if top.owner != me.user_id {
                return Err(err("a spell resolves by its caster's hand"));
            }
            if !stack_resolvable(room, me.seat) {
                return Err(("responses_open", "waiting for responses - others may still act".to_string()));
            }
            Ok(())
        }
        Action::StackPass => {
            if room.stack.is_empty() {
                return Err(err("nothing to respond to"));
            }
            if room.stack.last().map(|e| e.owner.as_str()) == Some(me.user_id.as_str()) {
                return Err(err("the top spell is yours - others respond, you resolve"));
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

fn find_card<'a>(room: &'a Room, iid: &str) -> Option<&'a Card> {
    room.players.iter().find_map(|p| p.battlefield.iter().find(|c| c.iid == iid))
}

// ------------------------------------------------------------ combat math

struct Fighter<'a> {
    card: &'a Card,
    power: i64,
    toughness: i64,
    first: bool,  // first strike
    double: bool, // double strike
    deathtouch: bool,
    trample: bool,
    lifelink: bool,
}

/// The card and the seat controlling it.
fn find_card_owner<'a>(room: &'a Room, iid: &str) -> Option<(usize, &'a Card)> {
    room.players
        .iter()
        .find_map(|p| p.battlefield.iter().find(|c| c.iid == iid).map(|c| (p.seat, c)))
}

fn fighter<'a>(app: &App, room: &Room, controller: usize, card: &'a Card) -> Fighter<'a> {
    let (power, toughness) = effective_pt(app, room, controller, card);
    Fighter {
        card,
        power,
        toughness,
        first: has_kw(app, card, "first strike"),
        double: has_kw(app, card, "double strike"),
        deathtouch: has_kw(app, card, "deathtouch"),
        trample: has_kw(app, card, "trample"),
        lifelink: has_kw(app, card, "lifelink"),
    }
}

/// Compute the outcome of the declared combat: two damage steps (first
/// strike, then regular - double strike deals in both), deathtouch lethality,
/// trample overflow, lifelink, per-blocker ordered damage assignment.
pub fn compute_preview(app: &App, room: &Room) -> CombatPreview {
    let Some(combat) = &room.combat else {
        return CombatPreview { rows: Vec::new(), life: BTreeMap::new(), commander: Vec::new() };
    };
    let active = room.active_seat;
    let mut rows: Vec<PreviewRow> = Vec::new();
    let mut life: BTreeMap<usize, i64> = BTreeMap::new();
    let mut commander: Vec<(usize, String, i64)> = Vec::new();
    let attacker_owner = |iid: &str| -> Option<usize> {
        room.players
            .iter()
            .find(|p| p.battlefield.iter().any(|c| c.iid == iid))
            .map(|p| p.seat)
    };

    for a in &combat.attackers {
        let Some(atk_card) = find_card(room, &a.iid) else { continue };
        let owner = attacker_owner(&a.iid).unwrap_or(active);
        let Some(def_seat) = resolved_defender(room, owner, a.defender_seat) else { continue };
        let atk = fighter(app, room, owner, atk_card);
        let blockers: Vec<Fighter> = combat
            .blocks
            .iter()
            .filter(|b| b.attacker_iid == a.iid)
            .filter_map(|b| find_card_owner(room, &b.blocker_iid))
            .map(|(seat, c)| fighter(app, room, seat, c))
            .collect();

        // Damage marked on each side across the two steps.
        let mut atk_taken = 0i64;
        let mut atk_dt = false; // took deathtouch damage
        let mut blk_taken: Vec<i64> = vec![0; blockers.len()];
        let mut blk_dt: Vec<bool> = vec![false; blockers.len()];
        let mut player_damage = 0i64;
        let mut lifelink_gain = 0i64; // attacker controller's gain
        let mut def_lifelink = 0i64; // defender side lifelink

        let step = |first_step: bool,
                        atk_taken: &mut i64,
                        atk_dt: &mut bool,
                        blk_taken: &mut Vec<i64>,
                        blk_dt: &mut Vec<bool>,
                        player_damage: &mut i64,
                        lifelink_gain: &mut i64,
                        def_lifelink: &mut i64| {
            let atk_alive = *atk_taken < atk.toughness && !(*atk_dt && *atk_taken > 0);
            let atk_swings = atk_alive && if first_step { atk.first || atk.double } else { !atk.first || atk.double };
            if atk_swings {
                if blockers.is_empty() {
                    *player_damage += atk.power;
                    if atk.lifelink {
                        *lifelink_gain += atk.power;
                    }
                } else {
                    // Assign in block order: lethal to each in turn.
                    let mut remaining = atk.power;
                    for (i, b) in blockers.iter().enumerate() {
                        if remaining <= 0 {
                            break;
                        }
                        let already_dead = blk_taken[i] >= b.toughness || (blk_dt[i] && blk_taken[i] > 0);
                        if already_dead {
                            continue;
                        }
                        // Lethal to each blocker in order; the leftover after
                        // the last blocker tramples through or is wasted.
                        let lethal = if atk.deathtouch { 1 } else { (b.toughness - blk_taken[i]).max(1) };
                        let assign = lethal.min(remaining);
                        blk_taken[i] += assign;
                        if atk.deathtouch && assign > 0 {
                            blk_dt[i] = true;
                        }
                        if atk.lifelink {
                            *lifelink_gain += assign;
                        }
                        remaining -= assign;
                    }
                    if atk.trample && remaining > 0 {
                        *player_damage += remaining;
                        if atk.lifelink {
                            *lifelink_gain += remaining;
                        }
                    }
                    // Without trample, leftover damage is simply wasted.
                }
            }
            for (i, b) in blockers.iter().enumerate() {
                let alive = blk_taken[i] < b.toughness && !(blk_dt[i] && blk_taken[i] > 0);
                let swings = alive && if first_step { b.first || b.double } else { !b.first || b.double };
                if swings {
                    *atk_taken += b.power;
                    if b.deathtouch && b.power > 0 {
                        *atk_dt = true;
                    }
                    if b.lifelink {
                        *def_lifelink += b.power;
                    }
                }
            }
        };
        // Snapshot life at the first-strike boundary: deaths from step one
        // silence a creature in step two, which the alive checks above read
        // off the running damage totals.
        step(true, &mut atk_taken, &mut atk_dt, &mut blk_taken, &mut blk_dt, &mut player_damage, &mut lifelink_gain, &mut def_lifelink);
        step(false, &mut atk_taken, &mut atk_dt, &mut blk_taken, &mut blk_dt, &mut player_damage, &mut lifelink_gain, &mut def_lifelink);

        let attacker_dies = atk_taken >= atk.toughness || (atk_dt && atk_taken > 0);
        let dead: Vec<(String, String)> = blockers
            .iter()
            .enumerate()
            .filter(|(i, b)| blk_taken[*i] >= b.toughness || (blk_dt[*i] && blk_taken[*i] > 0))
            .map(|(_, b)| (b.card.iid.clone(), b.card.name.clone()))
            .collect();

        if player_damage > 0 {
            *life.entry(def_seat).or_insert(0) -= player_damage;
            if atk_card.is_commander {
                commander.push((def_seat, a.iid.clone(), player_damage));
            }
        }
        if lifelink_gain > 0 {
            *life.entry(owner).or_insert(0) += lifelink_gain;
        }
        if def_lifelink > 0 {
            *life.entry(def_seat).or_insert(0) += def_lifelink;
        }

        rows.push(PreviewRow {
            attacker_iid: a.iid.clone(),
            attacker_name: atk_card.name.clone(),
            defender_seat: def_seat,
            player_damage,
            attacker_dies,
            dead_blockers: dead.iter().map(|(iid, _)| iid.clone()).collect(),
            dead_blocker_names: dead.into_iter().map(|(_, n)| n).collect(),
        });
    }

    CombatPreview { rows, life, commander }
}

/// Apply a computed preview to the room: life totals, commander damage, and
/// every death to its owner's graveyard. Returns human log lines.
pub fn apply_preview(room: &mut Room, preview: &CombatPreview) -> Vec<String> {
    let mut logs: Vec<String> = Vec::new();
    let mut dead: Vec<String> = Vec::new();
    for row in &preview.rows {
        if row.attacker_dies {
            dead.push(row.attacker_iid.clone());
        }
        dead.extend(row.dead_blockers.iter().cloned());
        if row.player_damage > 0 {
            let name = room
                .players
                .iter()
                .find(|p| p.seat == row.defender_seat)
                .map(|p| p.username.clone())
                .unwrap_or_else(|| format!("seat {}", row.defender_seat + 1));
            logs.push(format!(
                "{} deals {} damage to {}",
                row.attacker_name, row.player_damage, name
            ));
        }
    }
    for (seat, delta) in &preview.life {
        if let Some(p) = room.players.iter_mut().find(|p| p.seat == *seat) {
            p.life += delta;
        }
    }
    for (seat, commander_iid, amount) in &preview.commander {
        if let Some(p) = room.players.iter_mut().find(|p| p.seat == *seat) {
            let from_seat = room.active_seat;
            *p.cmd_damage.entry(from_seat).or_insert(0) += amount;
            *p.cmd_damage_by_commander.entry(commander_iid.clone()).or_insert(0) += amount;
        }
    }
    // Deaths: move each card to its owner's graveyard (tokens evaporate).
    for iid in dead {
        for p in room.players.iter_mut() {
            if let Some(pos) = p.battlefield.iter().position(|c| c.iid == iid) {
                let mut card = p.battlefield.remove(pos);
                let name = card.name.clone();
                if card.is_token {
                    logs.push(format!("{name} dies (token)"));
                } else {
                    card.tapped = false;
                    card.face_down = false;
                    card.counters.clear();
                    card.attached_to = None;
                    card.piled = false;
                    card.entered_turn = None;
                    p.graveyard.push(card);
                    logs.push(format!("{name} dies"));
                }
                break;
            }
        }
    }
    logs
}
