use crate::rooms::{Attacker, Block, Card, Combat, Mull, PendingCmd, Player, Room, StackEntry};
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

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
}

const PHASES: [&str; 7] = ["upkeep", "main1", "attack", "block", "damage", "main2", "end"];
const CMD_CHOICE_MS: i64 = 30_000;
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
    },
    #[serde(rename = "card.pos", rename_all = "camelCase")]
    CardPos { iid: String, x: f64, y: f64 },
    #[serde(rename = "card.tap", rename_all = "camelCase")]
    CardTap { iid: String, tapped: bool },
    #[serde(rename = "card.face", rename_all = "camelCase")]
    CardFace { iid: String, face_down: bool },
    #[serde(rename = "card.counter", rename_all = "camelCase")]
    CardCounter { iid: String, counter: String, delta: i64 },
    #[serde(rename = "card.attach", rename_all = "camelCase")]
    CardAttach {
        iid: String,
        #[serde(default)]
        host_iid: Option<String>,
    },
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
    #[serde(rename = "reveal.hand")]
    RevealHand,

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
    #[serde(rename = "combat.lock")]
    CombatLock,
    #[serde(rename = "combat.ready")]
    CombatReady {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        prevent: Option<bool>,
    },
    #[serde(rename = "combat.end")]
    CombatEnd,

    // --- gameplay v2: commander machinery ---
    #[serde(rename = "cmd.cast", rename_all = "camelCase")]
    CmdCast { iid: String, x: f64, y: f64 },
    #[serde(rename = "cmd.return", rename_all = "camelCase")]
    CmdReturn { iid: String, accept: bool },

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
    /// Whole-room extra messages (combat.results) sent to every viewer,
    /// players and spectators alike, after the room.event and log lines.
    pub extra_broadcasts: Vec<Value>,
}

type ActionError = (&'static str, String);

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
    let mut i = 0usize;
    for p in room.players.iter_mut() {
        for c in p.battlefield.iter_mut() {
            if c.attached_to.as_deref() == Some(host_iid) {
                i += 1;
                c.x = (hx + 0.018 * i as f64).clamp(0.0, 1.0);
                c.y = (hy + 0.018 * i as f64).clamp(0.0, 1.0);
                moved.push((c.iid.clone(), c.x, c.y));
            }
        }
    }
    moved
}

fn seat_username(room: &Room, seat: usize) -> String {
    room.players
        .iter()
        .find(|p| p.seat == seat)
        .map(|p| p.username.clone())
        .unwrap_or_else(|| format!("seat {}", seat + 1))
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
fn free_first_mulls(room: &Room) -> u32 {
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
    for c in p.battlefield.iter_mut() {
        c.tapped = false;
    }
    if skip {
        vec![format!("{} untaps (first draw skipped)", p.username)]
    } else if p.library.is_empty() {
        vec![format!("{} untaps, no cards left to draw", p.username)]
    } else {
        let card = p.library.remove(0);
        p.hand.push(card);
        p.hand_revealed = false;
        p.peeked.clear();
        vec![format!("{} untaps and draws a card", p.username)]
    }
}

/// Drop a card into one of its owner's zones with move cleanup applied
/// (untapped, face up, un-revealed, detached; counters cleared off-battlefield).
fn place_card(p: &mut Player, mut card: Card, to: Zone, x: Option<f64>, y: Option<f64>, index: Option<i64>) {
    card.tapped = false;
    card.face_down = false;
    card.revealed = false;
    card.attached_to = None;
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

/// Clear an in-progress combat at a turn boundary or combat.end. Un-locked
/// combats stash the legacy settle record (bots apply their own incoming
/// damage from it); LOCKED combats never stash one — the server resolves
/// those itself, and clearing one unresolved is a cancel (no damage at all).
pub fn clear_combat(room: &mut Room) {
    if let Some(ending) = room.combat.take() {
        if !ending.locked && !ending.attackers.is_empty() {
            room.last_combat = Some(crate::rooms::EndedCombat { seq: room.seq, combat: ending });
        }
    }
}

/// A creature dies in combat resolution: tokens cease to exist, commanders
/// get the usual command-zone choice, real cards go to their owner's
/// graveyard (untapped, face up, counters and attachments cleared). Returns
/// an extra log line when the death needs one (the commander choice).
fn combat_death(
    room: &mut Room,
    iid: &str,
    now: i64,
    private: &mut Vec<(String, Value)>,
) -> Option<String> {
    let owner_idx = room
        .players
        .iter()
        .position(|p| p.battlefield.iter().any(|c| c.iid == iid))?;
    let pos = room.players[owner_idx]
        .battlefield
        .iter()
        .position(|c| c.iid == iid)
        .unwrap();
    let mut card = room.players[owner_idx].battlefield.remove(pos);
    clear_followers(room, iid);
    card.attached_to = None;
    card.tapped = false;
    card.face_down = false;
    card.revealed = false;
    card.counters.clear();
    let username = room.players[owner_idx].username.clone();
    let owner_id = room.players[owner_idx].user_id.clone();
    let name = card.name.clone();
    if card.is_token {
        return None; // ceases to exist; the summary line already says it died
    }
    if room.format == "commander" && card.is_commander {
        room.pending_cmd.push(PendingCmd {
            iid: iid.to_string(),
            owner: owner_id.clone(),
            card,
            to: Zone::Graveyard,
            x: None,
            y: None,
            index: None,
            deadline: now + CMD_CHOICE_MS,
        });
        private.push((owner_id, json!({"type": "cmd.choice", "iid": iid, "to": Zone::Graveyard})));
        return Some(format!("{username}'s commander {name} may return to the command zone"));
    }
    room.players[owner_idx].graveyard.push(card);
    None
}

/// Resolve a locked combat (Combat v3): apply damage and deaths, mutate the
/// room, and return (log lines, the combat.results broadcast). The caller has
/// already taken `combat` off the room.
fn resolve_combat(
    room: &mut Room,
    combat: &Combat,
    now: i64,
    private: &mut Vec<(String, Value)>,
) -> (Vec<String>, Value) {
    let attacker_seat = room.active_seat;
    let parse = |s: &Option<String>| -> i64 {
        s.as_deref().and_then(|v| v.trim().parse::<i64>().ok()).unwrap_or(0)
    };
    let mut lines: Vec<String> = Vec::new();
    let mut entries: Vec<Value> = Vec::new();
    let mut totals: BTreeMap<usize, i64> = BTreeMap::new();
    // Who an open swing (defenderSeat null) hits: every seated opponent.
    let open_defenders: Vec<usize> = room
        .players
        .iter()
        .filter(|p| !p.conceded && p.seat != attacker_seat)
        .map(|p| p.seat)
        .collect();
    struct LiveBlock {
        iid: String,
        name: String,
        owner_seat: usize,
        power: i64,
        toughness: i64,
    }
    for a in &combat.attackers {
        let Some((atk_owner_seat, atk_name, atk_commander)) = room.players.iter().find_map(|p| {
            p.battlefield
                .iter()
                .find(|c| c.iid == a.iid)
                .map(|c| (p.seat, c.name.clone(), c.is_commander))
        }) else {
            continue; // the attacker left the battlefield mid-combat
        };
        let atk_power = parse(&a.power);
        let atk_tough = parse(&a.toughness);
        let defender_seat_json = a
            .defender_seat
            .or_else(|| (open_defenders.len() == 1).then(|| open_defenders[0]));
        // Declared blocks whose blocker is still on a battlefield.
        let blocks: Vec<LiveBlock> = combat
            .blocks
            .iter()
            .filter(|b| b.attacker_iid == a.iid)
            .filter_map(|b| {
                room.players.iter().find_map(|p| {
                    p.battlefield.iter().find(|c| c.iid == b.blocker_iid).map(|c| LiveBlock {
                        iid: c.iid.clone(),
                        name: c.name.clone(),
                        owner_seat: p.seat,
                        power: parse(&b.power),
                        toughness: parse(&b.toughness),
                    })
                })
            })
            .collect();
        if blocks.is_empty() {
            // Unblocked: the declared defender (or every opponent, on an open
            // swing) loses the attacker's power, unless they prevented.
            let defenders: Vec<usize> = match a.defender_seat {
                Some(s) => vec![s],
                None => open_defenders.clone(),
            };
            let mut dealt_to: Vec<(usize, i64)> = Vec::new();
            let mut prevented = !defenders.is_empty();
            for &seat in &defenders {
                if combat.prevent.contains(&seat) {
                    continue;
                }
                prevented = false;
                if atk_power <= 0 {
                    continue;
                }
                let Some(dp) = room.players.iter_mut().find(|p| p.seat == seat) else {
                    continue;
                };
                dp.life -= atk_power;
                if atk_commander {
                    let e = dp.cmd_damage.entry(atk_owner_seat).or_insert(0);
                    *e = (*e + atk_power).max(0);
                    let by = dp.cmd_damage_by_commander.entry(a.iid.clone()).or_insert(0);
                    *by = (*by + atk_power).max(0);
                }
                *totals.entry(seat).or_insert(0) += atk_power;
                dealt_to.push((seat, atk_power));
            }
            lines.push(if prevented {
                format!("{atk_name}'s combat damage is prevented")
            } else if dealt_to.is_empty() {
                format!("{atk_name} deals no combat damage")
            } else {
                let hits = dealt_to
                    .iter()
                    .map(|(s, n)| format!("{} for {n}", seat_username(room, *s)))
                    .collect::<Vec<_>>()
                    .join(", ");
                format!("{atk_name} hits {hits}")
            });
            let dealt: i64 = dealt_to.iter().map(|(_, n)| n).sum();
            entries.push(json!({
                "attackerIid": a.iid,
                "name": atk_name,
                "defenderSeat": defender_seat_json,
                "prevented": prevented,
                "blockers": [],
                "attackerDied": false,
                "damageToDefender": dealt,
            }));
        } else {
            // Blocked: blockers absorb in declared order; a blocker dies when
            // the attacker's remaining power covers its toughness (power
            // spends as it kills), the attacker dies when the blockers'
            // summed power covers its toughness. Pairings whose blocker's
            // owner prevented sit the whole exchange out.
            let mut blocker_vals: Vec<Value> = Vec::new();
            let mut remaining = atk_power;
            let mut blocker_power_sum = 0i64;
            let mut dead_blockers: Vec<(String, String)> = Vec::new();
            let mut any_active = false;
            for b in &blocks {
                if combat.prevent.contains(&b.owner_seat) {
                    blocker_vals.push(json!({"iid": b.iid, "name": b.name, "died": false}));
                    continue;
                }
                any_active = true;
                blocker_power_sum += b.power;
                let dies = b.toughness > 0 && remaining >= b.toughness;
                if dies {
                    remaining -= b.toughness;
                    dead_blockers.push((b.iid.clone(), b.name.clone()));
                }
                blocker_vals.push(json!({"iid": b.iid, "name": b.name, "died": dies}));
            }
            let attacker_dies = any_active && atk_tough > 0 && blocker_power_sum >= atk_tough;
            let names = blocks.iter().map(|b| b.name.clone()).collect::<Vec<_>>().join(" and ");
            let mut line = if any_active {
                format!("{atk_name} is blocked by {names}")
            } else {
                format!("{atk_name} is blocked by {names}, all combat damage prevented")
            };
            for (_, n) in &dead_blockers {
                line.push_str(&format!(", {n} dies"));
            }
            if attacker_dies {
                line.push_str(&format!(", {atk_name} dies"));
            }
            lines.push(line);
            for (iid, _) in &dead_blockers {
                if let Some(extra) = combat_death(room, iid, now, private) {
                    lines.push(extra);
                }
            }
            if attacker_dies {
                if let Some(extra) = combat_death(room, &a.iid, now, private) {
                    lines.push(extra);
                }
            }
            entries.push(json!({
                "attackerIid": a.iid,
                "name": atk_name,
                "defenderSeat": defender_seat_json,
                "prevented": !any_active,
                "blockers": blocker_vals,
                "attackerDied": attacker_dies,
                "damageToDefender": 0,
            }));
        }
    }
    if totals.is_empty() {
        lines.push("Combat resolves with no damage to players".to_string());
    } else {
        let parts = totals
            .iter()
            .map(|(s, n)| format!("{} takes {n}", seat_username(room, *s)))
            .collect::<Vec<_>>()
            .join(", ");
        lines.push(format!("Combat resolves: {parts}"));
    }
    let total_by_seat: serde_json::Map<String, Value> =
        totals.iter().map(|(s, n)| (s.to_string(), json!(n))).collect();
    let results = json!({
        "type": "combat.results",
        "attackerSeat": attacker_seat,
        "entries": entries,
        "totalBySeat": total_by_seat,
    });
    (lines, results)
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
    if room.format == "commander"
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
/// + log lines. Errors are (code, message) for a WS error frame.
pub fn apply(room: &mut Room, actor_id: &str, action: Action) -> Result<Applied, ActionError> {
    let pi = room
        .players
        .iter()
        .position(|p| p.user_id == actor_id)
        .ok_or(("not_seated", "You are not seated in this room".to_string()))?;
    let username = room.players[pi].username.clone();
    let now = crate::now_ms();

    // A finished match freezes the table: the result screen owns the room and
    // every further action (including stray hotkeys) is rejected outright.
    if room.match_result.is_some() {
        return Err(("match_over", "the match is already over".to_string()));
    }

    let base = serde_json::to_value(&action).unwrap();
    let mut for_actor = base.clone();
    let mut for_others = base;
    let mut resync = false;
    let mut extra_logs: Vec<String> = Vec::new();
    let mut private: Vec<(String, Value)> = Vec::new();
    let mut extra_broadcasts: Vec<Value> = Vec::new();
    let mut undo: Option<UndoKind> = None;
    let log: String;

    match action {
        Action::CardMove { ref iid, to, x, y, index } => {
            let (from, from_idx, mut card) =
                take_card(&mut room.players[pi], iid).ok_or_else(|| not_found(iid))?;
            let snapshot = card.clone();
            let was_hidden = from.hidden();
            if from == Zone::Battlefield {
                clear_followers(room, iid);
                card.attached_to = None;
            }
            if from == Zone::Library || to == Zone::Library {
                room.players[pi].peeked.clear();
            }
            if room.format == "commander"
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
                resync = was_hidden;
            } else {
                let to_hidden = to.hidden();
                card.tapped = false;
                card.face_down = false;
                card.revealed = false;
                if to == Zone::Battlefield {
                    card.x = x.unwrap_or(0.5);
                    card.y = y.unwrap_or(0.5);
                } else {
                    card.counters.clear();
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
                    log = format!("{username} puts {display} {place} their library");
                } else {
                    zone_list_mut(p, to).push(card);
                    for_actor["card"] = card_val.clone();
                    if !to_hidden {
                        // Public destination: everyone learns the card.
                        for_others["card"] = card_val;
                    }
                    let name_public = !to_hidden || !was_hidden;
                    let display = if name_public { name } else { "a card".to_string() };
                    log = match to {
                        Zone::Hand => format!("{username} puts {display} into their hand"),
                        Zone::Battlefield => format!("{username} puts {display} onto the battlefield"),
                        Zone::Graveyard => format!("{username} puts {display} into their graveyard"),
                        Zone::Exile => format!("{username} exiles {display}"),
                        Zone::Command => format!("{username} puts {display} into the command zone"),
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
                resync = was_hidden || to_hidden;
            }
        }

        Action::CardPos { ref iid, x, y } => {
            let (prev_x, prev_y, name);
            {
                let p = &mut room.players[pi];
                let (_, card) = find_card_mut(p, iid).ok_or_else(|| not_found(iid))?;
                prev_x = card.x;
                prev_y = card.y;
                card.x = x;
                card.y = y;
                name = visible_name(card);
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
            log = format!("{username} moves {name}");
            undo = Some(UndoKind::Pos { iid: iid.clone(), x: prev_x, y: prev_y });
        }

        Action::CardTap { ref iid, tapped } => {
            let p = &mut room.players[pi];
            let (_, card) = find_card_mut(p, iid).ok_or_else(|| not_found(iid))?;
            let prev = card.tapped;
            card.tapped = tapped;
            let verb = if tapped { "taps" } else { "untaps" };
            log = format!("{username} {verb} {}", visible_name(card));
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

        Action::CardAttach { ref iid, ref host_iid } => {
            match host_iid {
                Some(h) => {
                    if h == iid {
                        return Err(("bad_attach", "cannot attach a card to itself".to_string()));
                    }
                    // The host may be on ANY battlefield (auras on opposing
                    // creatures); the attached card must be the actor's.
                    let mut host: Option<(f64, f64, String)> = None;
                    let mut followers = 0usize;
                    for pl in room.players.iter() {
                        for c in pl.battlefield.iter() {
                            if c.iid == *h {
                                host = Some((c.x, c.y, c.name.clone()));
                            }
                            if c.attached_to.as_deref() == Some(h.as_str()) && c.iid != *iid {
                                followers += 1;
                            }
                        }
                    }
                    let Some((hx, hy, host_name)) = host else {
                        return Err(("card_not_found", format!("No card {h} on the battlefield")));
                    };
                    let p = &mut room.players[pi];
                    let Some(card) = p.battlefield.iter_mut().find(|c| c.iid == *iid) else {
                        return Err(("card_not_found", format!("No card {iid} on your battlefield")));
                    };
                    let prev = (card.attached_to.clone(), card.x, card.y);
                    card.attached_to = Some(h.clone());
                    card.x = (hx + 0.018 * (followers as f64 + 1.0)).clamp(0.0, 1.0);
                    card.y = (hy + 0.018 * (followers as f64 + 1.0)).clamp(0.0, 1.0);
                    let (nx, ny, name) = (card.x, card.y, card.name.clone());
                    for v in [&mut for_actor, &mut for_others] {
                        v["x"] = json!(nx);
                        v["y"] = json!(ny);
                    }
                    log = format!("{username} attaches {name} to {host_name}");
                    undo = Some(UndoKind::Attach {
                        iid: iid.clone(),
                        prev_host: prev.0,
                        x: prev.1,
                        y: prev.2,
                    });
                    resync = true; // attachedTo lives in RoomState
                }
                None => {
                    let p = &mut room.players[pi];
                    let Some(card) = p.battlefield.iter_mut().find(|c| c.iid == *iid) else {
                        return Err(("card_not_found", format!("No card {iid} on your battlefield")));
                    };
                    let prev = (card.attached_to.clone(), card.x, card.y);
                    card.attached_to = None;
                    log = format!("{username} unattaches {}", card.name);
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
                is_commander: false,
                revealed: false,
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
            p.hand_revealed = false; // any draw makes the hand private again
            p.peeked.clear();
            for_actor["cards"] = serde_json::to_value(&drawn).unwrap();
            p.hand.extend(drawn);
            log = format!("{username} draws {n} {}", plural(n as i64, "card", "cards"));
            resync = true;
        }

        Action::Shuffle => {
            let p = &mut room.players[pi];
            p.library.shuffle(&mut rand::rng());
            p.peeked.clear();
            log = format!("{username} shuffles their library");
        }

        Action::Mulligan => {
            let p = &mut room.players[pi];
            let hand: Vec<Card> = p.hand.drain(..).collect();
            p.library.extend(hand);
            p.library.shuffle(&mut rand::rng());
            let n = 7.min(p.library.len());
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
            *entry = (*entry + delta).max(0);
            let total = *entry;
            if let Some(ciid) = attributed {
                let by = p.cmd_damage_by_commander.entry(ciid).or_insert(0);
                *by = (*by + delta).max(0);
                resync = true; // by-commander tally is only in RoomState
            }
            log = if delta >= 0 {
                format!("{from_name} deals {delta} commander damage to {username} ({total} total)")
            } else {
                format!("{username} removes {} commander damage from {from_name} ({total} total)", -delta)
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

        Action::RevealHand => {
            room.players[pi].hand_revealed = true;
            log = format!("{username} reveals their hand");
            resync = true; // other players' next room.state includes the hand
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
                clear_followers(room, iid);
            }
            card.attached_to = None;
            card.tapped = false;
            card.face_down = false;
            if from.hidden() {
                // Arriving from a hidden zone reveals the card to the table.
                card.revealed = true;
            }
            let cv = serde_json::to_value(&card).unwrap();
            for_actor["card"] = cv.clone();
            for_others["card"] = cv;
            log = format!("{username} puts {} on the stack", card.name);
            room.stack.push(StackEntry { owner: actor_id.to_string(), card });
            resync = true;
        }

        Action::StackResolve { ref iid, to, x, y } => {
            log = resolve_from_stack(room, &username, iid, to, x, y, false, now, &mut private)?;
            resync = true;
        }

        Action::StackCounter { ref iid, to } => {
            log = resolve_from_stack(room, &username, iid, to, None, None, true, now, &mut private)?;
            resync = true;
        }

        // --- guided combat ---

        Action::CombatBegin => {
            room.combat = Some(Combat::default());
            room.phase = "attack".to_string();
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
            if room.combat.as_ref().unwrap().locked {
                return Err(("locked", "attackers are locked in".to_string()));
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

        Action::CombatLock => {
            let seat = room.players[pi].seat;
            if seat != room.active_seat {
                return Err(("not_active", "only the active player can lock attackers".to_string()));
            }
            let Some(combat) = room.combat.as_mut() else {
                return Err(("no_combat", "combat has not begun".to_string()));
            };
            if combat.locked {
                return Err(("locked", "attackers are already locked in".to_string()));
            }
            if combat.attackers.is_empty() {
                return Err(("no_attackers", "declare at least one attacker first".to_string()));
            }
            combat.locked = true;
            let n = combat.attackers.len();
            room.phase = "block".to_string();
            log = format!("{username} locks in {n} {}", plural(n as i64, "attacker", "attackers"));
            resync = true;
        }

        Action::CombatReady { prevent } => {
            let seat = room.players[pi].seat;
            {
                let Some(combat) = room.combat.as_ref() else {
                    return Err(("no_combat", "combat has not begun".to_string()));
                };
                if !combat.locked {
                    return Err(("not_locked", "attackers are not locked in".to_string()));
                }
                let targeted = seat != room.active_seat
                    && combat
                        .attackers
                        .iter()
                        .any(|a| a.defender_seat.map_or(true, |d| d == seat));
                if !targeted {
                    return Err(("not_defending", "no attacker is aimed at your seat".to_string()));
                }
                if combat.ready.contains(&seat) {
                    return Err(("already_ready", "you are already ready".to_string()));
                }
            }
            let preventing = prevent == Some(true);
            {
                let combat = room.combat.as_mut().unwrap();
                combat.ready.push(seat);
                if preventing {
                    combat.prevent.push(seat);
                }
            }
            log = if preventing {
                format!("{username} prevents all combat damage")
            } else {
                format!("{username} is ready")
            };
            // The moment every targeted defender has responded, resolve.
            let all_ready = {
                let combat = room.combat.as_ref().unwrap();
                room.players
                    .iter()
                    .filter(|p| !p.conceded && p.seat != room.active_seat)
                    .filter(|p| {
                        combat
                            .attackers
                            .iter()
                            .any(|a| a.defender_seat.map_or(true, |d| d == p.seat))
                    })
                    .all(|p| combat.ready.contains(&p.seat))
            };
            if all_ready {
                // Resolved locked combats never leave a legacy last_combat
                // record (bots must not settle the damage a second time).
                let combat = room.combat.take().unwrap();
                let (mut lines, results) = resolve_combat(room, &combat, now, &mut private);
                extra_logs.append(&mut lines);
                extra_broadcasts.push(results);
                room.phase = "main2".to_string();
            }
            resync = true;
        }

        Action::CombatEnd => {
            // Canceling a LOCKED combat drops it outright (no damage, no
            // legacy settle record); un-locked keeps the legacy stash flow.
            clear_combat(room);
            room.phase = "main2".to_string();
            log = format!("{username} ends combat");
            resync = true;
        }

        // --- commander machinery ---

        Action::CmdCast { ref iid, x, y } => {
            if room.format != "commander" {
                return Err(("not_commander_format", "this table is not a commander game".to_string()));
            }
            let p = &mut room.players[pi];
            let Some(pos) = p.command.iter().position(|c| c.iid == *iid) else {
                return Err(("card_not_found", format!("No card {iid} in your command zone")));
            };
            let mut card = p.command.remove(pos);
            card.tapped = false;
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
            p.commander_tax.insert(iid.clone(), prior_tax + 2);
            log = format!("{username} casts {name} (tax {prior_tax})");
            resync = true; // commanderTax changed
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
            if !matches!(sides, 2 | 6 | 20) {
                return Err(("invalid_dice", "sides must be 2, 6, or 20".to_string()));
            }
            let count = count.unwrap_or(1).clamp(1, 10) as usize;
            let rolls: Vec<u32> = (0..count).map(|_| rand::random_range(1..=sides)).collect();
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
            let n = 7.min(p.library.len());
            let drawn: Vec<Card> = p.library.drain(0..n).collect();
            p.hand_revealed = false;
            p.peeked.clear();
            for_actor["cards"] = serde_json::to_value(&drawn).unwrap();
            p.hand.extend(drawn);
            let taken = m.taken + 1;
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
            {
                let p = &mut room.players[pi];
                let Some(m) = p.mulligan.clone() else {
                    return Err(("no_mulligan", "the game has not started".to_string()));
                };
                if m.state != "deciding" {
                    return Err(("already_kept", "you already kept your hand".to_string()));
                }
                let n = (m.taken as i64 - free_first as i64).max(0) as usize;
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
            let entry = room.players[pi]
                .undo
                .take()
                .ok_or(("undo_stale", "nothing to undo".to_string()))?;
            if now - entry.ts > UNDO_MS {
                return Err(("undo_stale", "too late to undo".to_string()));
            }
            apply_undo(room, pi, entry.kind)?;
            log = format!("{username} undoes their last action");
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
    Ok(Applied { for_actor, for_others, log, extra_logs, resync, private, extra_broadcasts })
}
