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

use crate::oracle::{self, OracleCard, TriggerEffect, TriggerWhen};
use crate::rooms::{Card, Combat, CombatPreview, PendingTrigger, Player, PreviewRow, Room};
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
        .filter(|p| {
            if cda.opponents { p.seat != controller && !p.conceded } else { p.seat == controller }
        })
        .flat_map(|p| p.battlefield.iter())
        .filter(|c| facts(app, c).map(|f| f.type_line.contains(&want)).unwrap_or(false))
        .count() as i64
}

/// Effective power/toughness: oracle printed stats (a `*` counted from its
/// defining ability), +N/+N-style counters, and (pass B) anthems projected by
/// the controller's other permanents. Tokens and unknowns fall back to the
/// instance's own printed strings.
pub fn effective_pt(app: &App, room: &Room, card: &Card) -> (i64, i64) {
    let stat = |s: &Option<String>| s.as_deref().and_then(|v| v.trim().parse::<i64>().ok());
    // The seat this permanent sits under: both the `*` count and the anthem
    // fold below are asked from its controller's point of view.
    let controller =
        room.players.iter().find(|pl| pl.battlefield.iter().any(|c| c.iid == card.iid));
    let (mut p, mut t) = match facts(app, card) {
        Some(f) => {
            // A `*` power is defined by an ability, not printed. Counting it
            // is what lets those creatures fight at all - left unparsed it
            // fell through as 0, and a 0-power creature never attacks.
            let starred = f
                .cda
                .as_ref()
                .and_then(|cda| controller.map(|pl| cda_count(app, room, pl.seat, cda)));
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
    // Anthems: only creatures grow, and only from their own controller's
    // battlefield ("creatures you control").
    if is_creature(app, card) {
        if let Some(controller) = controller {
            for source in &controller.battlefield {
                let Some(f) = facts(app, source) else { continue };
                for s in &f.statics {
                    if let crate::oracle::StaticEffect::Anthem { power, toughness, others_only } = s
                    {
                        if *others_only && source.iid == card.iid {
                            continue;
                        }
                        p += power;
                        t += toughness;
                    }
                }
            }
        }
    }
    (p, t)
}

/// The generic cost of a spell for `player` after their battlefield cost
/// cuts ("<type> spells you cast cost {N} less"). Colored pips are never
/// reduced; the result never goes below zero.
pub fn reduced_generic(app: &App, player: &Player, spell: &OracleCard, base: i64) -> i64 {
    let mut cut = 0i64;
    let line = spell.type_line.to_lowercase();
    for c in &player.battlefield {
        let Some(f) = facts(app, c) else { continue };
        for s in &f.statics {
            if let crate::oracle::StaticEffect::CostCut { filter, n } = s {
                let applies = filter.as_ref().map(|w| line.contains(w.as_str())).unwrap_or(true);
                if applies {
                    cut += n;
                }
            }
        }
    }
    (base - cut).max(0)
}

/// May `blocker` legally block `attacker` (pass B evasion)? Unknown
/// attackers are permissive; attacker-imposed requirements (flying, fear,
/// protection...) need the blocker to PROVE it qualifies - the same stance
/// v2 took for flying.
pub fn may_block(app: &App, room: &Room, blocker: &Card, attacker: &Card) -> Result<(), String> {
    let Some(atk) = facts(app, attacker) else {
        return Ok(());
    };
    let blk = facts(app, blocker);
    let blk_has = |kw: &str| blk.as_ref().map(|f| f.has(kw)).unwrap_or(false);
    let blk_artifact =
        blk.as_ref().map(|f| f.type_line.contains("Artifact")).unwrap_or(false);
    let blk_colors: Vec<char> = blk.as_ref().map(|f| f.colors.clone()).unwrap_or_default();
    let a = attacker.name.as_str();
    if atk.unblockable {
        return Err(format!("{a} can't be blocked"));
    }
    if atk.has("flying") && !blk_has("flying") && !blk_has("reach") {
        return Err("only flying or reach can block a flyer".to_string());
    }
    if atk.has("shadow") && !blk_has("shadow") {
        return Err(format!("{a} has shadow - only shadow can block it"));
    }
    if !atk.has("shadow") && blk_has("shadow") {
        return Err("a shadow creature can only block shadow".to_string());
    }
    if atk.has("horsemanship") && !blk_has("horsemanship") {
        return Err(format!("{a} has horsemanship - only horsemanship can block it"));
    }
    if atk.has("fear") && !blk_artifact && !blk_colors.contains(&'B') {
        return Err(format!("{a} has fear - only artifact or black creatures block it"));
    }
    if atk.has("intimidate")
        && !blk_artifact
        && !blk_colors.iter().any(|c| atk.colors.contains(c))
    {
        return Err(format!(
            "{a} has intimidate - only artifacts or creatures sharing its color block it"
        ));
    }
    if atk.has("skulk") {
        let (bp, _) = effective_pt(app, room, blocker);
        let (ap, _) = effective_pt(app, room, attacker);
        if bp > ap {
            return Err(format!("{a} has skulk - blockers with greater power can't block it"));
        }
    }
    if !atk.protection_from.is_empty() && blk_colors.iter().any(|c| atk.protection_from.contains(c))
    {
        let colors: String = atk
            .protection_from
            .iter()
            .map(|c| match c {
                'W' => "white",
                'U' => "blue",
                'B' => "black",
                'R' => "red",
                'G' => "green",
                _ => "?",
            })
            .collect::<Vec<_>>()
            .join("/");
        return Err(format!("{a} has protection from {colors}"));
    }
    Ok(())
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
            let generic = reduced_generic(app, me, &f, f.generic);
            solve_payment(app, me, generic, &f.pips, paylist).map(|_| ())
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
                    let generic = reduced_generic(app, me, &f, f.generic + tax);
                    solve_payment(app, me, generic, &f.pips, None).map(|_| ())
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
            // Evasion (pass B): flying, fear, intimidate, shadow, skulk,
            // horsemanship, unblockable, protection from color.
            if let Some(atk) = find_card(room, attacker_iid) {
                if let Err(msg) = may_block(app, room, blocker, atk) {
                    return Err(err(msg));
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

// --------------------------------------------------- replacements (pass C)

/// Apply enters-the-battlefield replacements to a card that just arrived:
/// "enters tapped" and "enters with N counters". Returns log lines.
pub fn apply_enters_replacements(app: &App, room: &mut Room, iid: &str) -> Vec<String> {
    if !enforced(room) {
        return Vec::new();
    }
    let mut logs = Vec::new();
    for p in room.players.iter_mut() {
        let Some(card) = p.battlefield.iter_mut().find(|c| c.iid == iid) else { continue };
        let Some(f) = card.scryfall_id.as_deref().and_then(|sid| oracle::get(app, sid)) else {
            return logs;
        };
        if f.enters_tapped && !card.tapped {
            card.tapped = true;
            logs.push(format!("{} enters tapped", card.name));
        }
        if let Some((kind, n)) = &f.enters_counters {
            *card.counters.entry(kind.clone()).or_insert(0) += n;
            let what = if *n == 1 {
                format!("a {kind} counter")
            } else {
                format!("{n} {kind} counters")
            };
            logs.push(format!("{} enters with {what}", card.name));
        }
        break;
    }
    logs
}

/// Does this dying card's own text route it to exile instead of the
/// graveyard? ("If ~ would die, exile it instead.")
pub fn dies_to_exile(app: &App, card: &Card) -> bool {
    facts(app, card).map(|f| f.dies_to_exile).unwrap_or(false)
}

// ------------------------------------------------------- cascade (pass C)

/// Reveal cards from the top of `seat`'s library until a nonland card with
/// mana value strictly below `n` appears. The hit rides the stack revealed
/// and free to cast (resolve it to the battlefield, or decline it anywhere
/// else); everything else goes to the bottom in a random order. Unknown
/// cards are set aside with the lands - a cascade never wedges on a missing
/// oracle row. Returns log lines.
pub fn run_cascade(app: &App, room: &mut Room, pi: usize, n: i64, source: &str) -> Vec<String> {
    let mut logs = Vec::new();
    let owner = room.players[pi].user_id.clone();
    let username = room.players[pi].username.clone();
    let mut aside: Vec<Card> = Vec::new();
    let mut hit: Option<Card> = None;
    let mut revealed_names: Vec<String> = Vec::new();
    {
        let p = &mut room.players[pi];
        while !p.library.is_empty() {
            let card = p.library.remove(0);
            revealed_names.push(card.name.clone());
            let f = card.scryfall_id.as_deref().and_then(|sid| oracle::get(app, sid));
            let is_hit = f.map(|f| !f.is_land() && f.mv < n).unwrap_or(false);
            if is_hit {
                hit = Some(card);
                break;
            }
            aside.push(card);
        }
        // The rest go to the bottom in a random order.
        let mut order: Vec<Card> = std::mem::take(&mut aside);
        for i in (1..order.len()).rev() {
            order.swap(i, rand::random_range(0..=i));
        }
        let bottomed = order.len();
        for card in order {
            p.library.push(card);
        }
        p.peeked.clear();
        if !revealed_names.is_empty() {
            logs.push(format!(
                "{username} cascades for {n} ({source}): reveals {}",
                revealed_names.join(", ")
            ));
        } else {
            logs.push(format!("{username} cascades for {n} ({source}): the library is empty"));
        }
        if bottomed > 0 {
            logs.push(format!(
                "{bottomed} revealed {} to the bottom in a random order",
                if bottomed == 1 { "card goes" } else { "cards go" }
            ));
        }
    }
    if let Some(mut card) = hit {
        card.revealed = true;
        card.tapped = false;
        card.face_down = false;
        let name = card.name.clone();
        room.stack.push(crate::rooms::StackEntry { owner, card, target_iid: None });
        room.stack_passed.clear();
        room.stack_changed_ms = crate::now_ms();
        logs.push(format!(
            "{name} rides the stack free to cast (resolve it to the battlefield, or decline)"
        ));
    }
    logs
}

// ------------------------------------------------------- triggers (pass A)

/// Queue every `when`-kind trigger printed on card `iid` as a prompt for its
/// controller. The card is looked up in every zone (a dies trigger's source
/// is already in the graveyard when it fires). Returns log lines; freeform
/// rooms and trigger-less cards return nothing.
pub fn fire_card_triggers(app: &App, room: &mut Room, when: TriggerWhen, iid: &str) -> Vec<String> {
    if !enforced(room) {
        return Vec::new();
    }
    let Some((owner, seat, card)) = room.players.iter().find_map(|p| {
        [&p.battlefield, &p.graveyard, &p.exile, &p.command, &p.hand]
            .into_iter()
            .find_map(|zone| zone.iter().find(|c| c.iid == iid))
            .map(|c| (p.user_id.clone(), p.seat, c.clone()))
    }) else {
        return Vec::new();
    };
    let Some(facts) = facts(app, &card) else {
        return Vec::new();
    };
    let mut logs = Vec::new();
    for trigger in facts.triggers.iter().filter(|t| t.when == when) {
        logs.push(push_trigger(room, &owner, seat, &card.iid, &card.name, trigger));
    }
    logs
}

/// Queue upkeep/end-step triggers across one seat's battlefield.
pub fn fire_phase_triggers(
    app: &App,
    room: &mut Room,
    when: TriggerWhen,
    seat: usize,
) -> Vec<String> {
    if !enforced(room) {
        return Vec::new();
    }
    let Some(player) = room.players.iter().find(|p| p.seat == seat) else {
        return Vec::new();
    };
    let owner = player.user_id.clone();
    let sources: Vec<(String, String, Vec<crate::oracle::Trigger>)> = player
        .battlefield
        .iter()
        .filter_map(|c| {
            let f = facts(app, c)?;
            let matching: Vec<crate::oracle::Trigger> =
                f.triggers.iter().filter(|t| t.when == when).cloned().collect();
            (!matching.is_empty()).then(|| (c.iid.clone(), c.name.clone(), matching))
        })
        .collect();
    let mut logs = Vec::new();
    for (iid, name, triggers) in sources {
        for trigger in &triggers {
            logs.push(push_trigger(room, &owner, seat, &iid, &name, trigger));
        }
    }
    logs
}

fn push_trigger(
    room: &mut Room,
    owner: &str,
    seat: usize,
    source_iid: &str,
    source_name: &str,
    trigger: &crate::oracle::Trigger,
) -> String {
    room.pending_triggers.push(PendingTrigger {
        id: crate::hex_id(6),
        owner: owner.to_string(),
        seat,
        source_iid: source_iid.to_string(),
        source_name: source_name.to_string(),
        when: trigger.when,
        effects: trigger.effects.clone(),
        text: trigger.text.clone(),
        auto: trigger.auto(),
        deadline: crate::now_ms() + crate::game::TRIGGER_CHOICE_MS,
    });
    format!("Trigger: {source_name} — {}", trigger.text)
}

/// A short human phrase for a trigger's effect list ("draw a card and gain 2
/// life"), used by prompts, logs, and bot chat.
pub fn effects_summary(effects: &[TriggerEffect]) -> String {
    let part = |e: &TriggerEffect| -> String {
        match e {
            TriggerEffect::Draw { n } if *n == 1 => "draw a card".to_string(),
            TriggerEffect::Draw { n } => format!("draw {n} cards"),
            TriggerEffect::GainLife { n } => format!("gain {n} life"),
            TriggerEffect::LoseLife { n } => format!("lose {n} life"),
            TriggerEffect::EachOpponentLoses { n } => format!("each opponent loses {n} life"),
            TriggerEffect::SelfCounters { counter, n } if *n == 1 => {
                format!("put a {counter} counter on it")
            }
            TriggerEffect::SelfCounters { counter, n } => {
                format!("put {n} {counter} counters on it")
            }
            TriggerEffect::Token { name, power, toughness, count, .. } if *count == 1 => {
                format!("create a {power}/{toughness} {name} token")
            }
            TriggerEffect::Token { name, power, toughness, count, .. } => {
                format!("create {count} {power}/{toughness} {name} tokens")
            }
            TriggerEffect::Manual => "resolve by hand".to_string(),
        }
    };
    effects.iter().map(part).collect::<Vec<_>>().join(" and ")
}

/// Apply an answered trigger's parsed effects to the room. Returns log lines.
/// Effects apply best-effort against CURRENT state: a source that left the
/// battlefield just skips its counters, an empty library stops a draw.
pub fn apply_trigger_effects(room: &mut Room, t: &PendingTrigger) -> Vec<String> {
    let mut logs = Vec::new();
    let Some(pi) = room.players.iter().position(|p| p.user_id == t.owner) else {
        return logs;
    };
    let turn = room.turn_number;
    for effect in &t.effects {
        match effect {
            TriggerEffect::Draw { n } => {
                let p = &mut room.players[pi];
                let mut drew = 0;
                for _ in 0..*n {
                    if p.library.is_empty() {
                        break;
                    }
                    let card = p.library.remove(0);
                    p.hand.push(card);
                    p.cards_drawn += 1;
                    drew += 1;
                }
                if drew > 0 {
                    p.hand_revealed = false;
                    p.peeked.clear();
                    let plural =
                        if drew == 1 { "a card".to_string() } else { format!("{drew} cards") };
                    logs.push(format!("{} draws {plural} ({})", p.username, t.source_name));
                }
            }
            TriggerEffect::GainLife { n } => {
                let p = &mut room.players[pi];
                p.life += n;
                logs.push(format!("{} gains {n} life ({})", p.username, t.source_name));
            }
            TriggerEffect::LoseLife { n } => {
                let p = &mut room.players[pi];
                p.life -= n;
                logs.push(format!("{} loses {n} life ({})", p.username, t.source_name));
            }
            TriggerEffect::EachOpponentLoses { n } => {
                let owner_seat = room.players[pi].seat;
                for p in room.players.iter_mut() {
                    if p.seat != owner_seat && !p.conceded {
                        p.life -= n;
                    }
                }
                logs.push(format!("each opponent loses {n} life ({})", t.source_name));
            }
            TriggerEffect::SelfCounters { counter, n } => {
                let p = &mut room.players[pi];
                if let Some(card) = p.battlefield.iter_mut().find(|c| c.iid == t.source_iid) {
                    *card.counters.entry(counter.clone()).or_insert(0) += n;
                    let plural = if *n == 1 {
                        format!("a {counter} counter")
                    } else {
                        format!("{n} {counter} counters")
                    };
                    logs.push(format!("{} gets {plural}", t.source_name));
                }
            }
            TriggerEffect::Token { name, power, toughness, count, tapped } => {
                // Tokens fan out beside the source (or mid-board when it left).
                let (sx, sy) = room.players[pi]
                    .battlefield
                    .iter()
                    .find(|c| c.iid == t.source_iid)
                    .map(|c| (c.x, c.y))
                    .unwrap_or((0.4, 0.55));
                let p = &mut room.players[pi];
                for k in 0..*count {
                    let token = Card {
                        iid: crate::hex_id(8),
                        scryfall_id: None,
                        name: name.clone(),
                        image_url: None,
                        tapped: *tapped,
                        face_down: false,
                        counters: BTreeMap::new(),
                        x: (sx + 0.05 + 0.03 * k as f64).min(0.95),
                        y: sy,
                        is_token: true,
                        power: Some(power.to_string()),
                        toughness: Some(toughness.to_string()),
                        attached_to: None,
                        piled: false,
                        is_commander: false,
                        revealed: false,
                        transformed: false,
                        entered_turn: Some(turn),
                    };
                    p.battlefield.push(token);
                }
                let what = if *count == 1 {
                    format!("a {power}/{toughness} {name} token")
                } else {
                    format!("{count} {power}/{toughness} {name} tokens")
                };
                logs.push(format!("{} creates {what} ({})", p.username, t.source_name));
            }
            TriggerEffect::Manual => {}
        }
    }
    logs
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
    /// Combat damage TO this creature is prevented (pass C shields).
    shield_to: bool,
    /// Combat damage BY this creature is prevented.
    shield_by: bool,
}

fn fighter<'a>(app: &App, room: &Room, card: &'a Card) -> Fighter<'a> {
    let (power, toughness) = effective_pt(app, room, card);
    let f = facts(app, card);
    Fighter {
        card,
        power,
        toughness,
        first: has_kw(app, card, "first strike"),
        double: has_kw(app, card, "double strike"),
        deathtouch: has_kw(app, card, "deathtouch"),
        trample: has_kw(app, card, "trample"),
        lifelink: has_kw(app, card, "lifelink"),
        shield_to: f.as_ref().map(|f| f.prevent_combat_to).unwrap_or(false),
        shield_by: f.as_ref().map(|f| f.prevent_combat_by).unwrap_or(false),
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
        let atk = fighter(app, room, atk_card);
        let blockers: Vec<Fighter> = combat
            .blocks
            .iter()
            .filter(|b| b.attacker_iid == a.iid)
            .filter_map(|b| find_card(room, &b.blocker_iid))
            .map(|c| fighter(app, room, c))
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
            let atk_swings = atk_alive
                && !atk.shield_by
                && if first_step { atk.first || atk.double } else { !atk.first || atk.double };
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
                        // A shielded blocker soaks the assignment but takes
                        // nothing (pass C damage prevention).
                        if b.shield_to {
                            let assign = (b.toughness - blk_taken[i]).max(1).min(remaining);
                            remaining -= assign;
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
                let swings = alive
                    && !b.shield_by
                    && if first_step { b.first || b.double } else { !b.first || b.double };
                if swings && !atk.shield_to {
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
/// every death to its owner's graveyard (dies triggers fire for each).
/// Returns human log lines.
pub fn apply_preview(app: &App, room: &mut Room, preview: &CombatPreview) -> Vec<String> {
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
    // Deaths: move each card to its owner's graveyard (tokens evaporate;
    // a dies-to-exile replacement routes to exile and silences the death).
    let mut died: Vec<String> = Vec::new();
    for iid in dead {
        // A dead card's table marker dies with it.
        room.marks.remove(&iid);
        for p in room.players.iter_mut() {
            if let Some(pos) = p.battlefield.iter().position(|c| c.iid == iid) {
                let mut card = p.battlefield.remove(pos);
                let name = card.name.clone();
                let exile_instead = card
                    .scryfall_id
                    .as_deref()
                    .and_then(|sid| oracle::get(app, sid))
                    .map(|f| f.dies_to_exile)
                    .unwrap_or(false);
                if card.is_token {
                    logs.push(format!("{name} dies (token)"));
                } else {
                    card.tapped = false;
                    card.face_down = false;
                    card.counters.clear();
                    card.attached_to = None;
                    card.piled = false;
                    card.entered_turn = None;
                    if exile_instead {
                        p.exile.push(card);
                        logs.push(format!("{name} is exiled instead of dying (replacement)"));
                    } else {
                        p.graveyard.push(card);
                        logs.push(format!("{name} dies"));
                        died.push(iid.clone());
                    }
                }
                break;
            }
        }
    }
    for iid in died {
        logs.extend(fire_card_triggers(app, room, TriggerWhen::Dies, &iid));
    }
    logs
}
