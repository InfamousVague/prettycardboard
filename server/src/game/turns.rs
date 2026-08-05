//! Turn order, the per-seat turn clock, and the auto-turn bookkeeping
//! (untap + draw) that runs when a seat's turn begins. Pure helpers over the
//! room's seating and clock fields; the dispatcher (`game::apply`) and the
//! room lifecycle (`ws`) call into these.

use crate::rooms::Room;

/// A pause longer than this is treated as AFK after the first 30 seconds.
/// Frequent interactions still accumulate the player's real active turn time.
const MAX_INTERACTION_GAP_MS: i64 = 30_000;

fn active_interval_ms(previous: i64, now: i64) -> i64 {
    now.saturating_sub(previous).clamp(0, MAX_INTERACTION_GAP_MS)
}

/// Next occupied, non-conceded seat clockwise after `from`; true when it
/// wrapped past the lowest such seat (a new turn round). Falls back to all
/// occupied seats if everyone conceded (degenerate, but never panics).
pub fn next_occupied(room: &Room, from: usize) -> (usize, bool) {
    let mut seats: Vec<usize> = room
        .players
        .iter()
        .filter(|p| !p.conceded)
        .map(|p| p.seat)
        .collect();
    if seats.is_empty() {
        seats = room.players.iter().map(|p| p.seat).collect();
    }
    seats.sort_unstable();
    match seats.iter().find(|&&s| s > from) {
        Some(&s) => (s, false),
        None => (seats[0], true),
    }
}

/// Credit the elapsed turn time to the current active player. Call BEFORE
/// active_seat changes; safe when the clock never started (0).
pub fn turn_clock_credit(room: &mut Room, now: i64) {
    if room.turn_started_ms > 0 && room.turn_last_interaction_ms > 0 {
        let seat = room.active_seat;
        if let Some(p) = room.players.iter_mut().find(|p| p.seat == seat) {
            p.turn_time_ms += active_interval_ms(room.turn_last_interaction_ms, now);
        }
    }
    room.turn_started_ms = 0;
    room.turn_last_interaction_ms = 0;
}

/// Credit time only when the active player interacts. Long silent gaps are
/// capped, so leaving a table open cannot dominate their average turn time.
pub fn turn_clock_interaction(room: &mut Room, seat: usize, now: i64) {
    if room.turn_started_ms <= 0 || room.turn_last_interaction_ms <= 0 || room.active_seat != seat {
        return;
    }
    if let Some(p) = room.players.iter_mut().find(|p| p.seat == seat) {
        p.turn_time_ms += active_interval_ms(room.turn_last_interaction_ms, now);
        room.turn_last_interaction_ms = now;
    }
}

/// Start the turn clock for `seat` and count the turn they are beginning.
pub fn turn_clock_begin(room: &mut Room, seat: usize, now: i64) {
    if let Some(p) = room.players.iter_mut().find(|p| p.seat == seat) {
        p.turns_taken += 1;
        // A fresh turn is a fresh land drop.
        p.lands_this_turn = 0;
    }
    room.turn_started_ms = now;
    room.turn_last_interaction_ms = now;
}

/// The opening-mulligan window: once every non-conceded seat has kept (a keep
/// or a concede can be the closing event), restart the active player's turn
/// clock — table-wide deliberation is not their turn time — and, under
/// auto-turn, fire the first untap/draw. Idempotent via first_turn_begun.
pub fn maybe_begin_first_turn(app: &crate::App, room: &mut Room, now: i64) -> Vec<String> {
    if room.first_turn_begun
        || !room.started
        || room.turn_number != 1
        || !room
            .players
            .iter()
            .filter(|p| !p.conceded)
            .all(|p| p.mulligan.as_ref().map(|m| m.state == "kept").unwrap_or(true))
    {
        return Vec::new();
    }
    room.first_turn_begun = true;
    room.turn_started_ms = now;
    room.turn_last_interaction_ms = now;
    if room.auto_turn {
        let seat = room.active_seat;
        let (mut logs, drew) = auto_turn_begin(room, seat);
        logs.extend(crate::rules::fire_draw_triggers(app, room, seat, drew));
        logs
    } else {
        Vec::new()
    }
}

/// The free-mulligan allowance: the host's override if set, else 1 in 3+ player
/// commander pods and 0 elsewhere.
pub(super) fn free_first_mulls(room: &Room) -> u32 {
    // Unlimited: every mulligan is free, so nothing is ever owed. Saturating
    // arithmetic downstream turns this into "bottom zero cards, always".
    if room.settings.unlimited_mulligans {
        return u32::MAX;
    }
    if let Some(free) = room.settings.free_mulligans {
        return free;
    }
    if crate::rooms::format_has_commander(&room.format) && room.players.len() >= 3 {
        1
    } else {
        0
    }
}

/// Auto-turn bookkeeping for the player whose turn is starting: untap their
/// battlefield and draw 1 — unless the first-turn skip applies (starting seat,
/// turn 1, standard or 2-player) or their library is empty.
///
/// Returns the log lines and how many cards were drawn: the turn draw is a
/// draw like any other, and the caller (which has `app`) fires its triggers.
pub fn auto_turn_begin(room: &mut Room, seat: usize) -> (Vec<String>, usize) {
    let skip = room.turn_number == 1
        && seat == room.starting_seat
        && match room.settings.skip_first_draw {
            Some(force) => force,
            None => !crate::rooms::format_has_commander(&room.format) || room.players.len() == 2,
        };
    // Untap and draw are per-player conveniences, OFF by default (the client
    // syncs each player's choice via `auto.set`). A player who leaves them off
    // untaps and draws by hand. ENFORCED tables run both for everyone, Arena
    // style - the rules forbid manual untapping there, so the engine owes it.
    let enforced = crate::rules::enforced(room);
    // Some games have no untap step, because rotation is a STATE there rather
    // than a spent resource: sideways is Defense Position in Yu-Gi-Oh and
    // SUPPRESSED in Mood Swings. Straightening the board every turn would
    // silently stand every set monster up into Attack Position, and quietly
    // un-suppress a mood back to its printed value mid-round.
    let rotation_is_position = matches!(room.game.as_str(), "yugioh" | "moodswings");
    let Some(pi) = room.players.iter().position(|p| p.seat == seat) else {
        return (Vec::new(), 0);
    };
    // A game with one common pile (Mood Swings) draws off the table's box, not
    // off this seat - whose own library is empty there by design. Identity for
    // every other game, so nothing else changes.
    let src = crate::game::pile_index(room, pi);
    let p = &mut room.players[pi];
    let do_untap = (p.auto_untap || enforced) && !rotation_is_position;
    // The starting player's very first turn skips its draw (standard / 2-player).
    let do_draw = (p.auto_draw || enforced) && !skip;

    if do_untap {
        for c in p.battlefield.iter_mut() {
            c.tapped = false;
        }
    }

    let taken = if do_draw && !room.players[src].library.is_empty() {
        room.players[src].peeked.clear();
        Some(room.players[src].library.remove(0))
    } else {
        None
    };
    let drew = taken.is_some();
    let p = &mut room.players[pi];
    if let Some(card) = taken {
        p.hand.push(card);
        p.cards_drawn += 1;
        p.hand_revealed = false;
        p.peeked.clear();
    }
    let empty = do_draw && !drew; // wanted to draw but the library was empty

    let logs = if do_untap && drew {
        vec![format!("{} untaps and draws a card", p.username)]
    } else if do_untap && empty {
        vec![format!("{} untaps, no cards left to draw", p.username)]
    } else if do_untap {
        vec![format!("{} untaps", p.username)]
    } else if drew {
        vec![format!("{} draws a card", p.username)]
    } else {
        Vec::new()
    };
    (logs, usize::from(drew))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_intervals_cap_afk_gaps() {
        assert_eq!(active_interval_ms(1_000, 11_000), 10_000);
        assert_eq!(active_interval_ms(1_000, 301_000), MAX_INTERACTION_GAP_MS);
        assert_eq!(active_interval_ms(11_000, 1_000), 0);
    }
}
