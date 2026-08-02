//! Server-resident AI opponents (PROTOCOL.md, Bots addendum v3).
//!
//! A bot is an ordinary `Player` driven by one scheduler task. Every act goes
//! through `ws::dispatch_action`, the identical pipeline human actions use, so
//! bots obey the same freeform contract: the server records, never judges.
//! Combat damage is settled the same way humans settle it, by the bot adjusting
//! its OWN life and creatures from the shared combat record.
//!
//! The brain is a heuristic player in the Forge tradition (creature evaluation,
//! race math, an aggression ladder, an ordered block pipeline, threat-scored
//! multiplayer targeting) stripped to the data this server actually has: mana
//! value, coarse type letters, and printed power/toughness for the embedded
//! precons, plus whatever stats a combat declaration carries.
//!
//! The scheduler is stateless across restarts: rooms are persisted and
//! reloaded, and scanning them resumes every bot automatically. Per-bot
//! scratch memory (`BotMind`) lives only in this task and self-heals from
//! room state when missing.

use crate::game::{Action, Zone};
use crate::rooms::{Card, Combat, EndedCombat, Player, Room};
use crate::{ws, App};
use serde::Deserialize;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

// ----------------------------------------------------------------- identity

const PERSONAS: [&str; 6] = ["Aster", "Bramble", "Cirrus", "Moss", "Quill", "Wren"];

/// An unused persona username for this room ("Aster (AI)"); numbered fallback
/// if the pool is somehow exhausted.
pub fn pick_name(room: &Room) -> String {
    let start = rand::random_range(0..PERSONAS.len());
    for i in 0..PERSONAS.len() {
        let name = format!("{} (AI)", PERSONAS[(start + i) % PERSONAS.len()]);
        if !room.players.iter().any(|p| p.username == name) {
            return name;
        }
    }
    format!("{} {} (AI)", PERSONAS[start], crate::hex_id(2))
}

/// A deterministic playmat per persona so the same bot always brings the same
/// felt. Every id is in ws::PLAYMATS.
pub fn bot_playmat(username: &str) -> &'static str {
    const MATS: [&str; 6] =
        ["arcane-study", "fae-glade", "planar-sky", "deep-field", "aurora-drift", "tavern"];
    let h = username.bytes().fold(0usize, |a, b| a.wrapping_mul(31).wrapping_add(b as usize));
    MATS[h % MATS.len()]
}

// -------------------------------------------------------------------- mind

/// Payment in progress: tap `taps` one per tick, then fire the spell.
pub(crate) struct CastPlan {
    iid: String,
    from_command: bool,
    taps: Vec<String>,
    to_stack: bool,
    /// A chat line to send the tick the spell actually fires.
    announce: Option<String>,
}

/// The bot's declared offense this turn: attackers still to declare, then an
/// announcement, then a response window that watches the DEFENDER rather than
/// just a clock - combat stays open while a human is still reacting.
pub(crate) struct AttackPlan {
    defender_seat: usize,
    /// Attacker iids not yet declared (drained one per tick).
    pending: Vec<String>,
    announced: bool,
    /// When the announcement went out (unix ms; 0 = not yet).
    announced_at: i64,
    /// The defender's life total at announcement, to notice them settling
    /// the damage themselves.
    defender_life: i64,
    /// Blocks visible at the last tick, to notice new declarations.
    blocks_seen: usize,
    /// When a defender response was noticed: end shortly after, leaving room
    /// for a second block or a change of mind.
    respond_grace_until: i64,
    /// Enforced rooms: combat.lock still owed (sent with the announcement).
    needs_lock: bool,
}

/// In-memory scratch for one bot. Never persisted; everything here self-heals
/// from room state (worst case after a restart: an extra land drop or a
/// forgotten damage bookkeeping entry).
#[derive(Default)]
pub(crate) struct BotMind {
    /// Bookkeeping actions queued for later ticks (post-combat life, deaths).
    queue: VecDeque<Action>,
    /// (turn round, unix ms) when this bot's actionable turn began.
    turn_started: Option<(u64, i64)>,
    /// Turn round the bot last played a land in (or gave up looking).
    land_turn: Option<u64>,
    /// (turn round, spells cast so far that round).
    casts: (u64, u32),
    casting: Option<CastPlan>,
    attack: Option<AttackPlan>,
    /// Cards this bot put onto the battlefield this turn round: they are
    /// "summoning sick" and never attack the turn they arrive.
    played_this_turn: Vec<String>,
    /// seq of the last ended combat this bot settled (idempotent, from
    /// room.last_combat). A fresh mind adopts the current marker instead of
    /// settling history (restart safety).
    settled_combat: Option<u64>,
    adopted: bool,
    /// Chat lines spoken about blocks in the combat currently on the table.
    block_says: u32,
    /// seqs of resolved targeted spells this bot has already honored.
    honored_targets: Vec<u64>,
    /// iid of the counterspell this bot already spent a counter with: one
    /// counterspell counters exactly one spell, then resolves.
    spent_counter: Option<String>,
    /// iid of the opposing stack spell this bot already answered - one
    /// response per threat, never the whole hand.
    responded_to: Option<String>,
    said_gg: bool,
    said_win: bool,

    // --- Yu-Gi-Oh (the duel brain; unused at a Magic table) ---
    /// The one Normal Summon this turn has already been spent.
    ygo_summoned: bool,
    /// Tributes already sent to the Graveyard toward the summon in progress,
    /// so only the first one is announced.
    ygo_tributes_paid: usize,
    /// The monster a tribute summon in progress is paying for: held so paying
    /// the cost cannot change the bot's mind about what it was buying.
    ygo_summon_iid: Option<String>,
    /// Monsters that have already declared an attack this turn - Yu-Gi-Oh
    /// gives each monster one attack per Battle Phase.
    ygo_attacked: Vec<String>,
}

/// A bot never chews on one turn longer than this before passing. Its own
/// attack's response window is exempt (that clock belongs to the defender).
const TURN_FAILSAFE_MS: i64 = 35_000;
/// ...and never acts on a fresh turn faster than this. A bot that answers
/// the instant the turn arrives reads as a glitch, not an opponent - even
/// at an all-bot table someone may be spectating.
const TURN_MIN_THINK_MS: i64 = 500;
/// Attack response windows. Against humans the bot holds combat open until
/// the defender actually responds (blocks settle, life adjusts, or they end
/// combat themselves), up to a generous cap; a response is followed by a
/// short grace so a second block or a change of mind still fits. All-bot
/// tables need none of that.
const ATTACK_WAIT_HUMAN_MAX_MS: i64 = 45_000;
const ATTACK_RESPONSE_GRACE_MS: i64 = 4_000;
const ATTACK_WAIT_BOTS_MS: i64 = 1_600;

/// One decision per bot per tick: at most one game action plus any table talk.
/// `fast` marks mechanical bookkeeping (payment taps, damage settlement) the
/// scheduler may chain several of in one tick - a human taps five lands in a
/// second too; it is the DECISIONS that deserve the human pacing.
pub(crate) struct Decision {
    action: Option<Action>,
    say: Vec<String>,
    fast: bool,
}

impl Decision {
    fn none() -> Self {
        Decision { action: None, say: Vec::new(), fast: false }
    }
    fn act(action: Action) -> Self {
        Decision { action: Some(action), say: Vec::new(), fast: false }
    }
    fn fast(action: Action) -> Self {
        Decision { action: Some(action), say: Vec::new(), fast: true }
    }
}

// --------------------------------------------------------------- scheduler

/// One task for the whole server: every ~800ms, give each bot in each room at
/// most one action. Room ids are collected first and each room is locked on
/// its own; no DashMap ref is ever held across an await.
pub async fn scheduler(app: Arc<App>) {
    let mut minds: HashMap<(String, String), BotMind> = HashMap::new();
    let mut interval = tokio::time::interval(Duration::from_millis(800));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        interval.tick().await;
        let room_ids: Vec<String> = app
            .rooms
            .iter()
            .filter(|r| r.players.iter().any(|p| p.is_bot))
            .map(|r| r.id.clone())
            .collect();
        for rid in &room_ids {
            let Some(mut room) = app.rooms.get_mut(rid) else {
                continue;
            };
            let bots: Vec<String> = room
                .players
                .iter()
                .filter(|p| p.is_bot)
                .map(|p| p.user_id.clone())
                .collect();
            for uid in bots {
                let mind = minds.entry((rid.clone(), uid.clone())).or_default();
                // Mechanical bookkeeping chains within one tick (capped);
                // anything decision-shaped ends the bot's tick.
                for _ in 0..5 {
                    let decision = decide(&app, &room, &uid, mind, crate::now_ms());
                    if !decision.say.is_empty() {
                        let username = room
                            .players
                            .iter()
                            .find(|p| p.user_id == uid)
                            .map(|p| p.username.clone())
                            .unwrap_or_default();
                        for line in &decision.say {
                            ws::bot_chat(&app, &mut room, &uid, &username, line);
                        }
                    }
                    let Some(action) = decision.action else { break };
                    if let Err((code, msg)) =
                        ws::dispatch_action(&app, &mut room, &uid, action, None)
                    {
                        eprintln!("bot {uid} in room {rid}: {code}: {msg}");
                        // Enforced tables surface a rejected bot action to the
                        // room log: a bot proposing an illegal move is an
                        // engine bug, and the fuzz playtest asserts none
                        // appear. (match_over is the room freezing mid-plan,
                        // not an illegal move.)
                        if crate::rules::enforced(&room) && code != "match_over" {
                            let username = room
                                .players
                                .iter()
                                .find(|p| p.user_id == uid)
                                .map(|p| p.username.clone())
                                .unwrap_or_default();
                            room.seq += 1;
                            let seq = room.seq;
                            ws::room_log(
                                &app,
                                &room,
                                seq,
                                &format!("[rules] {username}'s move was rejected: {msg}"),
                            );
                        }
                        break;
                    }
                    if !decision.fast {
                        break;
                    }
                }
            }
        }
        // Drop scratch for bots or rooms that no longer exist.
        minds.retain(|(rid, uid), _| {
            app.rooms
                .get(rid)
                .map(|r| r.players.iter().any(|p| p.user_id == *uid))
                .unwrap_or(false)
        });
    }
}


// ------------------------------------------------------------------ modules

mod casting;
mod combat;
mod decide;
mod knowledge;
mod lines;
mod upkeep;
mod yugioh;

// One namespace for the whole brain: submodules see each other (and the types
// above) through these globs plus `use super::*`, exactly like a tests module.
pub(crate) use casting::*;
pub(crate) use combat::*;
pub(crate) use decide::*;
pub(crate) use knowledge::*;
pub(crate) use lines::*;
pub(crate) use upkeep::*;
pub(crate) use yugioh::*;
