//! The mood: a bot that plays Mood Swings rather than Magic or Yu-Gi-Oh.
//!
//! Mood Swings is a five-minute game with almost nothing in it, and that is
//! the point: no mana, no combat, no permanents. A TURN is "play one mood, or
//! pass"; a ROUND is one turn each; the highest printed total takes the round;
//! first to three rounds wins. So the entire decision this brain makes is
//! WHICH mood to spend, and that is a real decision - the big ones are the
//! ones you only get to play once.
//!
//! Card TEXT is out of reach, exactly as it is at a duel table: the server has
//! no oracle for "if the discard pile has at least one card in it, this mood's
//! value becomes [6][1]", so the bot never pretends to resolve one. It plays by
//! the PRINTED value, which is the number on the card whatever the text does
//! about it, and lets the humans at the table read the rest aloud.
//!
//! Two things this brain deliberately does NOT do:
//!
//! * Judge the round. Whether a round was won is a table-wide comparison, and
//!   any bot that both judged and cleaned up would race the others - the first
//!   seat to sweep its moods into the discard would leave every later seat
//!   comparing against a board that had already gone. Rounds stay the manual
//!   counter the game def says they are.
//! * Concede. `life` is ROUNDS here and starts at zero counting UP, so the
//!   "out of life" check every other brain opens with would have a Mood Swings
//!   bot concede on turn one.
//!
//! What it does do is keep its own side honest: last round's mood goes to the
//! discard at the start of its turn, one new mood goes down, and its Score
//! counter is set to what its side of the table is actually printing.

use super::*;

// ------------------------------------------------------------------ reading

/// The moods I have in play. Nothing attaches in this game; the guard just
/// keeps a stray marker from being counted as a mood.
fn my_moods(me: &Player) -> Vec<&Card> {
    me.battlefield.iter().filter(|c| c.attached_to.is_none()).collect()
}

/// What a side of the table is printing right now. `mood_value` already reads
/// a sideways card as SUPPRESSED, which is worth [0].
fn total_of(p: &Player) -> i64 {
    p.battlefield.iter().filter(|c| c.attached_to.is_none()).map(mood_value).sum()
}

/// The best total anyone else has on the table - the number this turn is
/// playing to beat.
fn best_rival(room: &Room, me: &Player) -> i64 {
    room.players
        .iter()
        .filter(|p| p.seat != me.seat && !p.conceded)
        .map(total_of)
        .max()
        .unwrap_or(0)
}

/// A mood's printed value while it is still in hand (never suppressed there).
fn hand_value(card: &Card) -> i64 {
    mood_attr(card).map(|a| a.v).unwrap_or(0)
}

// ------------------------------------------------------------------ placing

/// Mood Swings has no printed playmat - moods just sit in front of you - so
/// the bot lays them out in a readable row rather than dropping them all on
/// one spot. A seat plays one mood per round and sweeps it at the start of its
/// next turn, so the row rarely holds more than a card or two.
const ROW_Y: f64 = 0.5;
const ROW_X0: f64 = 0.08;
const ROW_STEP: f64 = 0.09;

fn next_slot(me: &Player) -> (f64, f64) {
    let n = my_moods(me).len() as f64;
    ((ROW_X0 + ROW_STEP * n).min(0.92), ROW_Y)
}

// --------------------------------------------------------------------- turn

/// One decision for a bot at a Mood Swings table. There is no out-of-turn play
/// in this game at all - no responses, no blocks, nothing to settle - so off
/// turn the bot simply waits.
pub(crate) fn mood_decide(room: &Room, me: &Player, mind: &mut BotMind, now: i64) -> Decision {
    let mut say: Vec<String> = Vec::new();
    // Three rounds is the game. Said once, and it does NOT stop the bot taking
    // its turns - nothing here declares the match over, so a table that keeps
    // playing must not find a seat that has quietly stopped passing.
    if me.life >= 3 && !mind.said_win {
        mind.said_win = true;
        say.push(win_line());
    }
    if let Some(action) = mind.queue.pop_front() {
        return Decision { action: Some(action), say, fast: true };
    }
    if room.active_seat != me.seat {
        return Decision { action: None, say, fast: false };
    }

    let tn = room.turn_number;
    if mind.turn_started.map(|(t, _)| t) != Some(tn) {
        mind.turn_started = Some((tn, now));
        mind.mood_played = false;
        mind.mood_swept = false;
        return Decision { action: None, say, fast: false };
    }
    let started = mind.turn_started.map(|(_, ts)| ts).unwrap_or(now);
    if now - started < TURN_MIN_THINK_MS {
        return Decision { action: None, say, fast: false };
    }
    if now - started > TURN_FAILSAFE_MS {
        return Decision { action: Some(Action::TurnPass), say, fast: false };
    }

    // 1. Last round's mood goes to the discard. My turn coming round again IS
    //    the new round - one turn each - so anything still in front of me was
    //    scored a round ago. One card per tick, so the table sees it happen.
    if !mind.mood_played {
        if let Some(stale) = my_moods(me).first() {
            let iid = stale.iid.clone();
            if !mind.mood_swept {
                mind.mood_swept = true;
                say.push(mood_clear_line());
            }
            return Decision {
                action: Some(Action::CardMove {
                    iid,
                    to: Zone::Graveyard,
                    x: None,
                    y: None,
                    index: None,
                    face_down: false,
                }),
                say,
                fast: true,
            };
        }
    }

    // 2. One mood, played face up in front of me.
    if !mind.mood_played {
        if let Some(mut d) = play_mood(room, me, mind) {
            let mut merged = say;
            merged.extend(d.say);
            d.say = merged;
            return d;
        }
    }

    // 3. Keep the Score counter honest before handing over the turn. The
    //    playmat shows the printed sum as an aid, but the counter is what the
    //    table reads, and a bot that never touched it would just sit at zero.
    let printed = total_of(me);
    if me.poison != printed {
        return Decision {
            action: Some(Action::PoisonAdd { delta: printed - me.poison }),
            say,
            fast: true,
        };
    }
    Decision { action: Some(Action::TurnPass), say, fast: false }
}

/// Which mood to spend. The whole game is here: every mood is playable, so
/// there is no question of affordability, only of whether this is the round to
/// burn the big one on.
fn play_mood(room: &Room, me: &Player, mind: &mut BotMind) -> Option<Decision> {
    let mut hand: Vec<&Card> = me.hand.iter().filter(|c| mood_attr(c).is_some()).collect();
    if hand.is_empty() {
        return None;
    }
    hand.sort_by_key(|c| hand_value(*c));

    let beat = best_rival(room, me);
    let pick = match style_of(me) {
        // Swings for the round every time. Loud, and it runs out of big moods.
        Style::Aggro => *hand.last()?,
        // Wins by the smallest margin it can, which is how you still have a
        // [8] left in round three. Falls back to its best when nothing in hand
        // can take the round - losing cheap beats losing expensively.
        Style::Defensive => {
            *hand.iter().find(|c| hand_value(c) > beat).unwrap_or(hand.last()?)
        }
        // Plays the middle of its hand: never the blowout, never the dud.
        Style::Casual => hand[hand.len() / 2],
    };

    let (x, y) = next_slot(me);
    mind.mood_played = true;
    Some(Decision {
        action: Some(Action::CardMove {
            iid: pick.iid.clone(),
            to: Zone::Battlefield,
            x: Some(x),
            y: Some(y),
            index: None,
            face_down: false,
        }),
        say: vec![mood_play_line(&pick.name, hand_value(pick))],
        fast: false,
    })
}
