use crate::rooms::{
    Attacker, Block, Card, Combat, DiceRollResult, GigDie, Mull, PendingCmd, Player, Room, StackEntry,
};
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

mod turns;
use turns::free_first_mulls;
// Re-exported so callers keep using `game::next_occupied`, `game::auto_turn_begin`, etc.
pub use turns::{
    auto_turn_begin, maybe_begin_first_turn, next_occupied, turn_clock_begin, turn_clock_credit,
    turn_clock_interaction,
};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Zone {
    Library,
    Hand,
    Battlefield,
    Graveyard,
    Exile,
    Command,
}

impl Zone {
    fn hidden(self) -> bool {
        matches!(self, Zone::Library | Zone::Hand)
    }

    fn desc(self) -> &'static str {
        match self {
            Zone::Library => "their library",
            Zone::Hand => "their hand",
            Zone::Battlefield => "the battlefield",
            Zone::Graveyard => "their graveyard",
            Zone::Exile => "exile",
            Zone::Command => "the command zone",
        }
    }

    /// The " from X" clause for a move, or nothing when the card never left the
    /// zone it started in - reordering a library should not read as "puts a
    /// card from their library on top of their library".
    fn origin_of(self, to: Zone) -> String {
        if self == to {
            String::new()
        } else {
            format!(" from {}", self.desc())
        }
    }
}

const PHASES: [&str; 7] = ["upkeep", "main1", "attack", "block", "damage", "main2", "end"];

/// Opening-hand size per game: Cyberpunk deals 6 (cyberpunktcg.com), Yu-Gi-Oh
/// deals 5, Magic 7.
pub fn opening_hand(game: &str) -> usize {
    match game {
        "cyberpunk" => 6,
        "yugioh" => 5,
        _ => 7,
    }
}

/// The opening-hand size in play: the host's override if set, else the game
/// default (MTG 7, Cyberpunk 6).
pub fn effective_hand_size(room: &crate::rooms::Room) -> usize {
    room.settings
        .starting_hand
        .unwrap_or_else(|| opening_hand(&room.game))
}

/// Whether the room mulligans Vancouver-style (draw one fewer card each time,
/// no bottoming) rather than London (draw a full hand, bottom N on keep).
pub fn is_vancouver(room: &crate::rooms::Room) -> bool {
    room.settings.mulligan_rule == "vancouver"
}

pub const CMD_CHOICE_MS: i64 = 30_000;
/// Legacy single-slot undo window. The live undo path is now the snapshot
/// timeline (see rooms::Room history/cursor); this and apply_undo below are
/// kept dormant to avoid churning the 40+ action arms that still record a
/// per-action UndoKind.
#[allow(dead_code)]
const UNDO_MS: i64 = 10_000;

/// The freeform Action set (serde tag "kind"). The server applies these
/// mechanically and never judges Magic legality.
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum Action {
    #[serde(rename = "card.move", rename_all = "camelCase")]
    CardMove {
        iid: String,
        to: Zone,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        x: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        y: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        index: Option<i64>,
        /// Land face-down (battlefield only): a Yu-Gi-Oh Set. The card is
        /// placed hidden IN THE SAME ACT, so its identity is never broadcast -
        /// moving face-up and flipping afterwards would leak it to everyone.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        face_down: bool,
    },
    #[serde(rename = "card.pos", rename_all = "camelCase")]
    CardPos { iid: String, x: f64, y: f64 },
    #[serde(rename = "card.tap", rename_all = "camelCase")]
    CardTap {
        iid: String,
        tapped: bool,
        /// Enforced rooms: which color a multi-producing land adds when tapped
        /// for mana ("W".."C"). Ignored elsewhere; absent = pick for me.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        mana: Option<String>,
    },
    #[serde(rename = "card.face", rename_all = "camelCase")]
    CardFace { iid: String, face_down: bool },
    #[serde(rename = "card.transform", rename_all = "camelCase")]
    CardTransform { iid: String, transformed: bool },
    #[serde(rename = "card.counter", rename_all = "camelCase")]
    CardCounter { iid: String, counter: String, delta: i64 },
    #[serde(rename = "card.attach", rename_all = "camelCase")]
    CardAttach {
        iid: String,
        #[serde(default)]
        host_iid: Option<String>,
        /// Join the host's PILE rather than hang off it as an aura. Ignored
        /// when `host_iid` is null - detach and unpile are one operation.
        /// Absent = false = the aura attach this action has always been, so an
        /// older client keeps working byte-for-byte.
        #[serde(default)]
        piled: bool,
    },
    /// Give a card to another seated player: it leaves the giver's zone and
    /// lands in the recipient's hand (ownership transfers with it).
    #[serde(rename = "card.give", rename_all = "camelCase")]
    CardGive { iid: String, to_user: String },
    #[serde(rename = "token.create", rename_all = "camelCase")]
    TokenCreate {
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        image_url: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        power: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        toughness: Option<String>,
        x: f64,
        y: f64,
    },
    #[serde(rename = "token.clone", rename_all = "camelCase")]
    TokenClone { iid: String, x: f64, y: f64 },
    #[serde(rename = "draw")]
    Draw { count: usize },
    /// Play the top card of the library straight onto the battlefield at (x,y),
    /// face up — the drag-from-deck gesture. The client can't name the top of a
    /// hidden library, so the server pops it.
    #[serde(rename = "library.play", rename_all = "camelCase")]
    LibraryPlay { x: f64, y: f64 },
    /// Cyberpunk: roll a Fixer die (d`sides`) into your Gig area.
    #[serde(rename = "gig.roll")]
    GigRoll { sides: u8 },
    /// Cyberpunk: send a rolled Gig die back to the Fixer.
    #[serde(rename = "gig.return")]
    GigReturn { sides: u8 },
    /// Cyberpunk: steal a rival's highest rolled Gig die into your own Gig area
    /// (the +1-per-10-Power mechanic). Lets your Gig count exceed six.
    #[serde(rename = "gig.steal", rename_all = "camelCase")]
    GigSteal { from: String },
    #[serde(rename = "shuffle")]
    Shuffle,
    #[serde(rename = "mulligan")]
    Mulligan,
    #[serde(rename = "untap.all")]
    UntapAll,
    #[serde(rename = "life.set")]
    LifeSet { value: i64 },
    #[serde(rename = "life.add")]
    LifeAdd { delta: i64 },
    /// Card effects that hit ANOTHER player: burn, drain, lifegain given
    /// away. Loudly logged with both names so the table always sees who did
    /// what to whom; undo covers misclicks like any other action.
    #[serde(rename = "life.deal", rename_all = "camelCase")]
    LifeDeal { seat: usize, delta: i64 },
    #[serde(rename = "cmd.damage", rename_all = "camelCase")]
    CmdDamage {
        from_seat: usize,
        delta: i64,
        /// Optional explicit attribution; defaults to the from-seat player's
        /// (first) flagged commander.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        commander_iid: Option<String>,
    },
    #[serde(rename = "poison.add")]
    PoisonAdd { delta: i64 },
    #[serde(rename = "mana.add")]
    ManaAdd { color: String, delta: i64 },
    #[serde(rename = "mana.clear")]
    ManaClear,
    #[serde(rename = "reveal.hand")]
    RevealHand,
    #[serde(rename = "reveal.card", rename_all = "camelCase")]
    RevealCard { iid: String },

    // --- gameplay v2: turns + phases ---
    #[serde(rename = "turn.pass")]
    TurnPass,
    #[serde(rename = "turn.set")]
    TurnSet { seat: usize },
    #[serde(rename = "phase.set")]
    PhaseSet { phase: String },
    #[serde(rename = "turn.auto")]
    TurnAuto { enabled: bool },

    // --- gameplay v2: shared stack ---
    #[serde(rename = "stack.push")]
    StackPush { iid: String },
    #[serde(rename = "stack.resolve", rename_all = "camelCase")]
    StackResolve {
        iid: String,
        to: Zone,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        x: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        y: Option<f64>,
    },
    #[serde(rename = "stack.counter", rename_all = "camelCase")]
    StackCounter { iid: String, to: Zone },

    // --- gameplay v2: guided combat ---
    #[serde(rename = "combat.begin")]
    CombatBegin,
    #[serde(rename = "combat.attack", rename_all = "camelCase")]
    CombatAttack {
        iid: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        defender_seat: Option<usize>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        power: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        toughness: Option<String>,
    },
    #[serde(rename = "combat.block", rename_all = "camelCase")]
    CombatBlock {
        blocker_iid: String,
        attacker_iid: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        power: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        toughness: Option<String>,
    },
    #[serde(rename = "combat.end")]
    CombatEnd,

    // --- enforced rooms only (rules.rs gates these; see PROTOCOL.md) ---
    /// Cast a spell from hand paying its real cost: the server spends floating
    /// mana, taps lands (auto-chosen, or exactly `payment` when the player
    /// picked their own), and puts the card where its type says it goes.
    #[serde(rename = "cast", rename_all = "camelCase")]
    Cast {
        iid: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        payment: Option<Vec<String>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        x: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        y: Option<f64>,
    },
    /// Attackers are final; defenders may now declare blocks.
    #[serde(rename = "combat.lock")]
    CombatLock,
    /// Blocks are final; the engine computes and broadcasts the damage preview.
    #[serde(rename = "combat.ready")]
    CombatReady,
    /// Apply the previewed outcome: damage, deaths, life, commander damage.
    #[serde(rename = "combat.resolve")]
    CombatResolve,
    /// Pass priority: no response to the current stack. Cleared whenever the
    /// stack changes; the top spell resolves once everyone else has passed.
    #[serde(rename = "stack.pass")]
    StackPass,

    // --- gameplay v2: commander machinery ---
    #[serde(rename = "cmd.cast", rename_all = "camelCase")]
    CmdCast { iid: String, x: f64, y: f64 },
    #[serde(rename = "cmd.return", rename_all = "camelCase")]
    CmdReturn { iid: String, accept: bool },
    #[serde(rename = "cmd.tax", rename_all = "camelCase")]
    CmdTax { iid: String, delta: i64 },

    // --- gameplay v2: dice + markers ---
    #[serde(rename = "dice.roll")]
    DiceRoll {
        sides: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        count: Option<u32>,
    },
    #[serde(rename = "marker.set")]
    MarkerSet { marker: String, seat: usize },
    #[serde(rename = "marker.day")]
    MarkerDay {
        #[serde(default)]
        value: Option<String>,
    },
    #[serde(rename = "marker.storm")]
    MarkerStorm { delta: i64 },

    // --- gameplay v2: zone viewers ---
    #[serde(rename = "library.peek")]
    LibraryPeek { count: usize },
    #[serde(rename = "library.reorder")]
    LibraryReorder { iids: Vec<String> },
    #[serde(rename = "library.bottom")]
    LibraryBottom { iids: Vec<String> },
    #[serde(rename = "library.search")]
    LibrarySearch,
    #[serde(rename = "library.reveal")]
    LibraryReveal { count: usize },

    // --- gameplay v2: mulligan + undo ---
    #[serde(rename = "mull.take")]
    MullTake,
    #[serde(rename = "mull.keep", rename_all = "camelCase")]
    MullKeep { bottom_iids: Vec<String> },
    #[serde(rename = "undo")]
    Undo,
    #[serde(rename = "redo")]
    Redo,
    /// Host-only destructive jump to any point in the timeline (index into the
    /// room's snapshot history).
    #[serde(rename = "rewindTo", rename_all = "camelCase")]
    RewindTo { index: usize },

    // --- match end ---
    #[serde(rename = "concede")]
    Concede,
}

/// What it takes to invert one simple action (kept per player for 10s).
#[derive(Clone)]
pub enum UndoKind {
    Move {
        iid: String,
        from: Zone,
        from_idx: usize,
        to: Zone,
        snapshot: Card,
        /// Token that ceased to exist when it left the battlefield.
        ceased: bool,
    },
    Pos { iid: String, x: f64, y: f64 },
    Tap { iid: String, tapped: bool },
    Face { iid: String, face_down: bool },
    Transform { iid: String, transformed: bool },
    Counter { iid: String, counter: String, prev: i64 },
    Token { iid: String },
    Attach { iid: String, prev_host: Option<String>, x: f64, y: f64 },
}

#[derive(Clone)]
pub struct UndoEntry {
    pub kind: UndoKind,
    pub ts: i64,
}

/// Result of applying an action: the rebroadcast payloads (the action object
/// with server-filled fields), log lines, whether viewers should get a fresh
/// per-viewer room.state (hidden-information changed), and any per-viewer
/// messages (library.cards, cmd.choice) that must NOT be broadcast.
pub struct Applied {
    pub for_actor: Value,
    pub for_others: Value,
    pub log: String,
    pub extra_logs: Vec<String>,
    pub resync: bool,
    /// (user_id, message). The actor's own entries go only to the acting
    /// connection; other users' entries go to all of their connections.
    pub private: Vec<(String, Value)>,
    /// Whether dispatch should append a new history snapshot for this action.
    /// True for normal mutating actions; false for undo/redo/rewind, which move
    /// the cursor over the existing timeline instead of extending it.
    pub record: bool,
}

type ActionError = (&'static str, String);

/// A moment the rules coach may want to comment on. Recorded during `apply`
/// and cashed in once the action has fully settled.
enum CoachEvent {
    LandPlayed,
    /// Carries the creature's name and whether it was ALREADY tapped before the
    /// declaration - declaring an attacker taps it, so reading the card
    /// afterwards would report every attacker as tapped.
    Attack { name: String, was_tapped: bool },
    TurnPass,
}

fn zone_lists(p: &mut Player) -> [(Zone, &mut Vec<Card>); 6] {
    [
        (Zone::Hand, &mut p.hand),
        (Zone::Battlefield, &mut p.battlefield),
        (Zone::Graveyard, &mut p.graveyard),
        (Zone::Exile, &mut p.exile),
        (Zone::Command, &mut p.command),
        (Zone::Library, &mut p.library),
    ]
}

fn zone_list_mut(p: &mut Player, z: Zone) -> &mut Vec<Card> {
    match z {
        Zone::Hand => &mut p.hand,
        Zone::Battlefield => &mut p.battlefield,
        Zone::Graveyard => &mut p.graveyard,
        Zone::Exile => &mut p.exile,
        Zone::Command => &mut p.command,
        Zone::Library => &mut p.library,
    }
}

fn take_card(p: &mut Player, iid: &str) -> Option<(Zone, usize, Card)> {
    for (zone, list) in zone_lists(p) {
        if let Some(i) = list.iter().position(|c| c.iid == iid) {
            return Some((zone, i, list.remove(i)));
        }
    }
    None
}

fn find_card_mut<'a>(p: &'a mut Player, iid: &str) -> Option<(Zone, &'a mut Card)> {
    for (zone, list) in zone_lists(p) {
        if let Some(i) = list.iter().position(|c| c.iid == iid) {
            return Some((zone, &mut list[i]));
        }
    }
    None
}

fn visible_name(card: &Card) -> String {
    if card.face_down {
        "a face-down card".to_string()
    } else {
        card.name.clone()
    }
}

fn plural(n: i64, one: &str, many: &str) -> String {
    if n.abs() == 1 { one.to_string() } else { many.to_string() }
}

fn not_found(iid: &str) -> ActionError {
    ("card_not_found", format!("No card {iid} in your zones"))
}

/// Clear `attachedTo` on every card glued to `host_iid` (any player).
fn clear_followers(room: &mut Room, host_iid: &str) {
    for p in room.players.iter_mut() {
        for c in p.battlefield.iter_mut() {
            if c.attached_to.as_deref() == Some(host_iid) {
                c.attached_to = None;
            }
        }
    }
}

/// Re-glue every card attached to `host_iid` next to (hx, hy). Returns the
/// moved cards' (iid, x, y) for the rebroadcast payload.
fn glue_followers(room: &mut Room, host_iid: &str, hx: f64, hy: f64) -> Vec<(String, f64, f64)> {
    let mut moved = Vec::new();
    // Auras fan wide and read as separate cards; pile members square up almost
    // on top of the base. Two counters, so an aura's offset never depends on
    // how many pile members happen to precede it - with no pile members this is
    // arithmetically identical to the single-counter version it replaced.
    let mut auras = 0usize;
    let mut piled = 0usize;
    for p in room.players.iter_mut() {
        for c in p.battlefield.iter_mut() {
            if c.attached_to.as_deref() == Some(host_iid) {
                let step = if c.piled {
                    piled += 1;
                    0.004 * piled as f64
                } else {
                    auras += 1;
                    0.018 * auras as f64
                };
                c.x = (hx + step).clamp(0.0, 1.0);
                c.y = (hy + step).clamp(0.0, 1.0);
                moved.push((c.iid.clone(), c.x, c.y));
            }
        }
    }
    moved
}

/// A card is LEAVING the battlefield: hand its pile to the next card down
/// instead of scattering it. The TOP remaining member (last in board order,
/// which IS pile order) becomes the new base at the leaver's position; the rest
/// re-point to it and stay piled. AURAS ARE NOT TOUCHED - `clear_followers`
/// still handles those, unchanged, and must be called right after this.
/// Single hop, non-recursive, matching clear_followers / glue_followers.
/// Returns true when a pile actually changed hands - the caller must then force
/// a resync, because it just rewrote `attachedTo` on cards the move's own
/// payload says nothing about and no client can derive the promotion locally.
fn promote_pile(room: &mut Room, host_iid: &str, bx: f64, by: f64) -> bool {
    let Some(promoted) = room
        .players
        .iter()
        .flat_map(|p| p.battlefield.iter())
        .filter(|c| c.attached_to.as_deref() == Some(host_iid) && c.piled)
        .map(|c| c.iid.clone())
        .next_back()
    else {
        return false;
    };
    for p in room.players.iter_mut() {
        for c in p.battlefield.iter_mut() {
            if c.attached_to.as_deref() != Some(host_iid) || !c.piled {
                continue;
            }
            if c.iid == promoted {
                c.attached_to = None;
                c.piled = false;
                c.x = bx.clamp(0.0, 1.0);
                c.y = by.clamp(0.0, 1.0);
            } else {
                c.attached_to = Some(promoted.clone());
            }
        }
    }
    true
}

fn seat_username(room: &Room, seat: usize) -> String {
    room.players
        .iter()
        .find(|p| p.seat == seat)
        .map(|p| p.username.clone())
        .unwrap_or_else(|| format!("seat {}", seat + 1))
}

/// Drop a card into one of its owner's zones with move cleanup applied
/// (untapped, face up, un-revealed, detached; counters cleared off-battlefield).
fn place_card(p: &mut Player, mut card: Card, to: Zone, x: Option<f64>, y: Option<f64>, index: Option<i64>) {
    card.tapped = false;
    card.face_down = false;
    card.revealed = false;
    card.transformed = false;
    card.attached_to = None;
    card.piled = false;
    if to == Zone::Battlefield {
        card.x = x.unwrap_or(0.5);
        card.y = y.unwrap_or(0.5);
    } else {
        card.counters.clear();
    }
    if to == Zone::Library {
        let idx = index.unwrap_or(0);
        let pos = if idx < 0 || idx as usize > p.library.len() {
            p.library.len()
        } else {
            idx as usize
        };
        p.library.insert(pos, card);
        p.peeked.clear();
    } else {
        zone_list_mut(p, to).push(card);
    }
}

/// Complete a pending commander move (owner declined the command zone, or the
/// 30s window lapsed). Returns the log line.
pub fn complete_pending(room: &mut Room, pending: PendingCmd) -> String {
    let name = pending.card.name.clone();
    let to = pending.to;
    let Some(idx) = room.players.iter().position(|p| p.user_id == pending.owner) else {
        return format!("{name} is removed from the game (owner left)");
    };
    let username = room.players[idx].username.clone();
    place_card(&mut room.players[idx], pending.card, to, pending.x, pending.y, pending.index);
    format!("{username}'s {name} is put into {}", to.desc())
}

/// The primary card an action concerns, for the timeline thumbnail. None for
/// cardless moves (life, draw, turn, markers, dice, ...).
pub fn action_card_iid(action: &Action) -> Option<&str> {
    match action {
        Action::CardMove { iid, .. }
        | Action::CardPos { iid, .. }
        | Action::CardTap { iid, .. }
        | Action::CardFace { iid, .. }
        | Action::CardTransform { iid, .. }
        | Action::CardCounter { iid, .. }
        | Action::CardAttach { iid, .. }
        | Action::CardGive { iid, .. }
        | Action::TokenClone { iid, .. }
        | Action::StackPush { iid }
        | Action::StackResolve { iid, .. }
        | Action::StackCounter { iid, .. }
        | Action::CombatAttack { iid, .. }
        | Action::CmdCast { iid, .. }
        | Action::CmdReturn { iid, .. }
        | Action::RevealCard { iid } => Some(iid),
        Action::CombatBlock { blocker_iid, .. } => Some(blocker_iid),
        _ => None,
    }
}

/// Any stack change opens a fresh response window: passes are void and the
/// timeout clock restarts. Freeform rooms carry the fields harmlessly.
fn stack_changed(room: &mut Room) {
    room.stack_passed.clear();
    room.stack_changed_ms = crate::now_ms();
}

/// Enforced tables: mana pools empty at every phase boundary (CR 500.4).
/// Freeform tables keep their pools - they are a manual tracker there.
fn empty_pools_if_enforced(room: &mut Room) {
    if !crate::rules::enforced(room) {
        return;
    }
    for p in room.players.iter_mut() {
        for v in p.mana.values_mut() {
            *v = 0;
        }
    }
}

/// An instant resolved while a combat preview was showing: the board moved
/// under the math, so recompute it (enforced rooms only).
fn refresh_combat_preview(app: &crate::App, room: &mut Room) {
    if !crate::rules::enforced(room) {
        return;
    }
    let stale = room.combat.as_ref().map(|c| c.preview.is_some()).unwrap_or(false);
    if stale {
        let preview = crate::rules::compute_preview(app, room);
        if let Some(combat) = room.combat.as_mut() {
            combat.preview = Some(preview);
        }
    }
}

/// Clear an in-progress combat at a turn boundary or combat.end. Combat is
/// purely informational bookkeeping, so clearing it just drops the overlay -
/// any life/creature changes were made manually by the players. A combat that
/// actually had attackers is stashed as `room.last_combat` (stamped with the
/// current seq) so bots can settle the damage it dealt them even when the
/// whole combat fit between two scheduler ticks.
pub fn clear_combat(room: &mut Room) {
    if let Some(combat) = room.combat.take() {
        if !combat.attackers.is_empty() {
            room.last_combat = Some(crate::rooms::EndedCombat { seq: room.seq, combat });
        }
    }
}

/// The requester's peek window, if it still matches the top of their library
/// (any other library mutation clears `peeked`, but double-check anyway).
fn peek_window(p: &Player) -> Option<Vec<String>> {
    if p.peeked.is_empty() {
        return None;
    }
    let k = p.peeked.len();
    if p.library.len() < k {
        return None;
    }
    let top: BTreeSet<&str> = p.library[..k].iter().map(|c| c.iid.as_str()).collect();
    if p.peeked.iter().all(|iid| top.contains(iid.as_str())) {
        Some(p.peeked.clone())
    } else {
        None
    }
}

/// Pop `iid` off the shared stack into `to` (of the card's owner). Handles the
/// commander interception and token evaporation. Returns the log line.
#[allow(clippy::too_many_arguments)]
fn resolve_from_stack(
    room: &mut Room,
    actor_username: &str,
    iid: &str,
    to: Zone,
    x: Option<f64>,
    y: Option<f64>,
    countered: bool,
    now: i64,
    private: &mut Vec<(String, Value)>,
) -> Result<String, ActionError> {
    let Some(pos) = room.stack.iter().position(|e| e.card.iid == iid) else {
        return Err(("not_on_stack", format!("No card {iid} on the stack")));
    };
    let entry = room.stack.remove(pos);
    let mut card = entry.card;
    card.revealed = false;
    let name = card.name.clone();
    let verb = if countered { "counters" } else { "resolves" };
    if !room.players.iter().any(|p| p.user_id == entry.owner) {
        return Ok(format!("{name} leaves the stack (owner left the room)"));
    }
    if crate::rooms::format_has_commander(&room.format)
        && card.is_commander
        && matches!(to, Zone::Graveyard | Zone::Exile | Zone::Hand | Zone::Library)
    {
        card.tapped = false;
        card.face_down = false;
        card.counters.clear();
        room.pending_cmd.push(PendingCmd {
            iid: iid.to_string(),
            owner: entry.owner.clone(),
            card,
            to,
            x,
            y,
            index: None,
            deadline: now + CMD_CHOICE_MS,
        });
        private.push((
            entry.owner.clone(),
            json!({"type": "cmd.choice", "iid": iid, "to": to}),
        ));
        return Ok(format!(
            "{actor_username} {verb} {name}, the commander may return to the command zone"
        ));
    }
    if card.is_token && to != Zone::Battlefield {
        return Ok(format!("{actor_username} {verb} {name}, the token ceases to exist"));
    }
    let owner_idx = room
        .players
        .iter()
        .position(|p| p.user_id == entry.owner)
        .unwrap();
    place_card(&mut room.players[owner_idx], card, to, x, y, None);
    Ok(format!("{actor_username} {verb} {name}"))
}

/// Invert one recorded simple action; Err(undo_stale) when it no longer
/// applies cleanly.
#[allow(dead_code)]
fn apply_undo(room: &mut Room, pi: usize, kind: UndoKind) -> Result<(), ActionError> {
    fn stale() -> ActionError {
        ("undo_stale", "that action can no longer be undone".to_string())
    }
    match kind {
        UndoKind::Move { iid, from, from_idx, to, snapshot, ceased } => {
            {
                let p = &mut room.players[pi];
                if ceased {
                    // The token evaporated; it must not have been recreated.
                    if find_card_mut(p, &iid).is_some() {
                        return Err(stale());
                    }
                } else {
                    let list = zone_list_mut(p, to);
                    let Some(pos) = list.iter().position(|c| c.iid == iid) else {
                        return Err(stale());
                    };
                    list.remove(pos);
                }
                let list = zone_list_mut(p, from);
                let pos = from_idx.min(list.len());
                list.insert(pos, snapshot);
                if from == Zone::Library || to == Zone::Library {
                    p.peeked.clear();
                }
            }
            Ok(())
        }
        UndoKind::Pos { iid, x, y } => {
            {
                let p = &mut room.players[pi];
                let Some(c) = p.battlefield.iter_mut().find(|c| c.iid == iid) else {
                    return Err(stale());
                };
                c.x = x;
                c.y = y;
            }
            glue_followers(room, &iid, x, y);
            Ok(())
        }
        UndoKind::Tap { iid, tapped } => {
            let p = &mut room.players[pi];
            let Some((_, c)) = find_card_mut(p, &iid) else {
                return Err(stale());
            };
            c.tapped = tapped;
            Ok(())
        }
        UndoKind::Face { iid, face_down } => {
            let p = &mut room.players[pi];
            let Some((_, c)) = find_card_mut(p, &iid) else {
                return Err(stale());
            };
            c.face_down = face_down;
            Ok(())
        }
        UndoKind::Transform { iid, transformed } => {
            let p = &mut room.players[pi];
            let Some((_, c)) = find_card_mut(p, &iid) else {
                return Err(stale());
            };
            c.transformed = transformed;
            Ok(())
        }
        UndoKind::Counter { iid, counter, prev } => {
            let p = &mut room.players[pi];
            let Some((_, c)) = find_card_mut(p, &iid) else {
                return Err(stale());
            };
            if prev <= 0 {
                c.counters.remove(&counter);
            } else {
                c.counters.insert(counter, prev);
            }
            Ok(())
        }
        UndoKind::Token { iid } => {
            {
                let p = &mut room.players[pi];
                let Some(pos) = p.battlefield.iter().position(|c| c.iid == iid && c.is_token)
                else {
                    return Err(stale());
                };
                p.battlefield.remove(pos);
            }
            clear_followers(room, &iid);
            Ok(())
        }
        // Note: `piled` is deliberately not restored here. This whole function
        // is dead (see the #[allow(dead_code)] above); real undo replays a full
        // Room snapshot, which carries every field including `piled`.
        UndoKind::Attach { iid, prev_host, x, y } => {
            let p = &mut room.players[pi];
            let Some(c) = p.battlefield.iter_mut().find(|c| c.iid == iid) else {
                return Err(stale());
            };
            c.attached_to = prev_host;
            c.x = x;
            c.y = y;
            Ok(())
        }
    }
}

/// Apply a freeform action for `actor_id`. Mutates the room; returns payloads
/// + log lines. Errors are (code, message) for a WS error frame. `app` is only
/// consulted for oracle card facts when the room opted into enforcement.
pub fn apply(app: &crate::App, room: &mut Room, actor_id: &str, action: Action) -> Result<Applied, ActionError> {
    let pi = room
        .players
        .iter()
        .position(|p| p.user_id == actor_id)
        .ok_or(("not_seated", "You are not seated in this room".to_string()))?;
    let username = room.players[pi].username.clone();
    let now = crate::now_ms();
    let actor_seat = room.players[pi].seat;

    // A finished match freezes the table: the result screen owns the room and
    // every further action (including stray hotkeys) is rejected outright. The
    // undo/redo/rewind timeline is the ONLY way back from an accidental
    // match-ending move, so those three are exempt - each restores a snapshot
    // recorded before maybe_finish_match ran (match_result: None), clearing the
    // freeze.
    let is_recovery = matches!(action, Action::Undo | Action::Redo | Action::RewindTo { .. });
    if room.match_result.is_some() && !is_recovery {
        return Err(("match_over", "the match is already over".to_string()));
    }
    // An enforced table runs every action past the rules first; the freeform
    // arms below then apply it unchanged. Rejections carry a human reason.
    if crate::rules::enforced(room) && room.started {
        crate::rules::check(app, room, pi, &action)?;
    }
    turn_clock_interaction(room, actor_seat, now);

    let base = serde_json::to_value(&action).unwrap();
    let mut for_actor = base.clone();
    let mut for_others = base;
    let mut resync = false;
    let mut extra_logs: Vec<String> = Vec::new();
    let mut private: Vec<(String, Value)> = Vec::new();
    let mut undo: Option<UndoKind> = None;
    // What the rules coach should look at once the action has settled. Set
    // inside the arms because `action`'s fields are partially moved by the
    // match; evaluated afterwards so the coach reads final state, not the
    // half-applied middle of a move.
    let mut coach_event: Option<CoachEvent> = None;
    // Undo/redo/rewind move the cursor over existing history rather than
    // recording a new snapshot; every other action records.
    let mut record = true;
    let log: String;

    match action {
        Action::CardMove { ref iid, to, x, y, index, face_down } => {
            let (from, from_idx, mut card) =
                take_card(&mut room.players[pi], iid).ok_or_else(|| not_found(iid))?;
            if matches!(from, Zone::Hand | Zone::Library | Zone::Command) && to == Zone::Battlefield {
                room.players[pi].cards_played += 1;
            }
            let snapshot = card.clone();
            // Zone privacy is game-aware: Yu-Gi-Oh's Extra Deck rides the
            // command slot and is hidden from opponents (rooms.rs masks it in
            // snapshots), so events about it must not name the card either.
            let extra_deck_hidden = room.game == "yugioh";
            let zone_hidden =
                move |zone: Zone| zone.hidden() || (extra_deck_hidden && zone == Zone::Command);
            // A Set lands hidden, so its identity is as private as the hand it
            // came from - the event may not carry the card either.
            let lands_hidden = face_down && to == Zone::Battlefield;
            let was_hidden = zone_hidden(from);
            let mut promoted = false;
            if from == Zone::Battlefield {
                // Hand the pile down before the aura sweep: after this nothing
                // points at the leaver with `piled`, so clear_followers is
                // provably the same aura-only sweep it has always been.
                promoted = promote_pile(room, iid, card.x, card.y);
                clear_followers(room, iid);
                card.attached_to = None;
                card.piled = false;
            }
            if to == Zone::Library {
                // An insert can displace the whole peek window.
                room.players[pi].peeked.clear();
            } else if from == Zone::Library {
                // Taking one peeked card (to hand / battlefield) shrinks the
                // window instead of killing it, so reorder/bottom on the
                // remaining fan keep working (mirrors LibraryBottom's retain).
                room.players[pi].peeked.retain(|w| w != iid);
            }
            if crate::rooms::format_has_commander(&room.format)
                && card.is_commander
                && matches!(to, Zone::Graveyard | Zone::Exile | Zone::Hand | Zone::Library)
            {
                // Hold the commander and ask the owner whether it goes to the
                // command zone instead; 30s of silence completes the move.
                card.tapped = false;
                card.face_down = false;
                card.revealed = false;
                card.counters.clear();
                let name = card.name.clone();
                room.pending_cmd.push(PendingCmd {
                    iid: iid.clone(),
                    owner: actor_id.to_string(),
                    card,
                    to,
                    x,
                    y,
                    index,
                    deadline: now + CMD_CHOICE_MS,
                });
                private.push((
                    actor_id.to_string(),
                    json!({"type": "cmd.choice", "iid": iid, "to": to}),
                ));
                for_actor["pending"] = json!(true);
                for_others["pending"] = json!(true);
                log = format!("{username}'s commander {name} may return to the command zone");
                resync = true;
            } else if card.is_token && to != Zone::Battlefield {
                // Tokens cease to exist when they leave the battlefield.
                log = format!("{username}'s {} token ceases to exist", card.name);
                undo = Some(UndoKind::Move {
                    iid: iid.clone(),
                    from,
                    from_idx,
                    to,
                    snapshot,
                    ceased: true,
                });
                resync = was_hidden || promoted;
            } else {
                let to_hidden = zone_hidden(to) || lands_hidden;
                card.tapped = false;
                card.face_down = lands_hidden;
                card.revealed = false;
                if to == Zone::Battlefield {
                    card.x = x.unwrap_or(0.5);
                    card.y = y.unwrap_or(0.5);
                    // Stamped for the coach only; nothing gates on it.
                    card.entered_turn = Some(room.turn_number);
                    // A tapland arrives tapped, so it cannot pay for a spell
                    // on the turn it is played. Enforced tables only: freeform
                    // keeps its hands off the cards.
                    card.tapped = crate::rules::enters_tapped(app, room, &card);
                    // Land classification: oracle facts first (covers every
                    // deck in enforced rooms), precon attrs as the fallback.
                    let is_land = crate::rules::facts(app, &card)
                        .map(|f| f.is_land())
                        .unwrap_or_else(|| crate::bot::is_land(&card));
                    if is_land {
                        room.players[pi].lands_this_turn += 1;
                        coach_event = Some(CoachEvent::LandPlayed);
                    }
                } else {
                    card.counters.clear();
                    card.entered_turn = None;
                }
                let name = card.name.clone();
                let card_val = serde_json::to_value(&card).unwrap();
                let p = &mut room.players[pi];
                if to == Zone::Library {
                    let idx = index.unwrap_or(0);
                    let pos = if idx < 0 || idx as usize > p.library.len() {
                        p.library.len()
                    } else {
                        idx as usize
                    };
                    p.library.insert(pos, card);
                    for_actor["card"] = card_val;
                    let display = if was_hidden { "a card".to_string() } else { name.clone() };
                    let place = match index.unwrap_or(0) {
                        0 => "on top of",
                        -1 => "on the bottom of",
                        _ => "into",
                    };
                    let origin = from.origin_of(to);
                    log = format!("{username} puts {display}{origin} {place} their library");
                } else {
                    zone_list_mut(p, to).push(card);
                    for_actor["card"] = card_val.clone();
                    if !to_hidden {
                        // Public destination: everyone learns the card.
                        for_others["card"] = card_val;
                    }
                    // A card that lands FACE-DOWN is never named, whatever it
                    // came from: the whole point of a Set is that the table
                    // cannot tell which card it is.
                    let name_public = (!to_hidden || !was_hidden) && !lands_hidden;
                    let display = if name_public { name } else { "a card".to_string() };
                    // Name the source zone, and pick the verb that matches the
                    // move: watching the log should tell you whether a creature
                    // was cast, reanimated or fetched, not just that it "went
                    // onto the battlefield". `display` is already privacy-safe,
                    // so naming the origin never leaks more than the move did.
                    let origin = from.origin_of(to);
                    log = match to {
                        Zone::Hand => match from {
                            Zone::Library => {
                                format!("{username} pulls {display} from their library into their hand")
                            }
                            _ => format!("{username} returns {display}{origin} to their hand"),
                        },
                        Zone::Battlefield if lands_hidden => {
                            format!("{username} sets {display}{origin} face-down")
                        }
                        Zone::Battlefield => match from {
                            Zone::Hand | Zone::Library => {
                                format!("{username} plays {display}{origin} onto the battlefield")
                            }
                            Zone::Graveyard | Zone::Exile | Zone::Command => {
                                format!("{username} returns {display}{origin} to the battlefield")
                            }
                            Zone::Battlefield => {
                                format!("{username} puts {display} onto the battlefield")
                            }
                        },
                        Zone::Graveyard => match from {
                            Zone::Hand => format!("{username} discards {display}"),
                            _ => format!("{username} puts {display}{origin} into their graveyard"),
                        },
                        Zone::Exile => format!("{username} exiles {display}{origin}"),
                        Zone::Command => {
                            format!("{username} puts {display}{origin} into the command zone")
                        }
                        Zone::Library => unreachable!(),
                    };
                }
                undo = Some(UndoKind::Move {
                    iid: iid.clone(),
                    from,
                    from_idx,
                    to,
                    snapshot,
                    ceased: false,
                });
                resync = was_hidden || to_hidden || promoted;
            }
        }

        Action::CardPos { ref iid, x, y } => {
            let (prev_x, prev_y);
            {
                let p = &mut room.players[pi];
                let (_, card) = find_card_mut(p, iid).ok_or_else(|| not_found(iid))?;
                prev_x = card.x;
                prev_y = card.y;
                card.x = x;
                card.y = y;
            }
            // Attached cards stay glued to their host.
            let moved = glue_followers(room, iid, x, y);
            if !moved.is_empty() {
                let arr: Vec<Value> = moved
                    .iter()
                    .map(|(i, mx, my)| json!({"iid": i, "x": mx, "y": my}))
                    .collect();
                for_actor["attachments"] = json!(arr);
                for_others["attachments"] = json!(arr);
            }
            // Repositioning a card on the battlefield is fidget, not a game
            // event: no log line (an empty log is skipped by dispatch_action).
            log = String::new();
            undo = Some(UndoKind::Pos { iid: iid.clone(), x: prev_x, y: prev_y });
        }

        Action::CardTap { ref iid, tapped, ref mana } => {
            // Enforced rooms: tapping your own land floats its mana into the
            // pool (the manual-payment flow: tap lands, then cast).
            let mut floated: Option<char> = None;
            if crate::rules::enforced(room) && tapped {
                let p = &room.players[pi];
                if let Some(card) = p.battlefield.iter().find(|c| c.iid == *iid) {
                    if let Some(f) = crate::rules::facts(app, card) {
                        if f.is_land() && !f.produced.is_empty() {
                            let want = mana.as_deref().and_then(|m| m.chars().next());
                            let color = want
                                .filter(|c| f.produced.contains(c))
                                .unwrap_or(f.produced[0]);
                            floated = Some(color);
                        }
                    }
                }
            }
            let p = &mut room.players[pi];
            let (_, card) = find_card_mut(p, iid).ok_or_else(|| not_found(iid))?;
            let prev = card.tapped;
            card.tapped = tapped;
            let name = visible_name(card);
            let verb = if tapped { "taps" } else { "untaps" };
            if let Some(color) = floated {
                *p.mana.entry(color.to_string()).or_insert(0) += 1;
                resync = true; // the pool travels via state_for
                log = format!("{username} taps {name} for {{{color}}}");
            } else {
                log = format!("{username} {verb} {name}");
            }
            undo = Some(UndoKind::Tap { iid: iid.clone(), tapped: prev });
        }

        Action::CardFace { ref iid, face_down } => {
            let p = &mut room.players[pi];
            let (_, card) = find_card_mut(p, iid).ok_or_else(|| not_found(iid))?;
            let prev = card.face_down;
            card.face_down = face_down;
            if !face_down {
                // Turning face up reveals the card to everyone.
                let cv = serde_json::to_value(&*card).unwrap();
                for_actor["card"] = cv.clone();
                for_others["card"] = cv;
                log = format!("{username} turns {} face up", card.name);
            } else {
                log = format!("{username} turns {} face down", card.name);
                resync = true; // others must now see the masked card
            }
            undo = Some(UndoKind::Face { iid: iid.clone(), face_down: prev });
        }

        Action::CardTransform { ref iid, transformed } => {
            let p = &mut room.players[pi];
            let (_, card) = find_card_mut(p, iid).ok_or_else(|| not_found(iid))?;
            let prev = card.transformed;
            card.transformed = transformed;
            let verb = if transformed { "transforms" } else { "unflips" };
            log = format!("{username} {verb} {}", visible_name(card));
            undo = Some(UndoKind::Transform { iid: iid.clone(), transformed: prev });
        }

        Action::CardCounter { ref iid, ref counter, delta } => {
            let p = &mut room.players[pi];
            let (_, card) = find_card_mut(p, iid).ok_or_else(|| not_found(iid))?;
            let prev = card.counters.get(counter).copied().unwrap_or(0);
            let entry = card.counters.entry(counter.clone()).or_insert(0);
            *entry += delta;
            if *entry <= 0 {
                card.counters.remove(counter);
            }
            let noun = plural(delta, "counter", "counters");
            log = if delta >= 0 {
                format!("{username} puts {delta} {counter} {noun} on {}", visible_name(card))
            } else {
                format!("{username} removes {} {counter} {noun} from {}", -delta, visible_name(card))
            };
            undo = Some(UndoKind::Counter { iid: iid.clone(), counter: counter.clone(), prev });
        }

        Action::CardGive { ref iid, ref to_user } => {
            let Some(ti) = room.players.iter().position(|p| &p.user_id == to_user) else {
                return Err(("no_player", "That player is not at the table".to_string()));
            };
            if ti == pi {
                return Err(("bad_target", "cannot give a card to yourself".to_string()));
            }
            let (from, _from_idx, mut card) =
                take_card(&mut room.players[pi], iid).ok_or_else(|| not_found(iid))?;
            let was_hidden = from.hidden();
            if from == Zone::Battlefield {
                // resync is already forced below (both hands changed).
                let _ = promote_pile(room, iid, card.x, card.y);
                clear_followers(room, iid);
            }
            if from == Zone::Library {
                room.players[pi].peeked.clear();
            }
            // A given card resets to a clean, private hand card; ownership (and
            // any commander flag) transfers with it.
            card.tapped = false;
            card.face_down = false;
            card.revealed = false;
            card.attached_to = None;
            card.piled = false;
            card.is_commander = false;
            card.counters.clear();
            let name = card.name.clone();
            let recipient = room.players[ti].username.clone();
            room.players[ti].hand.push(card);
            let display = if was_hidden { "a card".to_string() } else { name };
            log = format!("{username} gives {display} to {recipient}");
            resync = true; // both hands (hidden) changed; everyone re-filters
        }

        Action::CardAttach { ref iid, ref host_iid, piled } => {
            match host_iid {
                Some(h0) => {
                    // A pile reads as ONE object, so a piled card is never a
                    // host: a drop aimed at a member resolves to its base.
                    // Unconditional (an aura dropped on a pile lands on the
                    // base too), and one hop only - piles never nest.
                    let h: String = room
                        .players
                        .iter()
                        .flat_map(|p| p.battlefield.iter())
                        .find(|c| c.iid == *h0)
                        .and_then(|c| if c.piled { c.attached_to.clone() } else { None })
                        .unwrap_or_else(|| h0.clone());
                    if h == *iid {
                        return Err(("bad_attach", "cannot attach a card to itself".to_string()));
                    }
                    // The host may be on ANY battlefield (auras on opposing
                    // creatures); the attached card must be the actor's.
                    let mut host: Option<(f64, f64, String)> = None;
                    let mut host_is_mine = false;
                    let mut auras = 0usize;
                    let mut piled_n = 0usize;
                    for (idx, pl) in room.players.iter().enumerate() {
                        for c in pl.battlefield.iter() {
                            if c.iid == h {
                                host = Some((c.x, c.y, c.name.clone()));
                                host_is_mine = idx == pi;
                            }
                            if c.attached_to.as_deref() == Some(h.as_str()) && c.iid != *iid {
                                if c.piled {
                                    piled_n += 1;
                                } else {
                                    auras += 1;
                                }
                            }
                        }
                    }
                    let Some((hx, hy, host_name)) = host else {
                        return Err(("card_not_found", format!("No card {h} on the battlefield")));
                    };
                    // Unlike an aura - which may legally sit on an OPPONENT's
                    // creature - a pile is your own cards on your own board.
                    // leave_room does no follower cleanup, so a cross-seat pile
                    // would dangle when that seat walks.
                    if piled && !host_is_mine {
                        return Err(("bad_pile", "a pile is your own cards on your own board".to_string()));
                    }
                    let p = &mut room.players[pi];
                    let Some(card) = p.battlefield.iter_mut().find(|c| c.iid == *iid) else {
                        return Err(("card_not_found", format!("No card {iid} on your battlefield")));
                    };
                    let prev = (card.attached_to.clone(), card.x, card.y);
                    card.attached_to = Some(h.clone());
                    // Always assigned, never merely set: re-attaching a former
                    // pile member as an aura must clear the bit, and vice versa.
                    card.piled = piled;
                    let step = if piled {
                        0.004 * (piled_n as f64 + 1.0)
                    } else {
                        0.018 * (auras as f64 + 1.0)
                    };
                    card.x = (hx + step).clamp(0.0, 1.0);
                    card.y = (hy + step).clamp(0.0, 1.0);
                    let (nx, ny, name) = (card.x, card.y, card.name.clone());
                    if piled {
                        // Board order IS pile order: a joining card goes on top,
                        // so it moves to the end of its owner's battlefield.
                        // Every zone but the library is unordered and every
                        // other consumer is iid-keyed, so this is invisible
                        // outside the pile - promote_pile and the client's
                        // splitPile both read it.
                        if let Some(pos) = p.battlefield.iter().position(|c| c.iid == *iid) {
                            let c = p.battlefield.remove(pos);
                            p.battlefield.push(c);
                        }
                    }
                    for v in [&mut for_actor, &mut for_others] {
                        v["x"] = json!(nx);
                        v["y"] = json!(ny);
                    }
                    log = if piled {
                        format!("{username} piles {name} onto {host_name}")
                    } else {
                        format!("{username} attaches {name} to {host_name}")
                    };
                    undo = Some(UndoKind::Attach {
                        iid: iid.clone(),
                        prev_host: prev.0,
                        x: prev.1,
                        y: prev.2,
                    });
                    resync = true; // attachedTo lives in RoomState
                }
                None => {
                    // Read what we need before taking the mutable borrow.
                    let (was_piled, base_iid) = {
                        let p = &room.players[pi];
                        let Some(card) = p.battlefield.iter().find(|c| c.iid == *iid) else {
                            return Err(("card_not_found", format!("No card {iid} on your battlefield")));
                        };
                        (card.piled && card.attached_to.is_some(), card.attached_to.clone())
                    };
                    // Piles are single-seat, so the base is on my own board.
                    // Land beside it, then step right past anything already
                    // parked there - peeling four lands off a pile one at a
                    // time must not drop all four on the same square.
                    let base_pos = if was_piled {
                        base_iid
                            .as_deref()
                            .and_then(|b| {
                                room.players[pi].battlefield.iter().find(|c| c.iid == b).map(|c| (c.x, c.y))
                            })
                            .map(|(bx, by)| {
                                let mut nx = bx + 0.055;
                                while nx < 1.0
                                    && room.players[pi].battlefield.iter().any(|c| {
                                        c.iid != *iid
                                            && c.attached_to.is_none()
                                            && (c.x - nx).abs() < 0.03
                                            && (c.y - by).abs() < 0.03
                                    })
                                {
                                    nx += 0.045;
                                }
                                (nx, by)
                            })
                    } else {
                        None
                    };
                    let p = &mut room.players[pi];
                    let Some(card) = p.battlefield.iter_mut().find(|c| c.iid == *iid) else {
                        return Err(("card_not_found", format!("No card {iid} on your battlefield")));
                    };
                    let prev = (card.attached_to.clone(), card.x, card.y);
                    card.attached_to = None;
                    card.piled = false;
                    if let Some((bx, by)) = base_pos {
                        // A card taken off a pile lands NEXT to it, not under
                        // it, so it is visible the instant it is peeled.
                        card.x = (bx + 0.055).clamp(0.0, 1.0);
                        card.y = by.clamp(0.0, 1.0);
                    }
                    let (nx, ny) = (card.x, card.y);
                    log = if was_piled {
                        format!("{username} takes {} off the pile", card.name)
                    } else {
                        format!("{username} unattaches {}", card.name)
                    };
                    for v in [&mut for_actor, &mut for_others] {
                        v["x"] = json!(nx);
                        v["y"] = json!(ny);
                    }
                    undo = Some(UndoKind::Attach {
                        iid: iid.clone(),
                        prev_host: prev.0,
                        x: prev.1,
                        y: prev.2,
                    });
                    resync = true;
                }
            }
        }

        Action::TokenCreate { ref name, ref image_url, ref power, ref toughness, x, y } => {
            let p = &mut room.players[pi];
            let token = Card {
                iid: crate::hex_id(8),
                scryfall_id: None,
                name: name.clone(),
                image_url: image_url.clone(),
                tapped: false,
                face_down: false,
                counters: BTreeMap::new(),
                x,
                y,
                is_token: true,
                power: power.clone(),
                toughness: toughness.clone(),
                attached_to: None,
                piled: false,
                is_commander: false,
                revealed: false,
                transformed: false,
                entered_turn: Some(room.turn_number),
            };
            let cv = serde_json::to_value(&token).unwrap();
            for_actor["card"] = cv.clone();
            for_others["card"] = cv;
            log = format!("{username} creates a {name} token");
            undo = Some(UndoKind::Token { iid: token.iid.clone() });
            p.battlefield.push(token);
        }

        Action::TokenClone { ref iid, x, y } => {
            let p = &mut room.players[pi];
            let src = p
                .battlefield
                .iter()
                .find(|c| c.iid == *iid)
                .ok_or_else(|| ("card_not_found", format!("No card {iid} on your battlefield")))?;
            let mut copy = src.clone();
            copy.iid = crate::hex_id(8);
            copy.is_token = true;
            copy.tapped = false;
            copy.attached_to = None;
            copy.piled = false;
            copy.is_commander = false;
            copy.revealed = false;
            copy.x = x;
            copy.y = y;
            let cv = serde_json::to_value(&copy).unwrap();
            for_actor["card"] = cv.clone();
            for_others["card"] = cv;
            log = format!("{username} creates a token copy of {}", copy.name);
            p.battlefield.push(copy);
        }

        Action::Draw { count } => {
            let p = &mut room.players[pi];
            let n = count.min(p.library.len());
            let drawn: Vec<Card> = p.library.drain(0..n).collect();
            p.cards_drawn += n as u64;
            p.hand_revealed = false; // any draw makes the hand private again
            p.peeked.clear();
            for_actor["cards"] = serde_json::to_value(&drawn).unwrap();
            p.hand.extend(drawn);
            log = format!("{username} draws {n} {}", plural(n as i64, "card", "cards"));
            resync = true;
        }

        Action::LibraryPlay { x, y } => {
            let p = &mut room.players[pi];
            if p.library.is_empty() {
                return Err(("empty_library", "no cards left in the library".to_string()));
            }
            let mut card = p.library.remove(0);
            card.x = x.clamp(0.0, 1.0);
            card.y = y.clamp(0.0, 1.0);
            card.face_down = false;
            card.tapped = false;
            card.attached_to = None;
            card.piled = false;
            p.peeked.clear();
            let name = card.name.clone();
            p.battlefield.push(card);
            p.cards_played += 1;
            log = format!("{username} plays {name} from the top of their library");
            resync = true;
        }

        Action::GigRoll { sides } => {
            use rand::Rng;
            let roll = rand::rng().random_range(1..=sides.max(1));
            let p = &mut room.players[pi];
            if let Some(die) = p.gig_dice.iter_mut().find(|d| d.sides == sides) {
                die.value = roll;
                die.in_gig = true;
            }
            log = format!("{username} rolls a d{sides} into their Gig area: {roll}");
            resync = true;
        }

        Action::GigReturn { sides } => {
            let p = &mut room.players[pi];
            // A stolen die returned goes back to its rival's Gig; an own die
            // returned drops back into the Fixer. Prefer returning a stolen copy
            // (it's the reversible one) when sides collide.
            if let Some(idx) = p
                .gig_dice
                .iter()
                .position(|d| d.sides == sides && d.stolen)
                .or_else(|| p.gig_dice.iter().position(|d| d.sides == sides))
            {
                if p.gig_dice[idx].stolen {
                    let die = p.gig_dice.remove(idx);
                    // Give it back to the original owner's Gig, if they're still seated.
                    if let Some(from) = die.from.as_deref() {
                        if let Some(ti) = room.players.iter().position(|q| q.username == from) {
                            room.players[ti].gig_dice.push(GigDie {
                                sides: die.sides,
                                value: die.value,
                                in_gig: true,
                                stolen: false,
                                from: None,
                            });
                        }
                    }
                    log = format!("{username} returns the stolen d{sides}");
                } else {
                    let die = &mut p.gig_dice[idx];
                    die.value = 0;
                    die.in_gig = false;
                    log = format!("{username} returns the d{sides} to the Fixer");
                }
            } else {
                log = format!("{username} returns the d{sides} to the Fixer");
            }
            resync = true;
        }

        Action::GigSteal { from } => {
            // Take the target's highest-value rolled die and move it into the
            // actor's Gig as a stolen die (their Gig count can now pass six).
            let taken = room
                .players
                .iter()
                .position(|p| p.user_id == from)
                .filter(|&ti| ti != pi)
                .and_then(|ti| {
                    let name = room.players[ti].username.clone();
                    let t = &mut room.players[ti];
                    t.gig_dice
                        .iter()
                        .enumerate()
                        .filter(|(_, d)| d.in_gig)
                        .max_by_key(|(_, d)| d.value)
                        .map(|(i, _)| i)
                        .map(|idx| (t.gig_dice.remove(idx), name))
                });
            if let Some((mut die, target_name)) = taken {
                let sides = die.sides;
                die.in_gig = true;
                die.stolen = true;
                die.from = Some(target_name.clone());
                room.players[pi].gig_dice.push(die);
                log = format!("{username} steals a d{sides} from {target_name}'s Gig");
            } else {
                log = format!("{username} tries to steal a Gig die, but there's none to take");
            }
            resync = true;
        }

        Action::Shuffle => {
            let p = &mut room.players[pi];
            p.library.shuffle(&mut rand::rng());
            p.peeked.clear();
            log = format!("{username} shuffles their library");
        }

        Action::Mulligan => {
            let deal = opening_hand(&room.game);
            let p = &mut room.players[pi];
            let hand: Vec<Card> = p.hand.drain(..).collect();
            p.library.extend(hand);
            p.library.shuffle(&mut rand::rng());
            let n = deal.min(p.library.len());
            let drawn: Vec<Card> = p.library.drain(0..n).collect();
            p.hand_revealed = false;
            p.peeked.clear();
            for_actor["cards"] = serde_json::to_value(&drawn).unwrap();
            p.hand.extend(drawn);
            log = format!("{username} mulligans and draws {n}");
            resync = true;
        }

        Action::UntapAll => {
            let p = &mut room.players[pi];
            for card in p.battlefield.iter_mut() {
                card.tapped = false;
            }
            log = format!("{username} untaps all their permanents");
        }

        Action::LifeSet { value } => {
            room.players[pi].life = value;
            log = format!("{username} sets their life to {value}");
        }

        Action::LifeDeal { seat, delta } => {
            let Some(target) = room.players.iter_mut().find(|p| p.seat == seat) else {
                return Err(("no_such_seat", format!("seat {seat} is not occupied")));
            };
            target.life += delta;
            let target_name = target.username.clone();
            log = if delta < 0 {
                format!("{username} deals {} damage to {target_name}", -delta)
            } else {
                format!("{username} gives {target_name} {delta} life")
            };
            resync = true;
        }

        Action::LifeAdd { delta } => {
            let p = &mut room.players[pi];
            p.life += delta;
            let life = p.life;
            log = if delta >= 0 {
                format!("{username} gains {delta} life ({life})")
            } else {
                format!("{username} loses {} life ({life})", -delta)
            };
        }

        Action::CmdDamage { from_seat, delta, ref commander_iid } => {
            let from_name = room
                .players
                .iter()
                .find(|p| p.seat == from_seat)
                .map(|p| p.username.clone())
                .unwrap_or_else(|| format!("seat {from_seat}"));
            // Per-commander attribution: explicit iid wins, else the from-seat
            // player's first flagged commander (partners need the explicit iid).
            let attributed = commander_iid.clone().or_else(|| {
                room.players.iter().find(|p| p.seat == from_seat).and_then(|fp| {
                    fp.command
                        .iter()
                        .chain(fp.battlefield.iter())
                        .chain(fp.graveyard.iter())
                        .chain(fp.exile.iter())
                        .chain(fp.hand.iter())
                        .chain(fp.library.iter())
                        .find(|c| c.is_commander)
                        .map(|c| c.iid.clone())
                })
            });
            let p = &mut room.players[pi];
            let entry = p.cmd_damage.entry(from_seat).or_insert(0);
            let before = *entry;
            *entry = (*entry + delta).max(0);
            let total = *entry;
            // Commander damage IS combat damage: it also lowers the player's life
            // total (the separate 21-from-one-commander loss rule is tracked by
            // the tallies above). Mirror the *effective* change so a decrement
            // clamped at zero commander damage doesn't hand back phantom life.
            let applied = total - before;
            p.life -= applied;
            let life = p.life;
            if let Some(ciid) = attributed {
                let by = p.cmd_damage_by_commander.entry(ciid).or_insert(0);
                *by = (*by + delta).max(0);
                resync = true; // by-commander tally is only in RoomState
            }
            log = if applied >= 0 {
                format!("{from_name} deals {applied} commander damage to {username} ({total} total, {life} life)")
            } else {
                format!("{username} removes {} commander damage from {from_name} ({total} total, {life} life)", -applied)
            };
        }

        Action::PoisonAdd { delta } => {
            let p = &mut room.players[pi];
            p.poison = (p.poison + delta).max(0);
            let total = p.poison;
            let noun = plural(delta, "poison counter", "poison counters");
            log = if delta >= 0 {
                format!("{username} gets {delta} {noun} ({total} total)")
            } else {
                format!("{username} removes {} {noun} ({total} total)", -delta)
            };
        }

        Action::ManaAdd { ref color, delta } => {
            if !matches!(color.as_str(), "W" | "U" | "B" | "R" | "G" | "C") {
                return Err(("invalid_mana", "unsupported mana color".to_string()));
            }
            let value = room.players[pi]
                .mana
                .entry(color.clone())
                .or_insert(0);
            *value = value.saturating_add(delta).clamp(0, 999);
            for_actor["value"] = json!(*value);
            for_others["value"] = json!(*value);
            log = String::new();
            record = false;
        }

        Action::ManaClear => {
            room.players[pi].mana = crate::rooms::empty_mana();
            log = String::new();
            record = false;
        }

        Action::RevealHand => {
            room.players[pi].hand_revealed = true;
            log = format!("{username} reveals their hand");
            resync = true; // other players' next room.state includes the hand
        }

        Action::RevealCard { ref iid } => {
            let p = &mut room.players[pi];
            let card = p
                .hand
                .iter_mut()
                .find(|c| c.iid == *iid)
                .ok_or_else(|| ("card_not_found", format!("No card {iid} in your hand")))?;
            card.revealed = true;
            let name = card.name.clone();
            log = format!("{username} reveals {name} from their hand");
            resync = true; // every viewer's next room.state includes the revealed card
        }

        // --- turns + phases ---

        Action::TurnPass => {
            let (next, wrapped) = next_occupied(room, room.active_seat);
            if wrapped {
                room.turn_number += 1;
            }
            turn_clock_credit(room, now);
            room.active_seat = next;
            turn_clock_begin(room, next, now);
            clear_combat(room);
            empty_pools_if_enforced(room);
            if room.auto_turn {
                room.phase = "main1".to_string();
                extra_logs.extend(auto_turn_begin(room, next));
            }
            let target = seat_username(room, next);
            for v in [&mut for_actor, &mut for_others] {
                v["turnNumber"] = json!(room.turn_number);
                v["activeSeat"] = json!(room.active_seat);
                v["phase"] = json!(room.phase);
            }
            log = format!("{username} passes the turn to {target} (turn {})", room.turn_number);
            resync = true;
            coach_event = Some(CoachEvent::TurnPass);
        }

        Action::TurnSet { seat } => {
            let Some(target_p) = room.players.iter().find(|p| p.seat == seat) else {
                return Err(("no_such_seat", format!("seat {seat} is not occupied")));
            };
            if target_p.conceded {
                return Err(("conceded", format!("seat {seat} has conceded")));
            }
            // Handing the turn at-or-behind the current seat wraps past the
            // start of the order — that is a new turn round.
            let wrapped = seat <= room.active_seat;
            if wrapped {
                room.turn_number += 1;
            }
            turn_clock_credit(room, now);
            room.active_seat = seat;
            turn_clock_begin(room, seat, now);
            clear_combat(room);
            if room.auto_turn {
                room.phase = "main1".to_string();
                extra_logs.extend(auto_turn_begin(room, seat));
            }
            let target = seat_username(room, seat);
            for v in [&mut for_actor, &mut for_others] {
                v["turnNumber"] = json!(room.turn_number);
                v["activeSeat"] = json!(room.active_seat);
                v["phase"] = json!(room.phase);
            }
            log = format!("{username} hands the turn to {target} (turn {})", room.turn_number);
            resync = true;
        }

        Action::PhaseSet { ref phase } => {
            if !PHASES.contains(&phase.as_str()) {
                return Err(("invalid_phase", format!("unknown phase {phase}")));
            }
            room.phase = phase.clone();
            log = format!("{username} sets the phase to {phase}");
            resync = true;
        }

        Action::TurnAuto { enabled } => {
            if room.host != actor_id {
                return Err(("forbidden", "only the host can toggle automatic turns".to_string()));
            }
            room.auto_turn = enabled;
            let onoff = if enabled { "on" } else { "off" };
            log = format!("{username} turns automatic turns {onoff}");
            resync = true;
        }

        // --- shared stack ---

        Action::StackPush { ref iid } => {
            let (from, _idx, mut card) =
                take_card(&mut room.players[pi], iid).ok_or_else(|| not_found(iid))?;
            if from == Zone::Library {
                room.players[pi].peeked.clear();
            }
            if from == Zone::Battlefield {
                // StackPush forces a resync of its own further down.
                let _ = promote_pile(room, iid, card.x, card.y);
                clear_followers(room, iid);
            }
            card.attached_to = None;
            card.piled = false;
            card.tapped = false;
            card.face_down = false;
            if from.hidden() {
                // Arriving from a hidden zone reveals the card to the table.
                card.revealed = true;
            }
            let cv = serde_json::to_value(&card).unwrap();
            for_actor["card"] = cv.clone();
            for_others["card"] = cv;
            // The stack is not a Zone, so there is no same-zone case to suppress
            // here: every push genuinely comes from somewhere else.
            log = format!("{username} puts {} from {} on the stack", card.name, from.desc());
            room.stack.push(StackEntry { owner: actor_id.to_string(), card });
            stack_changed(room);
            if matches!(from, Zone::Hand | Zone::Library | Zone::Command) {
                room.players[pi].cards_played += 1;
            }
            resync = true;
        }

        Action::StackResolve { ref iid, to, x, y } => {
            log = resolve_from_stack(room, &username, iid, to, x, y, false, now, &mut private)?;
            stack_changed(room);
            refresh_combat_preview(app, room);
            resync = true;
        }

        Action::StackCounter { ref iid, to } => {
            log = resolve_from_stack(room, &username, iid, to, None, None, true, now, &mut private)?;
            stack_changed(room);
            refresh_combat_preview(app, room);
            resync = true;
        }

        Action::StackPass => {
            if !room.stack_passed.contains(&actor_seat) {
                room.stack_passed.push(actor_seat);
            }
            log = format!("{username} passes");
            resync = true;
        }

        // --- guided combat ---

        Action::CombatBegin => {
            room.combat = Some(Combat::default());
            room.phase = "attack".to_string();
            empty_pools_if_enforced(room);
            log = format!("{username} begins combat");
            resync = true;
        }

        Action::CombatAttack { ref iid, defender_seat, ref power, ref toughness } => {
            let (card_name, was_tapped) = {
                let p = &room.players[pi];
                let c = p
                    .battlefield
                    .iter()
                    .find(|c| c.iid == *iid)
                    .ok_or_else(|| ("card_not_found", format!("No card {iid} on your battlefield")))?;
                (c.name.clone(), c.tapped)
            };
            if room.combat.is_none() {
                return Err(("no_combat", "combat has not begun".to_string()));
            }
            let already = room
                .combat
                .as_ref()
                .unwrap()
                .attackers
                .iter()
                .any(|a| a.iid == *iid);
            if already {
                // Toggling an attacker off removes its block pairings too.
                let combat = room.combat.as_mut().unwrap();
                combat.attackers.retain(|a| a.iid != *iid);
                combat.blocks.retain(|b| b.attacker_iid != *iid);
                log = format!("{card_name} no longer attacks");
            } else {
                let mut tapped_note = "";
                if !was_tapped {
                    if let Some(c) = room.players[pi].battlefield.iter_mut().find(|c| c.iid == *iid) {
                        c.tapped = true;
                    }
                    tapped_note = ", tapped";
                }
                let defender = defender_seat.map(|s| seat_username(room, s));
                room.combat.as_mut().unwrap().attackers.push(Attacker {
                    iid: iid.clone(),
                    defender_seat,
                    power: power.clone(),
                    toughness: toughness.clone(),
                });
                log = match defender {
                    Some(d) => format!("{card_name} attacks {d}{tapped_note}"),
                    None => format!("{card_name} attacks{tapped_note}"),
                };
                coach_event = Some(CoachEvent::Attack { name: card_name.clone(), was_tapped });
            }
            resync = true;
        }

        Action::CombatBlock { ref blocker_iid, ref attacker_iid, ref power, ref toughness } => {
            let blocker_name = room.players[pi]
                .battlefield
                .iter()
                .find(|c| c.iid == *blocker_iid)
                .map(|c| c.name.clone())
                .ok_or_else(|| ("card_not_found", format!("No card {blocker_iid} on your battlefield")))?;
            let Some(combat) = room.combat.as_ref() else {
                return Err(("no_combat", "combat has not begun".to_string()));
            };
            if !combat.attackers.iter().any(|a| a.iid == *attacker_iid) {
                return Err(("not_attacking", format!("{attacker_iid} is not attacking")));
            }
            let attacker_name = room
                .players
                .iter()
                .flat_map(|p| p.battlefield.iter())
                .find(|c| c.iid == *attacker_iid)
                .map(|c| c.name.clone())
                .unwrap_or_else(|| "an attacker".to_string());
            let combat = room.combat.as_mut().unwrap();
            let existing = combat
                .blocks
                .iter()
                .position(|b| b.blocker_iid == *blocker_iid && b.attacker_iid == *attacker_iid);
            match existing {
                Some(pos) => {
                    combat.blocks.remove(pos);
                    log = format!("{blocker_name} no longer blocks {attacker_name}");
                }
                None => {
                    combat.blocks.push(Block {
                        blocker_iid: blocker_iid.clone(),
                        attacker_iid: attacker_iid.clone(),
                        power: power.clone(),
                        toughness: toughness.clone(),
                    });
                    log = format!("{blocker_name} blocks {attacker_name}");
                }
            }
            resync = true;
        }

        Action::CombatEnd => {
            clear_combat(room);
            room.phase = "main2".to_string();
            empty_pools_if_enforced(room);
            log = format!("{username} ends combat");
            resync = true;
        }

        // --- enforced rooms: pay-and-place casting + the combat machine ---

        Action::Cast { ref iid, ref payment, x, y } => {
            if !crate::rules::enforced(room) {
                return Err(("not_enforced", "casting with payment needs an enforced table".to_string()));
            }
            // rules::check verified timing and affordability; pay and place.
            let (taps, pool_spend) = {
                let p = &room.players[pi];
                let card = p.hand.iter().find(|c| c.iid == *iid).ok_or_else(|| not_found(iid))?;
                let f = crate::rules::facts(app, card)
                    .ok_or(("illegal", "that card has no rules data yet".to_string()))?;
                crate::rules::solve_payment(app, p, f.generic, &f.pips, payment.as_deref())?
            };
            let goes_to_stack = {
                let p = &room.players[pi];
                let card = p.hand.iter().find(|c| c.iid == *iid).unwrap();
                let f = crate::rules::facts(app, card).unwrap();
                f.is_instant() || f.is_sorcery()
            };
            {
                let p = &mut room.players[pi];
                for land in &taps {
                    if let Some(c) = p.battlefield.iter_mut().find(|c| c.iid == *land) {
                        c.tapped = true;
                    }
                }
                for (color, n) in &pool_spend {
                    if let Some(v) = p.mana.get_mut(&color.to_string()) {
                        *v = (*v - n).max(0);
                    }
                }
            }
            let (_, _, mut card) = take_card(&mut room.players[pi], iid).ok_or_else(|| not_found(iid))?;
            card.tapped = false;
            card.face_down = false;
            let name = card.name.clone();
            room.players[pi].cards_played += 1;
            if goes_to_stack {
                // The spell rides the stack; its EFFECT is still the caster's
                // to perform by hand before resolving it to the graveyard.
                card.revealed = true;
                let cv = serde_json::to_value(&card).unwrap();
                for_actor["card"] = cv.clone();
                for_others["card"] = cv;
                room.stack.push(StackEntry { owner: actor_id.to_string(), card });
                stack_changed(room);
            } else {
                card.x = x.unwrap_or(0.5);
                card.y = y.unwrap_or(0.5);
                card.entered_turn = Some(room.turn_number);
                card.tapped = crate::rules::enters_tapped(app, room, &card);
                let cv = serde_json::to_value(&card).unwrap();
                for_actor["card"] = cv.clone();
                for_others["card"] = cv;
                room.players[pi].battlefield.push(card);
            }
            let paid = taps.len() as i64 + pool_spend.values().sum::<i64>();
            log = format!("{username} casts {name} (paying {paid})");
            resync = true;
        }

        Action::CombatLock => {
            let Some(combat) = room.combat.as_mut() else {
                return Err(("no_combat", "combat has not begun".to_string()));
            };
            combat.locked = true;
            let n = combat.attackers.len() as i64;
            log = format!("{username} attacks with {n} {}", plural(n, "creature", "creatures"));
            resync = true;
        }

        Action::CombatReady => {
            let preview = crate::rules::compute_preview(app, room);
            let Some(combat) = room.combat.as_mut() else {
                return Err(("no_combat", "combat has not begun".to_string()));
            };
            combat.blocks_ready = true;
            combat.preview = Some(preview);
            log = format!("{username} locks in blocks");
            resync = true;
        }

        Action::CombatResolve => {
            let preview = room
                .combat
                .as_ref()
                .and_then(|c| c.preview.clone())
                .ok_or(("no_combat", "no combat outcome to resolve".to_string()))?;
            extra_logs = crate::rules::apply_preview(room, &preview);
            clear_combat(room);
            room.phase = "main2".to_string();
            empty_pools_if_enforced(room);
            log = format!("{username} resolves combat");
            resync = true;
        }

        // --- commander machinery ---

        Action::CmdCast { ref iid, x, y } => {
            if !crate::rooms::format_has_commander(&room.format) {
                return Err(("not_commander_format", "this table is not a commander game".to_string()));
            }
            // Enforced tables pay the commander's real cost plus tax first
            // (rules::check already verified it is affordable and timely).
            if crate::rules::enforced(room) {
                let payment = {
                    let p = &room.players[pi];
                    let card = p.command.iter().find(|c| c.iid == *iid);
                    match card.and_then(|c| crate::rules::facts(app, c)) {
                        Some(f) => {
                            let tax = p.commander_tax.get(iid).copied().unwrap_or(0);
                            Some(crate::rules::solve_payment(app, p, f.generic + tax, &f.pips, None)?)
                        }
                        None => None, // unknown commander stays permissive
                    }
                };
                if let Some((taps, pool_spend)) = payment {
                    let p = &mut room.players[pi];
                    for land in &taps {
                        if let Some(c) = p.battlefield.iter_mut().find(|c| c.iid == *land) {
                            c.tapped = true;
                        }
                    }
                    for (color, n) in &pool_spend {
                        if let Some(v) = p.mana.get_mut(&color.to_string()) {
                            *v = (*v - n).max(0);
                        }
                    }
                }
            }
            let Some(pos) = room.players[pi].command.iter().position(|c| c.iid == *iid) else {
                return Err(("card_not_found", format!("No card {iid} in your command zone")));
            };
            // Read before the mutable borrow below: the room is needed whole.
            let arrives_tapped = crate::rules::enters_tapped(app, room, &room.players[pi].command[pos]);
            let p = &mut room.players[pi];
            let mut card = p.command.remove(pos);
            card.entered_turn = Some(room.turn_number);
            card.tapped = arrives_tapped;
            card.face_down = false;
            card.revealed = false;
            card.x = x;
            card.y = y;
            let prior_tax = p.commander_tax.get(iid).copied().unwrap_or(0);
            let name = card.name.clone();
            let cv = serde_json::to_value(&card).unwrap();
            for_actor["card"] = cv.clone();
            for_others["card"] = cv;
            p.battlefield.push(card);
            p.cards_played += 1;
            p.commander_tax.insert(iid.clone(), prior_tax.saturating_add(2));
            log = format!("{username} casts {name} (tax {prior_tax})");
            resync = true; // commanderTax changed
        }

        Action::CmdTax { ref iid, delta } => {
            if !crate::rooms::format_has_commander(&room.format) {
                return Err(("not_commander_format", "this table is not a commander game".to_string()));
            }
            let p = &mut room.players[pi];
            // The iid must be one of this player's commanders (command zone or
            // battlefield) - a positive delta may CREATE the entry (manual tax
            // for casts the server didn't see), a negative one needs tax to cut.
            if !p.command.iter().chain(p.battlefield.iter()).any(|c| c.iid == *iid) {
                return Err(("card_not_found", format!("No commander {iid} to tax")));
            }
            let prior = p.commander_tax.get(iid).copied().unwrap_or(0);
            if prior == 0 && delta <= 0 {
                return Err(("no_tax", "no commander tax to reduce".to_string()));
            }
            // Saturating + capped: delta is untrusted client input, and an
            // uncapped value could overflow here or in a later CmdCast +2.
            let next = prior.saturating_add(delta).clamp(0, 999);
            let name = p
                .command
                .iter()
                .chain(p.battlefield.iter())
                .find(|c| c.iid == *iid)
                .map(|c| c.name.clone())
                .unwrap_or_else(|| "commander".to_string());
            if next == 0 {
                p.commander_tax.remove(iid);
            } else {
                p.commander_tax.insert(iid.clone(), next);
            }
            log = format!("{username} sets {name}'s tax to {next}");
            resync = true; // commanderTax only travels via state_for
        }

        Action::CmdReturn { ref iid, accept } => {
            let Some(pos) = room.pending_cmd.iter().position(|p| p.iid == *iid) else {
                return Err(("no_pending", format!("No pending commander choice for {iid}")));
            };
            if room.pending_cmd[pos].owner != actor_id {
                return Err(("forbidden", "not your commander".to_string()));
            }
            let pending = room.pending_cmd.remove(pos);
            if accept {
                let mut card = pending.card;
                card.tapped = false;
                card.face_down = false;
                card.revealed = false;
                card.attached_to = None;
                card.piled = false;
                card.counters.clear();
                let name = card.name.clone();
                room.players[pi].command.push(card);
                log = format!("{username} returns {name} to the command zone");
            } else {
                log = complete_pending(room, pending);
            }
            resync = true;
        }

        // --- dice + markers ---

        Action::DiceRoll { sides, count } => {
            if !matches!(sides, 2 | 4 | 6 | 8 | 10 | 12 | 20) {
                return Err(("invalid_dice", "unsupported die".to_string()));
            }
            let count = count.unwrap_or(1).clamp(1, 10) as usize;
            let rolls: Vec<u32> = (0..count).map(|_| rand::random_range(1..=sides)).collect();
            // Feed the 3D dice on the mat: the first die animates to its result.
            {
                let p = &mut room.players[pi];
                p.roll_seq += 1;
                p.last_roll = Some(DiceRollResult { seq: p.roll_seq, sides: sides as u8, value: rolls[0] as u8 });
            }
            resync = true;
            if sides == 2 {
                let faces: Vec<&str> = rolls
                    .iter()
                    .map(|r| if *r == 1 { "Heads" } else { "Tails" })
                    .collect();
                let rv = json!(faces);
                for_actor["results"] = rv.clone();
                for_others["results"] = rv;
                log = if count == 1 {
                    format!("{username} flips a coin: {}", faces[0])
                } else {
                    format!("{username} flips {count} coins: {}", faces.join(", "))
                };
            } else {
                let rv = json!(rolls);
                for_actor["results"] = rv.clone();
                for_others["results"] = rv;
                let list = rolls.iter().map(|r| r.to_string()).collect::<Vec<_>>().join(", ");
                log = if count == 1 {
                    format!("{username} rolls d{sides}: {list}")
                } else {
                    format!("{username} rolls {count}d{sides}: {list}")
                };
            }
        }

        Action::MarkerSet { ref marker, seat } => {
            if seat >= room.seats {
                return Err(("no_such_seat", format!("seat {seat} does not exist")));
            }
            let target = seat_username(room, seat);
            match marker.as_str() {
                "monarch" => {
                    room.markers.monarch = Some(seat);
                    log = format!("{target} becomes the monarch");
                }
                "initiative" => {
                    room.markers.initiative = Some(seat);
                    log = format!("{target} takes the initiative");
                }
                _ => return Err(("invalid_marker", "marker must be monarch or initiative".to_string())),
            }
            resync = true;
        }

        Action::MarkerDay { ref value } => {
            match value.as_deref() {
                Some("day") => {
                    room.markers.day_night = Some("day".to_string());
                    log = "It becomes day".to_string();
                }
                Some("night") => {
                    room.markers.day_night = Some("night".to_string());
                    log = "It becomes night".to_string();
                }
                None => {
                    room.markers.day_night = None;
                    log = format!("{username} stops tracking day/night");
                }
                Some(_) => {
                    return Err(("invalid_marker", "value must be day, night, or null".to_string()))
                }
            }
            resync = true;
        }

        Action::MarkerStorm { delta } => {
            room.markers.storm = (room.markers.storm + delta).max(0);
            log = format!("{username} sets the storm count to {}", room.markers.storm);
            resync = true;
        }

        // --- zone viewers ---

        Action::LibraryPeek { count } => {
            let p = &mut room.players[pi];
            let n = count.min(p.library.len());
            let cards: Vec<Value> = p.library[..n]
                .iter()
                .map(|c| serde_json::to_value(c).unwrap())
                .collect();
            p.peeked = p.library[..n].iter().map(|c| c.iid.clone()).collect();
            private.push((
                actor_id.to_string(),
                json!({"type": "library.cards", "cards": cards}),
            ));
            log = format!(
                "{username} looks at the top {n} {} of their library",
                plural(n as i64, "card", "cards")
            );
        }

        Action::LibraryReorder { ref iids } => {
            let p = &mut room.players[pi];
            let Some(window) = peek_window(p) else {
                p.peeked.clear();
                return Err(("no_peek", "peek at your library first".to_string()));
            };
            let k = window.len();
            let wset: BTreeSet<&str> = window.iter().map(String::as_str).collect();
            let iset: BTreeSet<&str> = iids.iter().map(String::as_str).collect();
            if iids.len() != k || iset != wset {
                return Err(("bad_reorder", "iids must be exactly the peeked cards".to_string()));
            }
            let mut top: Vec<Card> = p.library.drain(..k).collect();
            let mut new_top = Vec::with_capacity(k);
            for iid in iids {
                let pos = top.iter().position(|c| c.iid == *iid).unwrap();
                new_top.push(top.remove(pos));
            }
            for (i, c) in new_top.into_iter().enumerate() {
                p.library.insert(i, c);
            }
            log = format!("{username} rearranges the top {k} cards of their library");
        }

        Action::LibraryBottom { ref iids } => {
            let p = &mut room.players[pi];
            let Some(window) = peek_window(p) else {
                p.peeked.clear();
                return Err(("no_peek", "peek at your library first".to_string()));
            };
            let wset: BTreeSet<&str> = window.iter().map(String::as_str).collect();
            let iset: BTreeSet<&str> = iids.iter().map(String::as_str).collect();
            if iset.len() != iids.len() || !iset.is_subset(&wset) {
                return Err(("bad_bottom", "can only bottom the peeked cards".to_string()));
            }
            for iid in iids {
                let pos = p.library.iter().position(|c| c.iid == *iid).unwrap();
                let card = p.library.remove(pos);
                p.library.push(card);
            }
            p.peeked.retain(|w| !iids.contains(w));
            let m = iids.len();
            log = format!(
                "{username} puts {m} {} on the bottom of their library",
                plural(m as i64, "card", "cards")
            );
        }

        Action::LibrarySearch => {
            let p = &room.players[pi];
            let cards: Vec<Value> = p
                .library
                .iter()
                .map(|c| serde_json::to_value(c).unwrap())
                .collect();
            private.push((
                actor_id.to_string(),
                json!({"type": "library.cards", "cards": cards}),
            ));
            log = format!("{username} searches their library");
        }

        Action::LibraryReveal { count } => {
            let p = &room.players[pi];
            let n = count.min(p.library.len());
            let cards: Vec<Value> = p.library[..n]
                .iter()
                .map(|c| serde_json::to_value(c).unwrap())
                .collect();
            let names = p.library[..n]
                .iter()
                .map(|c| c.name.clone())
                .collect::<Vec<_>>()
                .join(", ");
            let cv = json!(cards);
            for_actor["cards"] = cv.clone();
            for_others["cards"] = cv;
            log = if n == 0 {
                format!("{username} reveals nothing (their library is empty)")
            } else {
                format!("{username} reveals {names} from the top of their library")
            };
        }

        // --- mulligan + undo ---

        Action::MullTake => {
            let free_first = free_first_mulls(room);
            let hand_size = effective_hand_size(room);
            let vancouver = is_vancouver(room);
            let p = &mut room.players[pi];
            let Some(m) = p.mulligan.clone() else {
                return Err(("no_mulligan", "the game has not started".to_string()));
            };
            if m.state != "deciding" {
                return Err(("already_kept", "you already kept your hand".to_string()));
            }
            let hand: Vec<Card> = p.hand.drain(..).collect();
            p.library.extend(hand);
            p.library.shuffle(&mut rand::rng());
            let taken = m.taken + 1;
            // Vancouver draws one fewer card per non-free mulligan; London always
            // redraws a full hand and bottoms the difference on keep.
            let net = taken.saturating_sub(free_first) as usize;
            let target = if vancouver { hand_size.saturating_sub(net) } else { hand_size };
            let n = target.min(p.library.len());
            let drawn: Vec<Card> = p.library.drain(0..n).collect();
            p.hand_revealed = false;
            p.peeked.clear();
            for_actor["cards"] = serde_json::to_value(&drawn).unwrap();
            p.hand.extend(drawn);
            p.mulligan = Some(Mull { state: "deciding".to_string(), taken });
            log = if taken <= free_first {
                format!("{username} mulligans to {n} (free)")
            } else {
                format!("{username} mulligans to {n}")
            };
            resync = true;
        }

        Action::MullKeep { ref bottom_iids } => {
            let free_first = free_first_mulls(room);
            let vancouver = is_vancouver(room);
            {
                let p = &mut room.players[pi];
                let Some(m) = p.mulligan.clone() else {
                    return Err(("no_mulligan", "the game has not started".to_string()));
                };
                if m.state != "deciding" {
                    return Err(("already_kept", "you already kept your hand".to_string()));
                }
                // London bottoms one card per non-free mulligan; Vancouver already
                // drew a smaller hand, so nothing is bottomed.
                let n = if vancouver {
                    0
                } else {
                    (m.taken as i64 - free_first as i64).max(0) as usize
                };
                let set: BTreeSet<&str> = bottom_iids.iter().map(String::as_str).collect();
                if bottom_iids.len() != n || set.len() != n {
                    return Err(("bad_bottom", format!("must bottom exactly {n} distinct cards")));
                }
                if !bottom_iids.iter().all(|iid| p.hand.iter().any(|c| c.iid == *iid)) {
                    return Err(("bad_bottom", "cards must be in your hand".to_string()));
                }
                for iid in bottom_iids {
                    let pos = p.hand.iter().position(|c| c.iid == *iid).unwrap();
                    let card = p.hand.remove(pos);
                    p.library.push(card);
                }
                p.mulligan = Some(Mull { state: "kept".to_string(), taken: m.taken });
                log = format!("{username} keeps at {}", p.hand.len());
            }
            // Once every non-conceded seat has kept, the first turn begins:
            // clock reset + untap (a no-op) + draw, honoring the first-draw
            // skip. Conceded seats never keep, so they do not hold this up.
            extra_logs.extend(maybe_begin_first_turn(room, now));
            resync = true;
        }

        Action::Undo => {
            if room.cursor == 0 || room.history.is_empty() {
                return Err(("undo_stale", "nothing to undo".to_string()));
            }
            let undone = &room.history[room.cursor];
            if actor_id != room.host && actor_id != undone.actor {
                return Err(("not_your_action", "only whoever made that move (or the host) can undo it".to_string()));
            }
            let label = undone.label.clone();
            let target = room.cursor - 1;
            if !room.restore_to(target) {
                return Err(("undo_stale", "that history is no longer available".to_string()));
            }
            log = if label.is_empty() {
                format!("{username} undoes the last move")
            } else {
                format!("{username} undoes: {label}")
            };
            record = false;
            resync = true;
        }

        Action::Redo => {
            if room.cursor + 1 >= room.history.len() {
                return Err(("redo_stale", "nothing to redo".to_string()));
            }
            let target = room.cursor + 1;
            let redone = &room.history[target];
            if actor_id != room.host && actor_id != redone.actor {
                return Err(("not_your_action", "only whoever made that move (or the host) can redo it".to_string()));
            }
            let label = redone.label.clone();
            if !room.restore_to(target) {
                return Err(("redo_stale", "that history is no longer available".to_string()));
            }
            log = if label.is_empty() {
                format!("{username} redoes the next move")
            } else {
                format!("{username} redoes: {label}")
            };
            record = false;
            resync = true;
        }

        Action::RewindTo { index } => {
            if actor_id != room.host {
                return Err(("forbidden", "only the host can rewind the table".to_string()));
            }
            if index >= room.history.len() {
                return Err(("bad_rewind", "no such point in the timeline".to_string()));
            }
            if !room.restore_to(index) {
                return Err(("bad_rewind", "that history is no longer available".to_string()));
            }
            // Destructive: discard everyone's moves after this point (and their
            // persisted rows on the next flush).
            room.hist_truncate_to(index + 1);
            log = format!("{username} rewinds the table");
            record = false;
            resync = true;
        }

        Action::Concede => {
            if !room.started {
                return Err(("not_started", "the game has not started".to_string()));
            }
            if room.players[pi].conceded {
                return Err(("already_conceded", "you already conceded".to_string()));
            }
            let seat = room.players[pi].seat;
            room.players[pi].conceded = true;
            // A conceded seat's pending mulligan decision is void: bots and
            // the first-turn trigger wait on "deciding" seats, and the
            // client's mulligan overlay closes when the state leaves it.
            if let Some(m) = room.players[pi].mulligan.as_mut() {
                if m.state == "deciding" {
                    m.state = "kept".to_string();
                }
            }
            let survivors = room.players.iter().filter(|p| !p.conceded).count();
            // A conceded active player hands the turn on so the game never
            // stalls on a seat that can no longer take turns (next_occupied
            // skips conceded seats now that the flag is set). A match-ending
            // concede (one survivor) skips this: the winner should not be
            // dealt a phantom turn right before the result freezes the room.
            if room.active_seat == seat && survivors > 1 {
                turn_clock_credit(room, now);
                let (next, wrapped) = next_occupied(room, seat);
                if next != seat {
                    if wrapped {
                        room.turn_number += 1;
                    }
                    room.active_seat = next;
                    turn_clock_begin(room, next, now);
                    clear_combat(room);
                    // No untap/draw while the table is still mulliganing:
                    // the first-turn trigger below owns that moment.
                    let mull_done = room
                        .players
                        .iter()
                        .filter(|p| !p.conceded)
                        .all(|p| p.mulligan.as_ref().map(|m| m.state == "kept").unwrap_or(true));
                    if room.auto_turn && room.first_turn_begun && mull_done {
                        room.phase = "main1".to_string();
                        extra_logs.extend(auto_turn_begin(room, next));
                    }
                }
            }
            // This concede may have been the mulligan window's closing event.
            if survivors > 1 {
                extra_logs.extend(maybe_begin_first_turn(room, now));
            }
            log = format!("{username} concedes");
            resync = true;
        }
    }

    if let Some(kind) = undo {
        room.players[pi].undo = Some(UndoEntry { kind, ts: now });
    }
    let battlefield_size = room.players[pi].battlefield.len() as u64;
    room.players[pi].peak_battlefield = room.players[pi].peak_battlefield.max(battlefield_size);

    // The rules coach reads the settled state and speaks only to the player who
    // made the move, and only if they asked to be taught. It can never change
    // the outcome above - by this point the action has already been applied.
    if let Some(event) = coach_event {
        let p = &room.players[pi];
        if crate::coach::wants_coaching(p) {
            let notes = match event {
                CoachEvent::LandPlayed => crate::coach::on_land_played(room, p),
                CoachEvent::Attack { ref name, was_tapped } => {
                    crate::coach::on_attack(room, p, name, was_tapped)
                }
                CoachEvent::TurnPass => crate::coach::on_turn_pass(room, p),
            };
            for note in notes {
                private.push((
                    p.user_id.clone(),
                    json!({"type": "coach", "rule": note.rule, "text": note.text, "ts": now}),
                ));
            }
        }
    }

    Ok(Applied { for_actor, for_others, log, extra_logs, resync, private, record })
}
