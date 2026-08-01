//! Bookkeeping the game forces on the bot: mulligans.

use super::*;

// ----------------------------------------------------------------- mulligan

/// The free-mulligan allowance for this room (mirrors turns.rs).
pub(crate) fn free_mulls(room: &Room) -> u32 {
    if room.settings.unlimited_mulligans {
        return u32::MAX;
    }
    if let Some(n) = room.settings.free_mulligans {
        return n;
    }
    let commander_ish = crate::rooms::format_has_commander(&room.format);
    if commander_ish && room.players.len() >= 3 {
        1
    } else {
        0
    }
}

/// XMage's one-line rule, scaled to the dealt hand: keep 2..=n-2 lands in a
/// hand of n (minimum bound 1 for tiny hands); never mulligan below 5 cards.
/// Returns the action plus an optional chat line.
pub(crate) fn mulligan_action(room: &Room, me: &Player, taken: u32, tier: i32) -> (Action, Option<String>) {
    let hand = me.hand.len();
    let lands = me.hand.iter().filter(|c| is_land(c)).count();
    // Easy bots keep almost anything (the widest land window and no curve
    // check); normal wants an early play; hard wants a play by turn two or
    // enough lands to make anything castable.
    let lo = if tier < 0 || hand <= 5 { 1 } else { 2 };
    let hi = if tier < 0 { hand.saturating_sub(1).max(1) } else { hand.saturating_sub(2).max(lo) };
    let curve_ok = if tier < 0 || hand <= 5 {
        true
    } else if tier == 0 {
        me.hand.iter().any(|c| !is_land(c) && mana_value(c) <= 3)
    } else {
        me.hand.iter().any(|c| !is_land(c) && mana_value(c) <= 2) || lands >= 4
    };
    let full = crate::game::effective_hand_size(room);
    let can_dig = hand > 5 || room.settings.unlimited_mulligans;
    if (!(lo..=hi).contains(&lands) || !curve_ok) && can_dig && taken < 3 {
        // Vancouver draws one fewer next hand; London re-draws full then
        // bottoms, so "down to" reads off the owed count either way.
        let owed = (taken + 1).saturating_sub(free_mulls(room)) as usize;
        let down_to = full.saturating_sub(owed).max(1);
        return (Action::MullTake, Some(mull_line(down_to)));
    }

    // Keeping: London owes exactly max(taken - free, 0) cards to the bottom;
    // Vancouver owes none. Bottom the most expensive spells first, holding on
    // to three lands where possible.
    let owed = if crate::game::is_vancouver(room) {
        0
    } else {
        taken.saturating_sub(free_mulls(room)) as usize
    };
    let mut ranked: Vec<(u8, i64, String)> = Vec::new();
    let mut lands_seen = 0u32;
    for c in &me.hand {
        if is_land(c) {
            lands_seen += 1;
            // The first three lands are bottomed only as a last resort.
            let tier = if lands_seen <= 3 { 2 } else { 1 };
            ranked.push((tier, 0, c.iid.clone()));
        } else {
            ranked.push((0, -mana_value(c), c.iid.clone()));
        }
    }
    ranked.sort();
    let bottom_iids: Vec<String> =
        ranked.into_iter().take(owed.min(me.hand.len())).map(|(_, _, iid)| iid).collect();
    (Action::MullKeep { bottom_iids }, Some(keep_line()))
}

