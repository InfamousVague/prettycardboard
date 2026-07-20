//! Turn order, the per-seat turn clock, and the auto-turn bookkeeping
//! (untap + draw) that runs when a seat's turn begins. Pure helpers over the
//! room's seating and clock fields; the dispatcher (`game::apply`) and the
//! room lifecycle (`ws`) call into these.

use crate::rooms::Room;

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
    if room.turn_started_ms > 0 {
        let seat = room.active_seat;
        if let Some(p) = room.players.iter_mut().find(|p| p.seat == seat) {
            p.turn_time_ms += (now - room.turn_started_ms).max(0);
        }
    }
    room.turn_started_ms = 0;
}

/// Start the turn clock for `seat` and count the turn they are beginning.
pub fn turn_clock_begin(room: &mut Room, seat: usize, now: i64) {
    if let Some(p) = room.players.iter_mut().find(|p| p.seat == seat) {
        p.turns_taken += 1;
    }
    room.turn_started_ms = now;
}

/// The opening-mulligan window: once every non-conceded seat has kept (a keep
/// or a concede can be the closing event), restart the active player's turn
/// clock — table-wide deliberation is not their turn time — and, under
/// auto-turn, fire the first untap/draw. Idempotent via first_turn_begun.
pub fn maybe_begin_first_turn(room: &mut Room, now: i64) -> Vec<String> {
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
    if room.auto_turn {
        auto_turn_begin(room, room.active_seat)
    } else {
        Vec::new()
    }
}

/// The free-mulligan allowance: 1 in 3+ player commander pods, else 0.
pub(super) fn free_first_mulls(room: &Room) -> u32 {
    if room.format == "commander" && room.players.len() >= 3 {
        1
    } else {
        0
    }
}

/// Auto-turn bookkeeping for the player whose turn is starting: untap their
/// battlefield and draw 1 — unless the first-turn skip applies (starting seat,
/// turn 1, standard or 2-player) or their library is empty.
pub fn auto_turn_begin(room: &mut Room, seat: usize) -> Vec<String> {
    let skip = room.turn_number == 1
        && seat == room.starting_seat
        && (room.format == "standard" || room.players.len() == 2);
    let Some(p) = room.players.iter_mut().find(|p| p.seat == seat) else {
        return Vec::new();
    };
    // Untap and draw are per-player conveniences, OFF by default (the client
    // syncs each player's choice via `auto.set`). A player who leaves them off
    // untaps and draws by hand.
    let do_untap = p.auto_untap;
    // The starting player's very first turn skips its draw (standard / 2-player).
    let do_draw = p.auto_draw && !skip;

    if do_untap {
        for c in p.battlefield.iter_mut() {
            c.tapped = false;
        }
    }

    let drew = if do_draw && !p.library.is_empty() {
        let card = p.library.remove(0);
        p.hand.push(card);
        p.hand_revealed = false;
        p.peeked.clear();
        true
    } else {
        false
    };
    let empty = do_draw && !drew; // wanted to draw but the library was empty

    if do_untap && drew {
        vec![format!("{} untaps and draws a card", p.username)]
    } else if do_untap && empty {
        vec![format!("{} untaps, no cards left to draw", p.username)]
    } else if do_untap {
        vec![format!("{} untaps", p.username)]
    } else if drew {
        vec![format!("{} draws a card", p.username)]
    } else {
        Vec::new()
    }
}
