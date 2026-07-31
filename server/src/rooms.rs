use crate::db::DeckCard;
use crate::{db, ws, App};
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Duration;

/// A card instance somewhere in the room. Serializes to the contract's CardInst.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub iid: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scryfall_id: Option<String>,
    pub name: String,
    pub image_url: Option<String>,
    pub tapped: bool,
    pub face_down: bool,
    pub counters: BTreeMap<String, i64>,
    pub x: f64,
    pub y: f64,
    pub is_token: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub power: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toughness: Option<String>,
    /// iid of the battlefield card this one is attached to (auras/equipment).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attached_to: Option<String>,
    /// This attachment is a PILE member, not an aura: it squares up UNDER its
    /// base and the group reads as one object with a count, the way stacked
    /// lands do on a real table. Only ever meaningful alongside `attached_to` -
    /// `card_view` hides a stale bit and the attach arm always reassigns it, so
    /// this is a qualifier on that pointer, never independent state.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub piled: bool,
    /// Flagged from the deck's commander board at load (commander format only).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub is_commander: bool,
    /// Temporarily public while on the stack from a hidden zone.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub revealed: bool,
    /// A double-faced card flipped to its back face (transform / modal DFC). The
    /// client resolves the back art from the card's Scryfall faces; the server
    /// just tracks which face is up so every seat sees the same side.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub transformed: bool,
    /// The turn number this card arrived on the battlefield, for the rules
    /// coach. Purely observational - nothing in the freeform pipeline reads it
    /// to decide whether a move is allowed, and a card that predates the field
    /// (or arrived some way that never set it) simply yields no advice.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entered_turn: Option<u64>,
}

/// London-mulligan progress for one seat.
#[derive(Clone, Serialize, Deserialize)]
pub struct Mull {
    pub state: String, // "deciding" | "kept"
    pub taken: u32,
}

/// Host-configurable pre-game rules, negotiated in the lobby before start.
/// Every field is optional/defaulted so pre-feature rooms deserialize to the
/// old hardcoded behavior (`GameSettings::default()`).
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GameSettings {
    /// Life every seat starts with; `None` = the game/format default (commander
    /// 40, standard 20, Yu-Gi-Oh 8000). Ignored for Cyberpunk (Net/RAM start 0).
    pub starting_life: Option<i64>,
    /// Opening-hand size; `None` = game default (MTG 7, Cyberpunk 6, Yu-Gi-Oh 5).
    pub starting_hand: Option<usize>,
    /// Free mulligans before hands start shrinking; `None` = the classic rule
    /// (1 in 3+ player commander, else 0).
    pub free_mulligans: Option<u32>,
    /// Mulligan as often as you like and never bottom a card. Overrides
    /// `free_mulligans` outright - a table that wants a keepable hand more than
    /// it wants the ritual of paying for one.
    pub unlimited_mulligans: bool,
    /// "london" (draw full, bottom N on keep) or "vancouver" (draw one fewer
    /// each mulligan, no bottoming).
    pub mulligan_rule: String,
    /// Who takes the first turn: "auto" (lowest seat), "random", or "seat".
    pub first_player: String,
    /// The seat that goes first when `first_player == "seat"`.
    pub first_seat: Option<usize>,
    /// Force the starting player's first-draw skip on/off; `None` = the classic
    /// rule (skipped in standard or any 2-player game).
    pub skip_first_draw: Option<bool>,
    /// Arena-lite rules enforcement for this table (MTG only): real mana costs
    /// with colors, land drops, summoning sickness, legal attacks/blocks with
    /// core keywords, and previewed combat damage. Off = classic freeform.
    /// See rules.rs; the coach stays advisory and independent of this.
    pub enforced: bool,
}

impl Default for GameSettings {
    fn default() -> Self {
        Self {
            starting_life: None,
            starting_hand: None,
            free_mulligans: None,
            unlimited_mulligans: false,
            mulligan_rule: "london".to_string(),
            first_player: "auto".to_string(),
            first_seat: None,
            skip_first_draw: None,
            enforced: false,
        }
    }
}

/// One of the Cyberpunk Gig dice a player holds. The base six (d4..d20) come
/// from their Fixer; extra dice are STOLEN from rivals (+1 Gig per full 10 Power
/// dealt), which is how a player pushes past six toward the 7-die win. `value`
/// 0 = unrolled (still in the Fixer); `in_gig` = moved to the Gig area; `stolen`
/// dice carry their origin (`from`) and are always in the Gig area.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GigDie {
    pub sides: u8,
    pub value: u8,
    pub in_gig: bool,
    #[serde(default)]
    pub stolen: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
}

/// The most recent single die a player rolled (any game). Drives the 3D dice
/// animation on the mat: `seq` bumps every roll so the client fires on change,
/// even for a repeat of the same value.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiceRollResult {
    pub seq: u64,
    pub sides: u8,
    pub value: u8,
}

/// The six Fixer dice, in printed order (largest first on the mat).
pub const GIG_SIDES: [u8; 6] = [20, 12, 10, 8, 6, 4];

pub fn empty_mana() -> BTreeMap<String, i64> {
    ["W", "U", "B", "R", "G", "C"]
        .into_iter()
        .map(|color| (color.to_string(), 0))
        .collect()
}

/// A fresh Fixer set for a Cyberpunk game (empty for other games — MTG has no
/// dice board).
pub fn new_gig_dice(game: &str) -> Vec<GigDie> {
    if game == "cyberpunk" {
        GIG_SIDES
            .iter()
            .map(|&sides| GigDie { sides, value: 0, in_gig: false, stolen: false, from: None })
            .collect()
    } else {
        Vec::new()
    }
}

/// Full player state. Serde here is for SQLite persistence only; the wire
/// RoomState is built by hand in `state_for` (hands/libraries stay filtered).
#[derive(Serialize, Deserialize)]
pub struct Player {
    pub user_id: String,
    pub username: String,
    pub seat: usize,
    /// Pregame acknowledgement. Only this authenticated seat can toggle it;
    /// changing decks or going offline resets it.
    #[serde(default)]
    pub ready: bool,
    pub life: i64,
    pub poison: i64,
    /// Public floating mana. Only this seat's authenticated player can change
    /// it; keeping it in room state makes it visible to every viewer.
    #[serde(default = "empty_mana")]
    pub mana: BTreeMap<String, i64>,
    pub cmd_damage: BTreeMap<usize, i64>,
    /// Commander damage received, additionally keyed by the commander's iid
    /// (additive to the by-seat matrix; clients may ignore).
    #[serde(default)]
    pub cmd_damage_by_commander: BTreeMap<String, i64>,
    /// Commander tax in generic mana, by commander iid (+2 per cast).
    #[serde(default)]
    pub commander_tax: BTreeMap<String, i64>,
    #[serde(default)]
    pub mulligan: Option<Mull>,
    /// The player's chosen playmat id; the client shows the active player's
    /// mat as the shared table felt.
    #[serde(default)]
    pub playmat: Option<String>,
    /// Custom zone-pile placement on this player's mat (normalized 0..1 centers
    /// by logical zone id: library/graveyard/exile/command). Empty = the default
    /// strip layout. Synced via `matlayout.set` and shown to every viewer.
    #[serde(default)]
    pub mat_layout: BTreeMap<String, MatPos>,
    /// The player's chosen card-back id; every viewer paints THIS player's
    /// face-down cards with it (so an opponent's board wears their back, not
    /// yours). Synced from the client via `cardback.set`.
    #[serde(default)]
    pub card_back: Option<String>,
    /// Client-computed public deck metrics (colors/curve/counts) for the
    /// matchup splash; opaque to the server. Synced via `deckmeta.set` and
    /// cleared on deck switch.
    #[serde(default)]
    pub deck_meta: Option<serde_json::Value>,
    /// Per-player turn conveniences, OFF by default and synced from the client
    /// via `auto.set`: when set, this player's permanents untap and/or one card
    /// is drawn automatically at the start of their turn. (Bots, when present,
    /// should set these true so they keep playing without a human's clicks.)
    #[serde(default)]
    pub auto_untap: bool,
    #[serde(default)]
    pub auto_draw: bool,
    /// Opt-in rules coach: when set, this player gets private advisory notes
    /// about their own plays (see `coach.rs`). Off by default and never
    /// enforcing - the table stays freeform whatever this says.
    #[serde(default)]
    pub coach: bool,
    /// Lands this player has put onto the battlefield during the current turn,
    /// reset as each turn begins. The match-long `cards_played` below cannot
    /// answer "is this your second land?", which is the single most common
    /// thing a new player gets wrong.
    #[serde(default, skip_serializing)]
    pub lands_this_turn: u64,
    /// Cyberpunk Gig dice (the six d4-d20 in the Fixer); empty for other games.
    #[serde(default)]
    pub gig_dice: Vec<GigDie>,
    /// Monotonic roll counter + the last die rolled, for the 3D dice animation.
    #[serde(default)]
    pub roll_seq: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_roll: Option<DiceRollResult>,
    /// The deck this seat was taken with (None for deckless joins);
    /// captured at join so match results can attribute wins to a deck.
    #[serde(default)]
    pub deck_id: Option<String>,
    /// Deck name snapshotted at join (survives deck rename/delete).
    #[serde(default)]
    pub deck_name: Option<String>,
    /// Out of the game: turns skip them and one remaining player wins.
    #[serde(default)]
    pub conceded: bool,
    /// Synthetic player driven by the server's bot scheduler (`bot.rs`). Bots
    /// hold a seat like anyone else and act through the same pipeline.
    #[serde(default)]
    pub is_bot: bool,
    /// "casual" | "aggro" | "defensive"; None for humans.
    #[serde(default)]
    pub bot_style: Option<String>,
    /// "easy" | "normal" | "hard"; None (humans) or absent = normal. Scales
    /// the bot's aggression, casting budget and blocking discipline.
    #[serde(default)]
    pub bot_difficulty: Option<String>,
    /// Turns this player has begun (starting player's first turn included).
    #[serde(default)]
    pub turns_taken: u64,
    /// Total ms spent as the active player (the turn clock).
    #[serde(default)]
    pub turn_time_ms: i64,
    /// Authoritative match counters used for player and deck aggregates.
    #[serde(default)]
    pub cards_played: u64,
    #[serde(default)]
    pub cards_drawn: u64,
    #[serde(default)]
    pub peak_battlefield: u64,
    pub hand: Vec<Card>,
    pub library: Vec<Card>, // index 0 = top; never sent on the wire, only counted
    pub battlefield: Vec<Card>,
    pub graveyard: Vec<Card>,
    pub exile: Vec<Card>,
    pub command: Vec<Card>,
    pub hand_revealed: bool,
    pub online: bool,
    /// Last simple action, undoable for 10s (live-only, not persisted).
    #[serde(skip)]
    pub undo: Option<crate::game::UndoEntry>,
    /// iids of this player's most recent library.peek window (live-only).
    #[serde(skip)]
    pub peeked: Vec<String>,
}

#[derive(Clone)]
pub struct UserRef {
    pub user_id: String,
    pub username: String,
}

/// One card on the shared stack (fully public; owner gets it back on resolve).
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StackEntry {
    pub owner: String, // user_id
    pub card: Card,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attacker {
    pub iid: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub defender_seat: Option<usize>,
    /// Effective power/toughness as declared by the attacking client
    /// (counters included); strings, missing resolves as 0 (Combat v3).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub power: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub toughness: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub blocker_iid: String,
    pub attacker_iid: String,
    /// Effective power/toughness as declared by the blocking client.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub power: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub toughness: Option<String>,
}

/// Guided-combat bookkeeping: a lightweight, fully public, unenforced overlay of
/// who is attacking whom and which creatures block which attackers. The server
/// never resolves damage - players inform each other and adjust life/creatures
/// by hand (with a one-click unblocked-damage helper).
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Combat {
    pub attackers: Vec<Attacker>,
    pub blocks: Vec<Block>,
    /// Enforced rooms: attackers are final; blocks may now be declared.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub locked: bool,
    /// Enforced rooms: blocks are final; `preview` holds the computed outcome
    /// awaiting the active player's combat.resolve.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub blocks_ready: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview: Option<CombatPreview>,
}

/// The engine's computed outcome of an enforced combat, shown to the table
/// before combat.resolve applies it. Everything the client needs to render
/// "who dies, who takes what" without doing its own math.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombatPreview {
    pub rows: Vec<PreviewRow>,
    /// Life change per seat (negative = damage taken), lifelink included.
    pub life: BTreeMap<usize, i64>,
    /// Commander damage dealt: (defending seat, commander iid, amount).
    #[serde(default)]
    pub commander: Vec<(usize, String, i64)>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRow {
    pub attacker_iid: String,
    pub attacker_name: String,
    /// Seat this attacker is hitting (resolved, never None).
    pub defender_seat: usize,
    /// Damage getting through to the defending player (0 when fully blocked).
    pub player_damage: i64,
    pub attacker_dies: bool,
    /// Blockers that die to this attacker.
    pub dead_blockers: Vec<String>,
    pub dead_blocker_names: Vec<String>,
}

/// The most recent combat that had attackers when it was cleared, stamped with
/// the room seq at clear time. Server-side bookkeeping only (never on the
/// wire): bots settle the damage a combat dealt them from this record, so an
/// attack that begins and ends between two scheduler ticks is never missed,
/// and `seq` makes the settlement idempotent per combat.
#[derive(Clone, Serialize, Deserialize)]
pub struct EndedCombat {
    pub seq: u64,
    pub combat: Combat,
}

fn is_zero(v: &i64) -> bool {
    *v == 0
}

/// Table-wide markers (monarch, initiative, day/night, storm).
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Markers {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub monarch: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initiative: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub day_night: Option<String>,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub storm: i64,
}

/// A commander headed to graveyard/exile/hand/library, held while its owner
/// decides whether it returns to the command zone instead (30s timeout
/// completes the original move).
#[derive(Clone, Serialize, Deserialize)]
pub struct PendingCmd {
    pub iid: String,
    pub owner: String, // user_id
    pub card: Card,
    pub to: crate::game::Zone,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub index: Option<i64>,
    pub deadline: i64, // unix ms
}

/// A table marker parked on a card: the shared "watch this one" gesture, kept
/// in room state rather than in each client's head so a reconnect, a late
/// joiner, and every spectator all see the same annotated board. The kind is
/// the client's vocabulary (skull/star/eye/...); the server only bounds it.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardMark {
    pub kind: String,
    /// Who placed it (user_id) and from which seat - the client colors the
    /// puck by seat, the same palette the cursors and arrows use.
    pub by: String,
    pub seat: usize,
    pub username: String,
    pub ts: i64,
}

/// A triggered ability that fired and awaits its controller's answer
/// (enforced rooms, rules roadmap pass A). Fully public - the trigger is
/// printed card text and its source is visible. `auto` = the engine can apply
/// the parsed effects itself; otherwise the prompt is an acknowledgment and
/// the controller performs the text by hand. Lapsed prompts dismiss.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingTrigger {
    pub id: String,
    pub owner: String, // user_id of the controller
    pub seat: usize,
    pub source_iid: String,
    pub source_name: String,
    pub when: crate::oracle::TriggerWhen,
    pub effects: Vec<crate::oracle::TriggerEffect>,
    pub text: String,
    pub auto: bool,
    pub deadline: i64, // unix ms
}

/// The finished-match record, kept on the room (so reconnects still see the
/// post-match screen) and mirrored into SQLite for all-time stats.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchResult {
    pub match_id: String,
    pub winner_user_id: String,
    pub winner_username: String,
    pub turns: u64,
    pub duration_ms: i64,
    pub ended_at: i64,
    /// Substantial multiplayer games count toward all-time stats and unlock
    /// endorse/salt; instant-concede farms and bot-only stomps do not.
    #[serde(default)]
    pub ranked: bool,
    pub players: Vec<MatchResultPlayer>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchResultPlayer {
    pub user_id: String,
    pub username: String,
    pub seat: usize,
    pub is_bot: bool,
    pub conceded: bool,
    pub turns_taken: u64,
    pub avg_turn_ms: i64,
    #[serde(default)]
    pub cards_played: u64,
    #[serde(default)]
    pub cards_drawn: u64,
    #[serde(default)]
    pub peak_battlefield: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deck_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deck_name: Option<String>,
    pub life: i64,
}

/// A player's match-result line as they stand right now (shared by the
/// finish path and the leaver-snapshot path so both record identically).
pub fn result_player(p: &Player) -> MatchResultPlayer {
    MatchResultPlayer {
        user_id: p.user_id.clone(),
        username: p.username.clone(),
        seat: p.seat,
        is_bot: p.is_bot,
        conceded: p.conceded,
        turns_taken: p.turns_taken,
        avg_turn_ms: if p.turns_taken > 0 {
            p.turn_time_ms / p.turns_taken as i64
        } else {
            0
        },
        cards_played: p.cards_played,
        cards_drawn: p.cards_drawn,
        peak_battlefield: p.peak_battlefield,
        deck_id: p.deck_id.clone(),
        deck_name: p.deck_name.clone(),
        life: p.life,
    }
}

/// A normalized (0..1) zone-pile center on a player's mat.
#[derive(Clone, Copy, Serialize, Deserialize)]
pub struct MatPos {
    pub x: f64,
    pub y: f64,
}

fn default_format() -> String {
    "commander".to_string()
}

/// Every MTG format a room can be created with (the client's preset picker).
/// "draft" is Limited: the table opens packs and builds a pool at the table
/// before the game starts, by drafting or by sealed (see `Draft`).
pub const MTG_FORMATS: &[&str] = &[
    "commander", "brawl", "standard", "pioneer", "modern", "legacy", "vintage", "pauper",
    "draft", "freeform",
];

// --- limited: booster draft and sealed -------------------------------------

/// A card in a limited pool, as the server handles it.
///
/// The server deliberately knows nothing about Magic here: the HOST's client
/// generates every pack from the bundled collation data (public/cache/packs)
/// and uploads them at `draft.start`, because that data - the real sheets and
/// weights - already lives in the browser and re-implementing it in Rust would
/// mean shipping and refreshing a second copy of MTGJSON server-side. What
/// arrives is an opaque list of cards to deal, pass and hand back.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftCard {
    /// Scryfall id, which is also what a deck list stores.
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub rarity: String,
    #[serde(default)]
    pub foil: bool,
    /// WUBRG letters, joined ("WU"). Drives the build screen's colour columns.
    #[serde(default)]
    pub colors: String,
    #[serde(default)]
    pub type_line: String,
    /// Collector number.
    #[serde(default)]
    pub cn: String,
}

/// One drafter.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftSeat {
    pub user_id: String,
    /// The pack in front of this seat right now.
    #[serde(default)]
    pub pack: Vec<DraftCard>,
    /// Everything taken, in pick order.
    #[serde(default)]
    pub pool: Vec<DraftCard>,
    /// This seat has taken its card for the current pick and is waiting on the
    /// rest of the table. Cleared when the packs rotate.
    #[serde(default)]
    pub picked: bool,
    /// Finished building a deck out of the pool.
    #[serde(default)]
    pub built: bool,
}

/// A limited pool in progress, living in the room BEFORE the game starts.
///
/// This is a phase in front of the normal pre-game lobby rather than a
/// separate kind of room: when it finishes every seat has a real, saved deck,
/// and the existing lobby, start, and table code take over untouched.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    /// Set code the packs came from, for the artwork and the log.
    pub set: String,
    pub set_name: String,
    /// "draft" (pass the packs round) or "sealed" (open them all, keep it all).
    ///
    /// Sealed is the same tournament with the passing taken out, so it reuses
    /// this whole structure rather than getting one of its own: the pool, the
    /// build phase, the build clock, the deck lock and the forced auto-deck are
    /// identical either way. The only structural difference is that a sealed
    /// pool is born in its building phase - there is nothing to pick.
    #[serde(default = "default_draft_mode")]
    pub mode: String,
    /// Packs per player (three to draft, six to seal, traditionally).
    pub rounds: usize,
    /// "picking" | "building" | "done"
    pub phase: String,
    /// 1-based pack number.
    pub round: usize,
    /// 1-based pick number within the round.
    pub pick: usize,
    pub seats: Vec<DraftSeat>,
    /// Packs not dealt yet, consumed a round at a time from the front.
    #[serde(default)]
    pub reserve: Vec<Vec<DraftCard>>,
    /// Unix ms the current pick lapses and is taken automatically; 0 = untimed.
    /// Doubles as the deadline for the building phase when a build clock is set.
    #[serde(default)]
    pub deadline_ms: i64,
    /// Seconds on the clock for each pick; 0 = untimed.
    #[serde(default)]
    pub pick_seconds: u64,
    /// Seconds each seat gets to build once the picking ends; 0 = untimed.
    /// Optional because a table that is all in the same room does not need a
    /// referee - but a table with a stranger in it very much does.
    #[serde(default)]
    pub build_seconds: u64,
    /// The table plays what it drafted: once a seat reports its deck built it
    /// cannot swap in something it brought from home.
    #[serde(default)]
    pub lock_decks: bool,
    /// Basic lands from the drafted set, uploaded with the packs. Only used to
    /// fill out a forced build - a pool alone cannot cast anything.
    #[serde(default)]
    pub basics: Vec<DraftCard>,
}

/// A room saved mid-draft before sealed existed replays as what it was.
fn default_draft_mode() -> String {
    "draft".to_string()
}

/// Colour order, and the basic that produces each. Lands are colourless to
/// Scryfall, so a basic can only be matched to a colour by its name - and
/// `ends_with` catches the snow-covered sets, which print nothing else.
const COLORS: [char; 5] = ['W', 'U', 'B', 'R', 'G'];
const BASIC_NAMES: [&str; 5] = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

/// Bounds on an uploaded pool, so a crafted `draft.start` cannot pin the
/// server's memory. A real draft is 3 packs of 15 for up to 8 seats; a real
/// sealed is 6 packs each, which is why the ceiling is not 3.
pub const DRAFT_MAX_ROUNDS: usize = 8;
pub const DRAFT_MAX_PACK: usize = 60;
/// Five basics, plus room for the odd Wastes or snow variant.
pub const DRAFT_MAX_BASICS: usize = 12;

/// Everything the host chose on the setup screen, kept together so starting a
/// draft is not a nine-argument function.
pub struct DraftSetup {
    pub set: String,
    pub set_name: String,
    pub mode: String,
    pub rounds: usize,
    pub pick_seconds: u64,
    pub build_seconds: u64,
    pub lock_decks: bool,
    pub basics: Vec<DraftCard>,
}

impl Draft {
    /// Sealed: every pack opened at once, nothing passed to anyone.
    pub fn sealed(&self) -> bool {
        self.mode == "sealed"
    }

    /// Which way packs pass this round. Left on odd packs, right on even -
    /// the real alternation, and the reason pack two feels different.
    fn shift(&self) -> usize {
        let n = self.seats.len();
        if n == 0 {
            return 0;
        }
        if self.round % 2 == 1 {
            1
        } else {
            n - 1
        }
    }

    /// Take the next `seats.len()` packs off the reserve and put one in front
    /// of each drafter.
    fn deal_round(&mut self) {
        for index in 0..self.seats.len() {
            let pack = if self.reserve.is_empty() {
                Vec::new()
            } else {
                self.reserve.remove(0)
            };
            self.seats[index].pack = pack;
        }
    }

    /// Deal the opening packs and start whichever clock applies.
    pub fn begin(&mut self, now: i64) {
        if self.sealed() {
            // Nothing is passed, so there is no reason to hand these out a
            // round at a time: each seat opens its whole allocation at once and
            // the pool simply IS those packs. That is also why a sealed pool
            // skips the picking phase outright and opens on the build screen.
            for index in 0..self.seats.len() {
                for _ in 0..self.rounds {
                    if self.reserve.is_empty() {
                        break;
                    }
                    let pack = self.reserve.remove(0);
                    self.seats[index].pool.extend(pack);
                }
            }
            self.round = self.rounds;
            self.phase = "building".to_string();
            self.deadline_ms = if self.build_seconds > 0 {
                now + (self.build_seconds as i64) * 1000
            } else {
                0
            };
            return;
        }
        self.deal_round();
        self.deadline_ms = if self.pick_seconds > 0 {
            now + (self.pick_seconds as i64) * 1000
        } else {
            0
        };
    }

    /// Take a card for one seat. Returns false when the pick is not legal.
    pub fn take(&mut self, seat: usize, index: usize, id: &str) -> bool {
        let Some(entry) = self.seats.get_mut(seat) else {
            return false;
        };
        if entry.picked {
            return false;
        }
        // The index is what the client clicked; the id is what it believed was
        // there. Both must agree or the seat is acting on a stale pack.
        let Some(card) = entry.pack.get(index) else {
            return false;
        };
        if card.id != id {
            return false;
        }
        let card = entry.pack.remove(index);
        entry.pool.push(card);
        entry.picked = true;
        true
    }

    /// Every seat that still has a pack has picked from it.
    pub fn pass_complete(&self) -> bool {
        self.seats.iter().all(|s| s.picked || s.pack.is_empty())
    }

    /// Rotate the packs and open the next pick, moving to the next round (or
    /// out of the draft entirely) once the packs run out.
    pub fn advance(&mut self, now: i64) {
        let n = self.seats.len();
        if n == 0 {
            return;
        }
        let shift = self.shift();
        let packs: Vec<Vec<DraftCard>> =
            self.seats.iter_mut().map(|s| std::mem::take(&mut s.pack)).collect();
        for (index, pack) in packs.into_iter().enumerate() {
            self.seats[(index + shift) % n].pack = pack;
        }
        for seat in self.seats.iter_mut() {
            seat.picked = false;
        }
        if self.seats.iter().all(|s| s.pack.is_empty()) {
            self.round += 1;
            self.pick = 1;
            if self.round > self.rounds {
                self.phase = "building".to_string();
                // The build clock, if the host set one, starts the moment the
                // last card is picked.
                self.deadline_ms = if self.build_seconds > 0 {
                    now + (self.build_seconds as i64) * 1000
                } else {
                    0
                };
                return;
            }
            self.deal_round();
        } else {
            self.pick += 1;
        }
        self.deadline_ms = if self.pick_seconds > 0 {
            now + (self.pick_seconds as i64) * 1000
        } else {
            0
        };
    }

    /// Take the first card of the pack for one seat that has not picked.
    /// Returns false when there was nothing to take.
    ///
    /// The table has to be able to act for someone, or one closed laptop
    /// wedges it forever waiting on a pick that is never coming.
    pub fn force_seat(&mut self, seat: usize) -> bool {
        let Some(entry) = self.seats.get_mut(seat) else {
            return false;
        };
        if entry.picked || entry.pack.is_empty() {
            return false;
        }
        let card = entry.pack.remove(0);
        entry.pool.push(card);
        entry.picked = true;
        true
    }

    /// A playable deck assembled from one seat's pool, for when the build
    /// clock lapses on someone who is not there to build it themselves.
    ///
    /// Not a good deck - a legal one. The two heaviest colours in the pool,
    /// every spell castable in them up to 23, and 17 basics split the same way.
    /// That is the shape a limited deck wants, and it beats seating someone
    /// with nothing at all.
    pub fn auto_deck(&self, seat: usize) -> Vec<crate::db::DeckCard> {
        const SPELLS: usize = 23;
        const LANDS: usize = 17;
        let Some(entry) = self.seats.get(seat) else {
            return Vec::new();
        };
        // Weight each colour by how many cards in the pool want it.
        let mut weight = [0usize; 5];
        for card in &entry.pool {
            for letter in card.colors.chars() {
                if let Some(i) = COLORS.iter().position(|c| *c == letter) {
                    weight[i] += 1;
                }
            }
        }
        let mut order: Vec<usize> = (0..COLORS.len()).collect();
        order.sort_by_key(|i| std::cmp::Reverse(weight[*i]));
        let (first, second) = (order[0], order[1]);
        let castable = |card: &DraftCard| {
            card.colors.chars().all(|letter| {
                COLORS
                    .iter()
                    .position(|c| *c == letter)
                    .is_some_and(|i| i == first || i == second)
            })
        };
        let mut list: Vec<(String, String)> = entry
            .pool
            .iter()
            .filter(|c| castable(c))
            .take(SPELLS)
            .map(|c| (c.id.clone(), c.name.clone()))
            .collect();
        // A pool too shallow in its own colours takes the rest anyway: an
        // undersized deck is illegal, an off-colour one is merely bad.
        for card in entry.pool.iter().filter(|c| !castable(c)) {
            if list.len() >= SPELLS {
                break;
            }
            list.push((card.id.clone(), card.name.clone()));
        }
        let basic = |index: usize| {
            self.basics
                .iter()
                .find(|b| b.name.ends_with(BASIC_NAMES[index]))
        };
        let total = weight[first] + weight[second];
        let split = if total == 0 {
            LANDS / 2
        } else {
            LANDS * weight[first] / total
        };
        for (count, land) in [(split, basic(first)), (LANDS - split, basic(second))] {
            let Some(land) = land else { continue };
            for _ in 0..count {
                list.push((land.id.clone(), land.name.clone()));
            }
        }
        let mut cards: Vec<crate::db::DeckCard> = Vec::new();
        for (id, name) in list {
            if let Some(existing) = cards.iter_mut().find(|c| c.scryfall_id == id) {
                existing.quantity += 1;
            } else {
                cards.push(crate::db::DeckCard {
                    scryfall_id: id,
                    name,
                    quantity: 1,
                    board: "main".to_string(),
                });
            }
        }
        cards
    }
}

/// Formats that run the full commander machinery: command zone casts, tax,
/// commander damage, the return-to-command-zone prompt.
pub fn format_has_commander(format: &str) -> bool {
    matches!(format, "commander" | "brawl")
}

/// Default starting life for an MTG format; the host's startingLife setting
/// overrides it at game start.
pub fn format_default_life(format: &str) -> i64 {
    match format {
        "commander" => 40,
        "brawl" => 25,
        _ => 20,
    }
}
fn default_game() -> String {
    "mtg".to_string()
}
fn default_phase() -> String {
    "main1".to_string()
}
fn default_turn() -> u64 {
    1
}
fn default_true() -> bool {
    true
}

/// One point in a room's undo/redo/replay history: the full game state
/// serialized to JSON (connection/live fields are serde-skipped, so this is
/// pure game state and can be re-derived losslessly), plus who caused it and a
/// human label for the scrubber. Persisted to its own `room_history` table
/// (never nested in the Room's state_json, which would recurse) so the timeline
/// survives a server/database restart; see `push_history` and `flush_dirty`.
pub struct Snapshot {
    pub json: String,
    pub actor: String,
    pub label: String,
    pub seq: u64,
    /// Wall-clock ms this point was recorded (used to order the timeline).
    pub ts: i64,
    /// The public face (name + art) of the card this move concerns, for the
    /// timeline thumbnail. None for cardless moves or hidden/face-down cards.
    pub card: Option<serde_json::Value>,
    /// Stable, monotonically-increasing id within the room. Never reused, so a
    /// snapshot maps to the same `room_history` row across drains/truncations,
    /// letting the write-behind sync deltas (insert new, delete gone) instead of
    /// rewriting the whole multi-MB timeline every flush.
    pub hid: u64,
}

/// How many snapshots a room keeps. Bounds memory (~60KB each) and how far
/// undo/replay can reach back; the oldest are dropped once exceeded.
const MAX_HISTORY: usize = 400;

/// Serde is for SQLite persistence (state_json); spectators are live-only and
/// reset on load.
#[derive(Serialize, Deserialize)]
pub struct Room {
    pub id: String,
    pub name: String,
    pub code: String,
    pub seats: usize,
    pub host: String,
    pub persistent: bool,
    pub started: bool,
    pub seq: u64,
    pub created_at: i64,
    pub updated_at: i64,
    /// "commander" | "standard" — sets starting life, first-draw skip, and
    /// whether command-zone machinery is active.
    #[serde(default = "default_format")]
    pub format: String,
    /// Which card game this room plays ("mtg" | "cyberpunk" | "yugioh"). The freeform
    /// engine is game-agnostic; the client reads this to relabel zones, pick
    /// vitals, and resolve card art. Default "mtg" so pre-multigame rooms
    /// deserialize unchanged.
    #[serde(default = "default_game")]
    pub game: String,
    /// Host-configured pre-game rules (mulligans, starting life/hand, first
    /// player). Defaults reproduce the classic hardcoded behavior.
    #[serde(default)]
    pub settings: GameSettings,
    #[serde(default = "default_turn")]
    pub turn_number: u64,
    #[serde(default)]
    pub active_seat: usize,
    #[serde(default = "default_phase")]
    pub phase: String,
    #[serde(default = "default_true")]
    pub auto_turn: bool,
    /// Lowest occupied seat at room.start (first-draw-skip reference).
    #[serde(default)]
    pub starting_seat: usize,
    /// Shared stack, ordered bottom -> top; fully public.
    #[serde(default)]
    pub stack: Vec<StackEntry>,
    #[serde(default)]
    pub combat: Option<Combat>,
    /// The last cleared combat that had attackers (see `EndedCombat`). Bots
    /// read it to settle incoming damage; humans settle their own by hand.
    #[serde(default)]
    pub last_combat: Option<EndedCombat>,
    /// Enforced rooms: seats that passed priority on the current stack. Cleared
    /// whenever the stack changes; the top spell resolves once every other
    /// live seat has passed (or the response window times out).
    #[serde(default)]
    pub stack_passed: Vec<usize>,
    /// When the stack last changed (unix ms) - the response-timeout anchor.
    #[serde(default)]
    pub stack_changed_ms: i64,
    #[serde(default)]
    pub markers: Markers,
    /// Table markers by card iid (see `CardMark`). Fully public.
    #[serde(default)]
    pub marks: BTreeMap<String, CardMark>,
    #[serde(default)]
    pub pending_cmd: Vec<PendingCmd>,
    /// Fired triggered abilities awaiting their controller (enforced rooms).
    #[serde(default)]
    pub pending_triggers: Vec<PendingTrigger>,
    /// (turn number, seat) whose end-step triggers already fired. Guards
    /// against firing twice when a player visits the end phase and then
    /// passes the turn.
    #[serde(default)]
    pub end_fired: Option<(u64, usize)>,
    /// When the current active player's turn began (unix ms; 0 = no clock).
    #[serde(default)]
    pub turn_started_ms: i64,
    /// Last active-player interaction credited by the turn clock. Kept separate
    /// from turn_started_ms so AFK gaps can be capped without losing turn state.
    #[serde(default)]
    pub turn_last_interaction_ms: i64,
    /// When the game started (unix ms; 0 for pre-feature rooms).
    #[serde(default)]
    pub started_at_ms: i64,
    /// Seat count at game start; the match-end check needs >= 2 so a solo
    /// practice room never "ends".
    #[serde(default)]
    pub started_players: usize,
    /// Set once when one non-conceded player remains; never cleared.
    #[serde(default)]
    pub match_result: Option<MatchResult>,
    /// Players who left a started quick game before it ended, snapshotted as
    /// concessions so the eventual match result still records them.
    #[serde(default)]
    pub departed: Vec<MatchResultPlayer>,
    /// The opening-mulligan window closed and the first turn's draw + clock
    /// reset fired (guards against double-firing when a concede follows the
    /// last keep).
    #[serde(default)]
    pub first_turn_begun: bool,
    /// A booster draft running in front of the pre-game lobby. `None` on every
    /// ordinary table, which is also what pre-draft rooms deserialize to.
    #[serde(default)]
    pub draft: Option<Draft>,
    pub players: Vec<Player>, // sorted by seat
    #[serde(skip)]
    pub spectators: Vec<UserRef>,
    /// Undo/redo/replay timeline: one full-state snapshot per action, oldest
    /// first. `cursor` is the index of the currently-live state. Serde-skip so
    /// it is excluded from the Room's own state_json (each snapshot already
    /// contains a full serialized Room - nesting it there would recurse). It is
    /// persisted OUT-OF-BAND in the `room_history` table instead (see
    /// `flush_dirty` / `history_load`) so undo survives a restart.
    #[serde(skip)]
    pub history: Vec<Snapshot>,
    #[serde(skip)]
    pub cursor: usize,
    /// Next `Snapshot.hid` to hand out. Monotonic; never reset (hist_clear and
    /// restart both carry it forward) so ids are never reused.
    #[serde(skip)]
    pub hist_next_hid: u64,
    /// Highest `hid` already written to `room_history` (None = nothing saved).
    /// The flush inserts only snapshots newer than this, so each action writes
    /// one row rather than the whole timeline.
    #[serde(skip)]
    pub hist_saved_hi: Option<u64>,
    /// Hids dropped from `history` (drained oldest / truncated redo tail /
    /// cleared) since the last flush; the flush deletes exactly these rows.
    #[serde(skip)]
    pub hist_removed: Vec<u64>,
    /// The timeline changed since the last flush (new snapshot, moved cursor, or
    /// a removal) and needs syncing to `room_history`.
    #[serde(skip)]
    pub hist_dirty: bool,
}

impl Room {
    /// Capture the current game state as the newest history entry. A new action
    /// taken after an undo first discards the redo tail (everything past the
    /// cursor), so history stays a single linear branch.
    pub fn push_history(&mut self, actor: String, label: String, seq: u64, card: Option<serde_json::Value>) {
        if !self.history.is_empty() && self.cursor + 1 < self.history.len() {
            self.hist_truncate_to(self.cursor + 1);
        }
        let json = match serde_json::to_string(self) {
            Ok(j) => j,
            Err(_) => return,
        };
        let hid = self.hist_next_hid;
        self.hist_next_hid += 1;
        self.history.push(Snapshot { json, actor, label, seq, ts: crate::now_ms(), card, hid });
        if self.history.len() > MAX_HISTORY {
            let drop = self.history.len() - MAX_HISTORY;
            self.hist_drain_front(drop);
        }
        self.cursor = self.history.len() - 1;
        self.hist_dirty = true;
    }

    /// Keep only the first `new_len` snapshots, recording the removed hids so the
    /// next flush deletes exactly those `room_history` rows.
    pub fn hist_truncate_to(&mut self, new_len: usize) {
        if new_len >= self.history.len() {
            return;
        }
        let removed: Vec<u64> = self.history[new_len..].iter().map(|s| s.hid).collect();
        self.hist_removed.extend(removed);
        self.history.truncate(new_len);
        self.hist_dirty = true;
    }

    /// Drop the oldest `count` snapshots (over the MAX_HISTORY cap), recording
    /// their hids for deletion.
    fn hist_drain_front(&mut self, count: usize) {
        let removed: Vec<u64> = self.history[..count].iter().map(|s| s.hid).collect();
        self.hist_removed.extend(removed);
        self.history.drain(0..count);
        self.hist_dirty = true;
    }

    /// Wipe the whole timeline (e.g. reseeding at game start), recording every
    /// hid for deletion. `hist_next_hid` still advances so reseeded snapshots get
    /// fresh ids that never collide with the deleted rows.
    pub fn hist_clear(&mut self) {
        let removed: Vec<u64> = self.history.iter().map(|s| s.hid).collect();
        self.hist_removed.extend(removed);
        self.history.clear();
        self.cursor = 0;
        self.hist_dirty = true;
    }

    /// A card's public face (name + art) for the timeline thumbnail, if it is
    /// currently public (any face-up card in a public zone, or a revealed hand
    /// card). Returns None for hidden or face-down cards - never leaks identity.
    pub fn public_card_view(&self, iid: &str) -> Option<serde_json::Value> {
        let view = |c: &Card| {
            serde_json::json!({ "name": c.name, "scryfallId": c.scryfall_id, "imageUrl": c.image_url })
        };
        for p in &self.players {
            for zone in [&p.battlefield, &p.graveyard, &p.exile, &p.command] {
                if let Some(c) = zone.iter().find(|c| c.iid == iid && !c.face_down) {
                    return Some(view(c));
                }
            }
            if let Some(c) = p.hand.iter().find(|c| c.iid == iid) {
                if (c.revealed || p.hand_revealed) && !c.face_down {
                    return Some(view(c));
                }
                return None;
            }
        }
        None
    }

    /// Restore the GAME state at history index `target` while leaving ROOM
    /// MEMBERSHIP untouched: a restore rewinds moves, never joins/leaves. Who is
    /// seated, online, the host, spectators, `departed`, and the history/cursor
    /// are all live state (joins/leaves are NOT recorded on the timeline), so
    /// they carry forward from the current room rather than the snapshot. Sets
    /// the cursor to `target`. Returns false if the index/JSON is bad.
    pub fn restore_to(&mut self, target: usize) -> bool {
        let Some(json) = self.history.get(target).map(|s| s.json.clone()) else {
            return false;
        };
        let Ok(mut restored) = serde_json::from_str::<Room>(&json) else {
            return false;
        };
        // The live roster owns its Player values; reconcile the snapshot against
        // it so a restore across a mid-game join/leave neither drops a joiner nor
        // resurrects someone who left.
        let mut live: std::collections::HashMap<String, Player> =
            std::mem::take(&mut self.players).into_iter().map(|p| (p.user_id.clone(), p)).collect();
        // Drop snapshot players who have since left; keep survivors' live online
        // state and their cosmetic per-seat prefs (mat layout, playmat, card
        // back) - those are preferences, not game state, and an undo of a game
        // move must not snap someone's mat arrangement back.
        restored.players.retain(|p| live.contains_key(&p.user_id));
        for p in restored.players.iter_mut() {
            if let Some(lp) = live.get(&p.user_id) {
                p.online = lp.online;
                p.mat_layout = lp.mat_layout.clone();
                p.playmat = lp.playmat.clone();
                p.card_back = lp.card_back.clone();
                p.deck_meta = lp.deck_meta.clone();
            }
        }
        // Re-seat anyone who joined AFTER this snapshot, carrying their live
        // board forward (Player is not Clone, so move it out of the live map).
        let joined: Vec<String> = live
            .keys()
            .filter(|uid| !restored.players.iter().any(|p| &p.user_id == *uid))
            .cloned()
            .collect();
        for uid in joined {
            if let Some(p) = live.remove(&uid) {
                restored.players.push(p);
            }
        }
        restored.players.sort_by_key(|p| p.seat);
        restored.host = self.host.clone();
        restored.seq = self.seq;
        restored.updated_at = self.updated_at;
        restored.departed = std::mem::take(&mut self.departed);
        restored.spectators = std::mem::take(&mut self.spectators);
        restored.history = std::mem::take(&mut self.history);
        restored.cursor = target;
        // The timeline itself is live state, not part of the restored snapshot
        // (which serde-skips it); carry the persistence bookkeeping across too so
        // the next flush only writes the moved cursor, not the whole history.
        restored.hist_next_hid = self.hist_next_hid;
        restored.hist_saved_hi = self.hist_saved_hi;
        restored.hist_removed = std::mem::take(&mut self.hist_removed);
        restored.hist_dirty = true;
        // Re-anchor absolute wall-clock timers to now: a rewind restarts the
        // active player's turn clock and any pending-commander window from the
        // rewind point rather than inheriting stale (possibly already-expired)
        // timestamps from the snapshot.
        let now = crate::now_ms();
        if restored.turn_started_ms > 0 {
            restored.turn_started_ms = now;
            restored.turn_last_interaction_ms = now;
        }
        for pc in restored.pending_cmd.iter_mut() {
            pc.deadline = now + crate::game::CMD_CHOICE_MS;
        }
        for pt in restored.pending_triggers.iter_mut() {
            pt.deadline = now + crate::game::TRIGGER_CHOICE_MS;
        }
        *self = restored;
        true
    }

    /// A read-only historical frame filtered for one viewer (replay scrubbing).
    /// Never touches the shared cursor.
    pub fn replay_frame(&self, index: usize, viewer: Option<&str>) -> Option<Value> {
        let snap = self.history.get(index)?;
        let temp: Room = serde_json::from_str(&snap.json).ok()?;
        Some(temp.state_for(viewer))
    }
}

/// A card as one specific viewer sees it: a face-down card owned by someone else
/// is masked (identity hidden). `hide_from_owner` masks it from the OWNER too —
/// for Cyberpunk Legends, which are hidden information even from their own player
/// (you don't know which Legend is which until you Call it).
fn card_view(card: &Card, owner_is_viewer: bool, hide_from_owner: bool) -> Value {
    let mut v = serde_json::to_value(card).unwrap();
    if card.face_down && (!owner_is_viewer || hide_from_owner) {
        let o = v.as_object_mut().unwrap();
        o.insert("name".into(), json!("Face-down card"));
        o.insert("imageUrl".into(), Value::Null);
        o.remove("scryfallId");
        o.remove("power");
        o.remove("toughness");
        o.remove("isCommander"); // identity leak
        // `attachedTo`/`piled` deliberately survive the mask: the RELATION is
        // public even when the identity is not, so a pile of face-down cards
        // still reads as one object to opponents and spectators.
    }
    // A pile member that lost its base is just a loose card. Rather than null
    // this bit at every site that nulls attached_to, `piled` is only ever a
    // qualifier on that pointer - so hide it whenever the pointer is gone.
    if card.attached_to.is_none() && card.piled {
        v.as_object_mut().unwrap().remove("piled");
    }
    v
}

impl Room {
    /// The draft as seen by `viewer`, or Null when this table is not drafting.
    ///
    /// A draft is hidden information: your pack and your pool are yours, and
    /// everyone else is a name, a pick count and whether they are still
    /// thinking. Filtered here for the same reason hands are - it is the one
    /// place every outbound snapshot passes through.
    fn draft_view(&self, viewer: Option<&str>) -> Value {
        let Some(draft) = &self.draft else {
            return Value::Null;
        };
        let seats: Vec<Value> = draft
            .seats
            .iter()
            .map(|s| {
                let own = viewer == Some(s.user_id.as_str());
                let mut v = json!({
                    "userId": s.user_id,
                    "picked": s.picked,
                    "built": s.built,
                    "packCount": s.pack.len(),
                    "poolCount": s.pool.len(),
                });
                if own {
                    v["pack"] = json!(s.pack);
                    v["pool"] = json!(s.pool);
                }
                v
            })
            .collect();
        json!({
            "set": draft.set,
            "setName": draft.set_name,
            "mode": draft.mode,
            "rounds": draft.rounds,
            "phase": draft.phase,
            "round": draft.round,
            "pick": draft.pick,
            "deadlineMs": draft.deadline_ms,
            "pickSeconds": draft.pick_seconds,
            "buildSeconds": draft.build_seconds,
            "lockDecks": draft.lock_decks,
            "seats": seats,
        })
    }

    /// RoomState as seen by `viewer` (a seated player's userId), or by a
    /// spectator when `viewer` is None. Hidden information is filtered here:
    /// libraries are never serialized (counts only), hands only for the owner
    /// (or, when revealed, for other seated players — never spectators).
    pub fn state_for(&self, viewer: Option<&str>) -> Value {
        let players: Vec<Value> = self
            .players
            .iter()
            .map(|p| {
                let own = viewer == Some(p.user_id.as_str());
                // Cyberpunk Legends stay hidden even from their owner until Called.
                let hide_legends = self.game == "cyberpunk";
                // The Yu-Gi-Oh Extra Deck (the command slot) is hidden info to
                // everyone but its owner: opponents see a pile of backs, the
                // owner browses faces. Masked at view time — the cards stay
                // face-up in room state, so the owner plays them normally.
                let hide_extra = self.game == "yugioh" && !own;
                let zone = |cards: &Vec<Card>| {
                    Value::Array(cards.iter().map(|c| card_view(c, own, false)).collect())
                };
                let cmd: serde_json::Map<String, Value> = p
                    .cmd_damage
                    .iter()
                    .map(|(seat, dmg)| (seat.to_string(), json!(dmg)))
                    .collect();
                let mut pv = json!({
                    "userId": p.user_id,
                    "username": p.username,
                    "seat": p.seat,
                    "ready": p.ready,
                    "life": p.life,
                    "poison": p.poison,
                    "mana": p.mana,
                    "cmdDamage": cmd,
                    "cmdDamageByCommander": p.cmd_damage_by_commander,
                    "commanderTax": p.commander_tax,
                    "matLayout": p.mat_layout,
                    "mulligan": p.mulligan,
                    "handCount": p.hand.len(),
                    "libraryCount": p.library.len(),
                    "battlefield": zone(&p.battlefield),
                    "graveyard": zone(&p.graveyard),
                    "exile": zone(&p.exile),
                    "command": Value::Array(
                        p.command
                            .iter()
                            .map(|c| {
                                if hide_extra {
                                    let mut masked = c.clone();
                                    masked.face_down = true;
                                    card_view(&masked, false, false)
                                } else {
                                    card_view(c, own, hide_legends)
                                }
                            })
                            .collect(),
                    ),
                    "online": p.online,
                    "handRevealed": p.hand_revealed,
                    "playmat": p.playmat,
                    "cardBack": p.card_back,
                    "deckMeta": p.deck_meta,
                    "gigDice": p.gig_dice,
                    "lastRoll": p.last_roll,
                    "conceded": p.conceded,
                    "deckName": p.deck_name,
                    "isBot": p.is_bot,
                    "landsThisTurn": p.lands_this_turn,
                });
                // The viewer's own deck id, so the client can look up which
                // tokens the deck can produce (never leaked for other seats).
                if own {
                    pv["deckId"] = json!(p.deck_id);
                }
                if own || (p.hand_revealed && viewer.is_some()) {
                    pv["hand"] = Value::Array(
                        p.hand.iter().map(|c| serde_json::to_value(c).unwrap()).collect(),
                    );
                } else if viewer.is_some() {
                    // Cards individually revealed to the table (reveal.card) are
                    // visible to everyone even without a full hand reveal.
                    let revealed: Vec<Value> = p
                        .hand
                        .iter()
                        .filter(|c| c.revealed)
                        .map(|c| serde_json::to_value(c).unwrap())
                        .collect();
                    if !revealed.is_empty() {
                        pv["revealedHand"] = Value::Array(revealed);
                    }
                }
                pv
            })
            .collect();
        // The shared stack is fully public: card details always included,
        // with the owner tagged on for the client's benefit.
        let stack: Vec<Value> = self
            .stack
            .iter()
            .map(|e| {
                let mut v = serde_json::to_value(&e.card).unwrap();
                v["owner"] = json!(e.owner);
                if let Some(seat) = self
                    .players
                    .iter()
                    .find(|p| p.user_id == e.owner)
                    .map(|p| p.seat)
                {
                    v["ownerSeat"] = json!(seat);
                }
                v
            })
            .collect();
        json!({
            "roomId": self.id,
            "name": self.name,
            "code": self.code,
            "seats": self.seats,
            "started": self.started,
            "hostUserId": self.host,
            "seq": self.seq,
            "format": self.format,
            "game": self.game,
            "settings": self.settings,
            "turnNumber": self.turn_number,
            "activeSeat": self.active_seat,
            "phase": self.phase,
            "autoTurn": self.auto_turn,
            "startingSeat": self.starting_seat,
            "stack": stack,
            "combat": self.combat,
            "stackPassed": self.stack_passed,
            "pendingTriggers": self.pending_triggers,
            "markers": self.markers,
            "marks": self.marks,
            "matchResult": self.match_result,
            "draft": self.draft_view(viewer),
            "players": players,
            "spectators": self.spectators
                .iter()
                .map(|s| json!({"userId": s.user_id, "username": s.username}))
                .collect::<Vec<_>>(),
        })
    }
}

pub fn scryfall_image_url(scryfall_id: &str) -> String {
    // The direct image CDN: unthrottled, unlike api.scryfall.com which
    // rate-limits and 429s image bursts (an entire board loading at once).
    let a = &scryfall_id[0..1];
    let b = &scryfall_id[1..2];
    format!("https://cards.scryfall.io/normal/front/{a}/{b}/{scryfall_id}.jpg")
}

/// Build the command zone + shuffled library from a deck list. Sideboard cards
/// are left out of the game. Commander-board cards (partners included) are
/// flagged `isCommander` when the room's format is commander. Returns
/// (command, library).
pub fn build_zones(cards: &[DeckCard], flag_commanders: bool, game: &str) -> (Vec<Card>, Vec<Card>) {
    let mut command = Vec::new();
    let mut library = Vec::new();
    // Cyberpunk rule: the three Legends start FACE-DOWN in a randomized order in
    // the Legends area — hidden info even from their owner until Called (flipped)
    // for 1 €$. Magic commanders stay face-up in the command zone.
    let legends_hidden = game == "cyberpunk";
    for dc in cards {
        if dc.board == "side" {
            continue;
        }
        for _ in 0..dc.quantity.max(1) {
            let is_cmd = dc.board == "commander";
            let card = Card {
                iid: crate::hex_id(8),
                scryfall_id: Some(dc.scryfall_id.clone()),
                name: dc.name.clone(),
                // MTG: no URL - the client resolves Scryfall art from the id
                // (bundled cache first, then CDN). Cyberpunk: art is a bundled
                // local file keyed by the card id, so stamp its deterministic
                // path (the client has no Scryfall fallback for a Netdeck id).
                image_url: if game == "cyberpunk" {
                    Some(format!("/cache/cyberpunk/{}.webp", dc.scryfall_id))
                } else {
                    None
                },
                tapped: false,
                face_down: is_cmd && legends_hidden,
                counters: BTreeMap::new(),
                x: 0.5,
                y: 0.5,
                is_token: false,
                power: None,
                toughness: None,
                attached_to: None,
                piled: false,
                is_commander: is_cmd && flag_commanders,
                revealed: false,
                transformed: false,
                entered_turn: None,
            };
            if is_cmd {
                command.push(card);
            } else {
                library.push(card);
            }
        }
    }
    library.shuffle(&mut rand::rng());
    // Randomize the Legends' order so nobody knows which is which until Called.
    if legends_hidden {
        command.shuffle(&mut rand::rng());
    }
    (command, library)
}

pub fn new_room_code(app: &App) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    loop {
        let code: String = (0..6)
            .map(|_| {
                let i = rand::random_range(0..ALPHABET.len());
                ALPHABET[i] as char
            })
            .collect();
        if !app.codes.contains_key(&code) {
            return code;
        }
    }
}

/// Mark a room mutated: bump its activity clock and queue it for the next
/// write-behind flush. Call after EVERY change to persisted room state.
pub fn touch(app: &App, room: &mut Room) {
    room.updated_at = crate::now_ms();
    app.dirty.insert(room.id.clone());
}

/// Snapshot a room into its SQLite row (serializes the full state).
pub fn room_row(room: &Room) -> db::RoomRow {
    db::RoomRow {
        id: room.id.clone(),
        code: room.code.clone(),
        name: room.name.clone(),
        seats: room.seats as i64,
        host_id: room.host.clone(),
        persistent: room.persistent,
        started: room.started,
        state_json: serde_json::to_string(room).unwrap(),
        created_at: room.created_at,
        updated_at: room.updated_at,
    }
}

/// Drain the timeline changes that need persisting for one room and advance its
/// bookkeeping. Inserts only snapshots newer than what is already saved (usually
/// one per action); deletes exactly the hids dropped since the last flush; and
/// records the current cursor. Returns None when nothing timeline-related
/// changed.
fn take_history_delta(room: &mut Room) -> Option<db::HistoryDelta> {
    if !room.hist_dirty {
        return None;
    }
    let removed = std::mem::take(&mut room.hist_removed);
    let mut inserts: Vec<db::HistoryRow> = Vec::new();
    for s in &room.history {
        if room.hist_saved_hi.map_or(true, |hi| s.hid > hi) {
            inserts.push(db::HistoryRow {
                hid: s.hid,
                actor: s.actor.clone(),
                label: s.label.clone(),
                seq: s.seq,
                ts: s.ts,
                card_json: s.card.as_ref().map(|c| c.to_string()),
                state_json: s.json.clone(),
            });
        }
    }
    if let Some(max) = room.history.iter().map(|s| s.hid).max() {
        room.hist_saved_hi = Some(room.hist_saved_hi.map_or(max, |hi| hi.max(max)));
    }
    let cursor_hid = room.history.get(room.cursor).map(|s| s.hid as i64).unwrap_or(-1);
    room.hist_dirty = false;
    Some(db::HistoryDelta { room_id: room.id.clone(), removed, inserts, cursor_hid })
}

/// Write every dirty room to SQLite. Rows and timeline deltas are snapshotted
/// under the DashMap ref first, then written under one db lock (never both locks
/// at once).
pub fn flush_dirty(app: &App) {
    let ids: Vec<String> = app.dirty.iter().map(|e| e.key().clone()).collect();
    if ids.is_empty() {
        return;
    }
    let mut rows: Vec<db::RoomRow> = Vec::new();
    let mut deltas: Vec<db::HistoryDelta> = Vec::new();
    for id in ids {
        // Remove first so a concurrent mutation re-marks it for the next pass.
        app.dirty.remove(&id);
        if let Some(mut room) = app.rooms.get_mut(&id) {
            rows.push(room_row(&room));
            if let Some(delta) = take_history_delta(&mut room) {
                deltas.push(delta);
            }
        }
    }
    if rows.is_empty() {
        return;
    }
    let conn = app.db.lock().unwrap();
    for row in &rows {
        db::room_save(&conn, row);
    }
    for delta in &deltas {
        db::history_apply(&conn, delta);
    }
}

/// Fully remove a room: DB row, memory maps, seat index, and a room.closed
/// push to every seated user's live sockets.
pub fn delete_room(app: &App, room_id: &str) {
    let Some((_, room)) = app.rooms.remove(room_id) else {
        return;
    };
    app.codes.remove(&room.code);
    app.dirty.remove(room_id);
    for p in &room.players {
        app.user_rooms.remove_if(&p.user_id, |_, r| r.room_id == room_id);
    }
    for s in &room.spectators {
        app.user_rooms.remove_if(&s.user_id, |_, r| r.room_id == room_id);
    }
    db::room_delete(&app.db.lock().unwrap(), room_id);
    let msg = json!({"type": "room.closed", "roomId": room_id});
    for p in &room.players {
        ws::send_user(app, &p.user_id, &msg);
    }
}

const QUICK_TTL_MS: i64 = 24 * 60 * 60 * 1000; // all seats offline this long
const PERSISTENT_TTL_MS: i64 = 30 * 24 * 60 * 60 * 1000; // no action this long

/// Complete every pending commander choice whose 30s window has lapsed (the
/// original move is carried out as if the owner declined the command zone),
/// and dismiss trigger prompts nobody answered - the card's text stays
/// performable by hand, so a lapse never eats an effect silently.
pub fn expire_pending(app: &App) {
    let now = crate::now_ms();
    let due_rooms: Vec<String> = app
        .rooms
        .iter()
        .filter(|r| {
            r.pending_cmd.iter().any(|p| p.deadline <= now)
                || r.pending_triggers.iter().any(|p| p.deadline <= now)
        })
        .map(|r| r.id.clone())
        .collect();
    for id in due_rooms {
        let Some(mut room) = app.rooms.get_mut(&id) else {
            continue;
        };
        let (due, keep): (Vec<PendingCmd>, Vec<PendingCmd>) = std::mem::take(&mut room.pending_cmd)
            .into_iter()
            .partition(|p| p.deadline <= now);
        room.pending_cmd = keep;
        let (lapsed, alive): (Vec<PendingTrigger>, Vec<PendingTrigger>) =
            std::mem::take(&mut room.pending_triggers)
                .into_iter()
                .partition(|p| p.deadline <= now);
        room.pending_triggers = alive;
        if due.is_empty() && lapsed.is_empty() {
            continue;
        }
        for pending in due {
            let log = crate::game::complete_pending(&mut room, pending);
            room.seq += 1;
            let seq = room.seq;
            ws::room_log(app, &room, seq, &log);
        }
        for trigger in lapsed {
            room.seq += 1;
            let seq = room.seq;
            let line = format!(
                "{}'s trigger lapses unanswered: {}",
                trigger.source_name, trigger.text
            );
            ws::room_log(app, &room, seq, &line);
        }
        touch(app, &mut room);
        ws::room_send_states(app, &room);
    }
}

/// Every 2s: flush dirty rooms to SQLite (write-behind), resolve lapsed
/// commander choices, then expire rooms.
/// Rooms are no longer dropped just for being empty: quick rooms last 24h
/// after everyone goes offline, persistent lobbies 30 days after any action.
pub async fn sweeper(app: Arc<App>) {
    let mut interval = tokio::time::interval(Duration::from_secs(2));
    loop {
        interval.tick().await;
        flush_dirty(&app);
        expire_pending(&app);
        ws::draft_tick(&app);
        let now = crate::now_ms();
        let mut dead: Vec<String> = Vec::new();
        for room in app.rooms.iter() {
            let expired = if room.persistent {
                now - room.updated_at > PERSISTENT_TTL_MS
            } else {
                // Bots do not count as presence: a table kept "alive" only by
                // its bots still expires once every human is gone.
                room.players.iter().all(|p| p.is_bot || !p.online)
                    && now - room.updated_at > QUICK_TTL_MS
            };
            if expired {
                dead.push(room.id.clone());
            }
        }
        for id in dead {
            delete_room(&app, &id);
        }
    }
}
