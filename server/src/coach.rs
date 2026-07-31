//! The rules coach: a Magic teacher sitting behind the player's shoulder.
//!
//! # Why this advises instead of enforcing
//!
//! PrettyCardboard is a freeform tabletop. `game.rs` never judges legality, and
//! that is not an unfinished feature - it is what lets the same server run
//! Magic, the Cyberpunk TCG and Yu-Gi-Oh, honour house rules, cope with cards
//! whose text contradicts any naive check (Exploration, Reliquary Tower,
//! Vigilance, anything with haste), and let a table simply agree to do
//! something odd. The moment the server starts *rejecting* moves, all of that
//! breaks, and it breaks silently for people who were playing correctly.
//!
//! So the coach observes and comments. Every note is:
//!   - **private** to the player who made the move - being corrected in front
//!     of the table is how you teach someone to stop playing;
//!   - **opt-in** per player (`Player::coach`), off by default, so experienced
//!     tables never see it;
//!   - **advisory** - the move already happened and stands.
//!
//! # What it can and cannot know
//!
//! The server holds zones, turn, phase, combat, life and tap state, but it has
//! **no oracle text**. `bot.rs` carries a compact attribute table (mana value,
//! type letters, power/toughness) covering only the bundled precons. So the
//! checks here are deliberately restricted to ones that are correct from
//! structure alone. Anything needing keywords - summoning sickness (haste),
//! illegal blocks (flying/reach), attacking with a Defender - is intentionally
//! absent until that table carries keywords; a coach that cries wolf about a
//! hasty creature is worse than no coach.
//!
//! Each note names the rule it is quoting so the reader can go and look it up,
//! which is the actual goal: not to be obeyed, but to be outgrown.

use crate::rooms::{Player, Room};

/// One piece of advice, addressed to a single player.
pub struct Note {
    /// Stable identifier (`"land-drop"`), so the client can style, group or
    /// let someone mute an individual lesson later without parsing prose.
    pub rule: &'static str,
    /// The advice itself, already written for a human.
    pub text: String,
}

impl Note {
    fn new(rule: &'static str, text: impl Into<String>) -> Self {
        Note { rule, text: text.into() }
    }
}

/// Comprehensive Rules citation, appended so a curious player can go read the
/// actual text rather than take our word for it.
fn cite(rule: &str, body: &str) -> String {
    format!("{body} (CR {rule})")
}

/// Is this seat the one whose turn it is?
fn is_active(room: &Room, player: &Player) -> bool {
    room.active_seat == player.seat
}

/// The main phases are the only window for sorcery-speed actions.
fn in_main_phase(room: &Room) -> bool {
    room.phase == "main1" || room.phase == "main2"
}

/// Advice for a land that just arrived on the battlefield.
///
/// `lands_this_turn` has already been incremented by the caller, so the first
/// land of the turn arrives here as 1.
pub fn on_land_played(room: &Room, player: &Player) -> Vec<Note> {
    let mut notes = Vec::new();

    if !is_active(room, player) {
        notes.push(Note::new(
            "land-timing",
            cite(
                "305.1",
                "That land went down on someone else's turn. Lands are not spells - \
                 you can only play one during your own main phase, with an empty stack",
            ),
        ));
        return notes;
    }

    if !in_main_phase(room) {
        notes.push(Note::new(
            "land-timing",
            cite(
                "305.1",
                &format!(
                    "You played a land during your {} step. Lands can only be played \
                     in one of your main phases, when the stack is empty",
                    room.phase
                ),
            ),
        ));
    }

    if player.lands_this_turn > 1 {
        notes.push(Note::new(
            "land-drop",
            cite(
                "305.2",
                &format!(
                    "That is land number {} this turn. You normally get one land drop per \
                     turn - unless something on the battlefield says otherwise",
                    player.lands_this_turn
                ),
            ),
        ));
    }

    notes
}

/// Advice for a creature that was just declared as an attacker.
///
/// `was_tapped` is the creature's state *before* the declaration, because
/// declaring an attacker taps it - asking the card afterwards would flag every
/// attack ever made.
pub fn on_attack(room: &Room, player: &Player, name: &str, was_tapped: bool) -> Vec<Note> {
    let mut notes = Vec::new();

    // A tapped creature cannot be declared as an attacker. This one needs no
    // oracle text to be certain of - the card was either tapped or it was not.
    if was_tapped {
        notes.push(Note::new(
            "attack-tapped",
            cite(
                "508.1a",
                &format!(
                    "{name} was already tapped when it attacked. Only untapped creatures can be \
                     declared as attackers - and attacking taps them, unless they have vigilance"
                ),
            ),
        ));
    }

    if !is_active(room, player) {
        notes.push(Note::new(
            "attack-timing",
            cite(
                "506.2",
                "You declared an attacker on someone else's turn. Only the active player \
                 attacks; on other turns you are the one blocking",
            ),
        ));
    }

    notes
}

/// Advice at the moment a player passes the turn away.
pub fn on_turn_pass(_room: &Room, player: &Player) -> Vec<Note> {
    let mut notes = Vec::new();

    // Maximum hand size is checked in the cleanup step, and it is one of the
    // few numbers a new player reliably forgets.
    let hand = player.hand.len();
    if hand > 7 {
        notes.push(Note::new(
            "hand-size",
            cite(
                "514.1",
                &format!(
                    "You finished the turn holding {hand} cards. Maximum hand size is seven - \
                     you would normally discard {} in the cleanup step",
                    hand - 7
                ),
            ),
        ));
    }

    // Mana empties between steps and phases; carrying it across a whole turn
    // means the player is probably treating the pool as a bank.
    let floating: i64 = player.mana.values().copied().filter(|n| *n > 0).sum();
    if floating > 0 {
        notes.push(Note::new(
            "mana-empties",
            cite(
                "500.4",
                &format!(
                    "You passed the turn with {floating} unspent mana. Mana pools empty at the \
                     end of every step and phase - it does not carry over"
                ),
            ),
        ));
    }

    notes
}

/// Filter to the seats that asked to be taught. Bots never listen.
pub fn wants_coaching(player: &Player) -> bool {
    player.coach && !player.is_bot
}
