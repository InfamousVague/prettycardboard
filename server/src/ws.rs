use crate::rooms::{self, Room};
use crate::{db, game, App, RoomRef};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tokio::sync::mpsc;

type Tx = mpsc::UnboundedSender<String>;

#[derive(Deserialize)]
#[serde(tag = "type")]
enum ClientMsg {
    #[serde(rename = "room.join", rename_all = "camelCase")]
    RoomJoin { room_id: String, deck_id: Option<String> },
    #[serde(rename = "room.spectate", rename_all = "camelCase")]
    RoomSpectate { room_id: String },
    #[serde(rename = "room.leave")]
    RoomLeave,
    #[serde(rename = "room.start")]
    RoomStart,
    #[serde(rename = "room.ready")]
    RoomReady { ready: bool },
    #[serde(rename = "room.deck.set", rename_all = "camelCase")]
    RoomDeckSet { deck_id: String },
    /// Host-only pre-game rule changes (mulligans, starting life/hand, first
    /// player). Rejected once the game has started.
    #[serde(rename = "room.settings")]
    RoomSettings { settings: rooms::GameSettings },
    #[serde(rename = "room.ping", rename_all = "camelCase")]
    RoomPing { target_user_id: String },
    #[serde(rename = "room.hand.hover")]
    RoomHandHover { position: Option<f64> },
    /// Live table pointer: normalized position over the table plus the card iid
    /// currently hovered (if any). Ephemeral presence, relayed and never stored.
    #[serde(rename = "cursor.move")]
    /// `mat` is the seat whose playmat the position is normalized against -
    /// None when the pointer is off every mat, which hides it for viewers.
    CursorMove { x: f64, y: f64, hover: Option<String>, mat: Option<i64> },
    /// "I just cracked something good": a notable pack pull, relayed to the
    /// table so everyone sees it live. Ephemeral - the durable record is the
    /// REST write to the collection and the pull feed.
    #[serde(rename = "pull.notify", rename_all = "camelCase")]
    PullNotify {
        scryfall_id: String,
        name: String,
        set_code: String,
        rarity: String,
        #[serde(default)]
        foil: bool,
    },
    #[serde(rename = "chat.send")]
    ChatSend { text: String },
    /// Ephemeral targeting indicator: "my spell (fromIid) is aimed at
    /// toIid/toSeat". Relayed to the room and never stored - the tabletop
    /// pointing gesture for sorceries and effects, any mode.
    #[serde(rename = "aim", rename_all = "camelCase")]
    Aim { from_iid: Option<String>, to_iid: Option<String>, to_seat: Option<usize>, kind: Option<String> },
    /// Seat an AI opponent (host only, pre-start). `deck_code` picks one of the
    /// embedded precons ("random"/absent = random); `style` is
    /// "casual" | "aggro" | "defensive".
    #[serde(rename = "bot.add", rename_all = "camelCase")]
    BotAdd { deck_code: Option<String>, style: Option<String>, difficulty: Option<String> },
    /// Remove the bot holding `seat` (host only, pre-start).
    #[serde(rename = "bot.remove")]
    BotRemove { seat: usize },
    #[serde(rename = "invite.send", rename_all = "camelCase")]
    InviteSend { to_user_id: String, room_id: String },
    #[serde(rename = "game.action")]
    GameAction { action: game::Action },
    #[serde(rename = "playmat.set")]
    PlaymatSet { id: Option<String> },
    /// My custom zone-pile placement (normalized centers by logical zone id);
    /// an empty map resets to the default strip layout.
    #[serde(rename = "matlayout.set")]
    MatLayoutSet { layout: std::collections::BTreeMap<String, rooms::MatPos> },
    /// My chosen card back, mirrored so every viewer paints my face-down cards
    /// with it (their board wears their back, not mine).
    #[serde(rename = "cardback.set")]
    CardBackSet { id: Option<String> },
    /// Client-computed public metrics for my current deck (colors, curve,
    /// counts) shown on the matchup splash. Opaque to the server beyond a size
    /// clamp - the server has no card metadata to verify against.
    #[serde(rename = "deckmeta.set")]
    DeckMetaSet { meta: Option<serde_json::Value> },
    /// Per-player turn automation: untap/draw at the start of my turn (off by
    /// default; synced from the client's settings).
    #[serde(rename = "auto.set")]
    AutoSet { untap: bool, draw: bool },
    #[serde(rename = "coach.set")]
    CoachSet { on: bool },
    // Replay scrubbing: viewer-local and read-only. These NEVER enter apply()
    // and never move the shared cursor - they only materialize a past frame
    // for the requesting connection.
    #[serde(rename = "replay.seek")]
    ReplaySeek { index: usize },
    // Limited. The host uploads every pack because the collation data lives in
    // the browser (see rooms::DraftCard); the server only deals, passes and
    // enforces. `mode` picks booster draft or sealed.
    #[serde(rename = "draft.start", rename_all = "camelCase")]
    DraftStart {
        set: String,
        set_name: String,
        /// "draft" (the default, and what an older client sends) or "sealed".
        #[serde(default)]
        mode: String,
        rounds: usize,
        #[serde(default)]
        pick_seconds: u64,
        #[serde(default)]
        build_seconds: u64,
        #[serde(default)]
        lock_decks: bool,
        /// The drafted set's basic lands, for filling out a forced build.
        #[serde(default)]
        basics: Vec<rooms::DraftCard>,
        packs: Vec<Vec<rooms::DraftCard>>,
    },
    #[serde(rename = "draft.pick")]
    DraftPick { index: usize, id: String },
    /// This seat has saved a deck out of its pool and is done building.
    #[serde(rename = "draft.built")]
    DraftBuilt,
}

pub async fn ws_handler(
    State(app): State<Arc<App>>,
    Query(params): Query<HashMap<String, String>>,
    ws: WebSocketUpgrade,
) -> Response {
    let user = params
        .get("token")
        .and_then(|t| db::user_by_token(&app.db.lock().unwrap(), t));
    match user {
        Some(user) => ws.on_upgrade(move |socket| client_loop(app, user, socket)),
        None => (StatusCode::UNAUTHORIZED, "invalid token").into_response(),
    }
}

async fn client_loop(app: Arc<App>, user: db::User, socket: WebSocket) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let writer = tokio::spawn(async move {
        while let Some(text) = rx.recv().await {
            if sink.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });

    let conn_id = app.conn_seq.fetch_add(1, Ordering::Relaxed);
    let came_online = {
        let mut entry = app.conns.entry(user.id.clone()).or_default();
        let was_empty = entry.is_empty();
        entry.push((conn_id, tx.clone()));
        was_empty
    };

    let _ = tx.send(json!({"type": "welcome", "userId": user.id}).to_string());
    if came_online {
        presence_update(&app, &user.id);
    }

    // Reconnect: if this user still holds a seat, revive it and resync.
    if let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) {
        let mut stale = false;
        if let Some(mut room) = app.rooms.get_mut(&rref.room_id) {
            if rref.spectating {
                let msg = json!({"type": "room.state", "state": room.state_for(None)});
                let _ = tx.send(msg.to_string());
            } else if let Some(p) = room.players.iter_mut().find(|p| p.user_id == user.id) {
                p.online = true;
                rooms::touch(&app, &mut room);
                room_send_states(&app, &room);
            } else {
                stale = true;
            }
        } else {
            stale = true;
        }
        if stale {
            app.user_rooms.remove(&user.id);
        }
    }

    while let Some(Ok(msg)) = stream.next().await {
        match msg {
            Message::Text(text) => handle_msg(&app, &user, text.as_str(), &tx),
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Cleanup: drop this connection; if it was the last, go offline.
    let went_offline = {
        let mut empty = false;
        if let Some(mut entry) = app.conns.get_mut(&user.id) {
            entry.retain(|(id, _)| *id != conn_id);
            empty = entry.is_empty();
        }
        if empty {
            app.conns.remove_if(&user.id, |_, v| v.is_empty());
        }
        empty
    };
    if went_offline {
        if let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) {
            if rref.spectating {
                // Spectators hold no state; drop them from the room entirely.
                leave_room(&app, &user);
            } else if let Some(mut room) = app.rooms.get_mut(&rref.room_id) {
                if let Some(p) = room.players.iter_mut().find(|p| p.user_id == user.id) {
                    p.online = false;
                    p.ready = false;
                    rooms::touch(&app, &mut room);
                }
                room_send_all(
                    &app,
                    &room,
                    &json!({
                        "type": "room.hand.hover",
                        "fromUserId": user.id,
                        "position": null,
                    }),
                );
                room_send_states(&app, &room);
            }
        }
        presence_update(&app, &user.id);
    }
    writer.abort();
}

fn handle_msg(app: &Arc<App>, user: &db::User, text: &str, tx: &Tx) {
    let msg: ClientMsg = match serde_json::from_str(text) {
        Ok(m) => m,
        Err(e) => {
            send_err(tx, "bad_message", &format!("unrecognized message: {e}"));
            return;
        }
    };
    match msg {
        ClientMsg::RoomJoin { room_id, deck_id } => join_room(app, user, &room_id, deck_id, tx),
        ClientMsg::RoomSpectate { room_id } => spectate_room(app, user, &room_id, tx),
        ClientMsg::RoomLeave => {
            leave_room(app, user);
            presence_update(app, &user.id);
        }
        ClientMsg::RoomStart => start_room(app, user, tx),
        ClientMsg::RoomReady { ready } => room_ready(app, user, ready, tx),
        ClientMsg::RoomDeckSet { deck_id } => room_deck_set(app, user, &deck_id, tx),
        ClientMsg::RoomSettings { settings } => room_settings(app, user, settings, tx),
        ClientMsg::RoomPing { target_user_id } => room_ping(app, user, &target_user_id, tx),
        ClientMsg::RoomHandHover { position } => room_hand_hover(app, user, position, tx),
        ClientMsg::CursorMove { x, y, hover, mat } => cursor_move(app, user, x, y, hover, mat, tx),
        ClientMsg::PullNotify { scryfall_id, name, set_code, rarity, foil } => {
            pull_notify(app, user, &scryfall_id, &name, &set_code, &rarity, foil, tx)
        }
        ClientMsg::ChatSend { text } => chat_send(app, user, &text, tx),
        ClientMsg::Aim { from_iid, to_iid, to_seat, kind } => {
            if let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) {
                if let Some(room) = app.rooms.get(&rref.room_id) {
                    room_send_all(
                        app,
                        &room,
                        &json!({
                            "type": "aim",
                            "fromUserId": user.id,
                            "username": user.username,
                            "fromIid": from_iid,
                            "toIid": to_iid,
                            "toSeat": to_seat,
                            "kind": kind,
                            "ts": crate::now_ms(),
                        }),
                    );
                }
            }
        }
        ClientMsg::BotAdd { deck_code, style, difficulty } => bot_add(app, user, deck_code, style, difficulty, tx),
        ClientMsg::BotRemove { seat } => bot_remove(app, user, seat, tx),
        ClientMsg::InviteSend { to_user_id, room_id } => invite_send(app, user, &to_user_id, &room_id),
        ClientMsg::GameAction { action } => game_action(app, user, action, tx),
        ClientMsg::PlaymatSet { id } => playmat_set(app, user, id),
        ClientMsg::MatLayoutSet { layout } => mat_layout_set(app, user, layout),
        ClientMsg::CardBackSet { id } => card_back_set(app, user, id),
        ClientMsg::DeckMetaSet { meta } => deck_meta_set(app, user, meta),
        ClientMsg::AutoSet { untap, draw } => auto_set(app, user, untap, draw),
        ClientMsg::CoachSet { on } => coach_set(app, user, on),
        ClientMsg::ReplaySeek { index } => replay_seek(app, user, index, tx),
        ClientMsg::DraftStart {
            set,
            set_name,
            mode,
            rounds,
            pick_seconds,
            build_seconds,
            lock_decks,
            basics,
            packs,
        } => draft_start(
            app,
            user,
            rooms::DraftSetup { set, set_name, mode, rounds, pick_seconds, build_seconds, lock_decks, basics },
            packs,
            tx,
        ),
        ClientMsg::DraftPick { index, id } => draft_pick(app, user, index, &id, tx),
        ClientMsg::DraftBuilt => draft_built(app, user, tx),
    }
}

fn send_err(tx: &Tx, code: &str, message: &str) {
    let _ = tx.send(json!({"type": "error", "code": code, "message": message}).to_string());
}

pub fn send_user(app: &App, user_id: &str, msg: &Value) {
    if let Some(conns) = app.conns.get(user_id) {
        let text = msg.to_string();
        for (_, tx) in conns.iter() {
            let _ = tx.send(text.clone());
        }
    }
}

/// Broadcast to every member and spectator of a room. Stamps the message with
/// its `roomId` so a client that is a (possibly offline) member of several
/// tables can tell which table an event belongs to and only apply the ones for
/// the table it is currently viewing.
fn room_send_all(app: &App, room: &Room, msg: &Value) {
    let mut tagged = msg.clone();
    if let Some(obj) = tagged.as_object_mut() {
        obj.insert("roomId".to_string(), json!(room.id));
    }
    for p in &room.players {
        send_user(app, &p.user_id, &tagged);
    }
    for s in &room.spectators {
        send_user(app, &s.user_id, &tagged);
    }
}

/// Send every viewer their own filtered room.state snapshot.
pub fn room_send_states(app: &App, room: &Room) {
    room_send_states_except(app, room, None);
}

/// Broadcast per-viewer room state, optionally skipping one user id. Used on
/// leave so someone who just stepped away from a persistent table (they stay
/// in `players`, offline) is not handed a fresh state that yanks them back in.
pub fn room_send_states_except(app: &App, room: &Room, except: Option<&str>) {
    for p in &room.players {
        if Some(p.user_id.as_str()) == except {
            continue;
        }
        let msg = json!({"type": "room.state", "state": room.state_for(Some(&p.user_id))});
        send_user(app, &p.user_id, &msg);
    }
    if !room.spectators.is_empty() {
        let msg = json!({"type": "room.state", "state": room.state_for(None)});
        for s in &room.spectators {
            if Some(s.user_id.as_str()) == except {
                continue;
            }
            send_user(app, &s.user_id, &msg);
        }
    }
}

pub fn room_log(app: &App, room: &Room, seq: u64, text: &str) {
    room_send_all(
        app,
        room,
        &json!({"type": "log", "seq": seq, "text": text, "ts": crate::now_ms()}),
    );
}

/// Notify all of a user's friends of their current presence.
pub fn presence_update(app: &App, user_id: &str) {
    let online = app.is_online(user_id);
    let room_id = app.seated_room(user_id);
    let friends = db::friend_ids(&app.db.lock().unwrap(), user_id);
    let mut msg = json!({"type": "presence", "userId": user_id, "online": online});
    if let Some(rid) = room_id {
        msg["roomId"] = json!(rid);
    }
    for friend in friends {
        send_user(app, &friend, &msg);
    }
}

fn join_room(app: &Arc<App>, user: &db::User, room_id: &str, deck_id: Option<String>, tx: &Tx) {
    // Rejoining the room you are already seated in just revives the seat.
    if let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) {
        if rref.room_id == room_id && !rref.spectating {
            if let Some(mut room) = app.rooms.get_mut(room_id) {
                if let Some(p) = room.players.iter_mut().find(|p| p.user_id == user.id) {
                    p.online = true;
                }
                rooms::touch(app, &mut room);
                room_send_states(app, &room);
                send_undo_state(app, &room);
                send_timeline(app, &room);
                return;
            }
        }
        // Seated or spectating elsewhere: leave that first.
        leave_room(app, user);
    }

    // Returning to a persistent table you had stepped away from: your seat and
    // board are still there (offline). Revive them rather than taking a new
    // seat (which would duplicate you).
    let revived = {
        let mut done = false;
        if let Some(mut room) = app.rooms.get_mut(room_id) {
            if let Some(p) = room.players.iter_mut().find(|p| p.user_id == user.id) {
                p.online = true;
                done = true;
                room.seq += 1;
                let seq = room.seq;
                rooms::touch(app, &mut room);
                room_send_states(app, &room);
                room_log(app, &room, seq, &format!("{} returns to the table", user.username));
                send_undo_state(app, &room);
                send_timeline(app, &room);
            }
        }
        done
    };
    if revived {
        app.user_rooms.insert(
            user.id.clone(),
            RoomRef { room_id: room_id.to_string(), spectating: false },
        );
        return;
    }

    let deck = match &deck_id {
        Some(id) => match db::deck_get(&app.db.lock().unwrap(), id) {
            Some(row) if row.user_id == user.id => Some(row),
            _ => {
                send_err(tx, "deck_not_found", "deck not found");
                return;
            }
        },
        None => None,
    };

    let Some(mut room) = app.rooms.get_mut(room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    if let Some(deck) = deck.as_ref() {
        if deck.game != room.game {
            send_err(tx, "wrong_game", "deck does not match this table's game");
            return;
        }
    }
    let taken: Vec<usize> = room.players.iter().map(|p| p.seat).collect();
    let Some(seat) = (0..room.seats).find(|s| !taken.contains(s)) else {
        send_err(tx, "room_full", "room is full");
        return;
    };

    // Starting vitals are game-driven. MTG life follows the format (commander 40,
    // standard 20). Cyberpunk tracks Net + RAM (the `life`/`poison` slots,
    // relabeled client-side) as freeform counters that both start at 0.
    // Commander-board cards are flagged isCommander only when MTG command-zone
    // machinery is active; a Cyberpunk Legend sits in the (relabeled) command
    // zone without triggering tax/return.
    let is_commander_room = rooms::format_has_commander(&room.format);
    // Honor the host's startingLife override (mirrors start_room) so lobby
    // seats and mid-game joiners match the table's actual rule.
    let starting_life = if room.game == "cyberpunk" {
        0
    } else if room.game == "yugioh" {
        room.settings.starting_life.unwrap_or(8000)
    } else {
        room.settings
            .starting_life
            .unwrap_or_else(|| rooms::format_default_life(&room.format))
    };
    // Snapshot the deck's name now: match results must survive a later
    // rename or delete of the deck row.
    let deck_name = deck.as_ref().map(|d| d.name.clone());
    // A deck may bring its own mat; None leaves the seat bare so the client's
    // global preference lands on it a moment later.
    let deck_mat = valid_playmat(app, &user.id, deck.as_ref().and_then(|d| d.playmat.clone()));
    // Same deal for the deck's sleeves. Card-back ids are relayed unvalidated
    // (they are client asset names - see card_back_set), so this is a plain
    // carry-over rather than a check.
    let deck_back = deck.as_ref().and_then(|d| d.card_back.clone());
    let (command, library) = deck
        .map(|d| rooms::build_zones(&d.cards(), is_commander_room, &room.game))
        .unwrap_or_default();
    let gig_dice = rooms::new_gig_dice(&room.game);
    room.players.push(rooms::Player {
        user_id: user.id.clone(),
        username: user.username.clone(),
        seat,
        ready: false,
        life: starting_life,
        poison: 0,
        mana: rooms::empty_mana(),
        cmd_damage: Default::default(),
        cmd_damage_by_commander: Default::default(),
        commander_tax: Default::default(),
        mulligan: None,
        playmat: deck_mat,
        card_back: deck_back,
        deck_meta: None,
        auto_untap: false,
        auto_draw: false,
        coach: false,
        lands_this_turn: 0,
        mat_layout: Default::default(),
        gig_dice,
        roll_seq: 0,
        last_roll: None,
        deck_id: deck_id.clone(),
        deck_name,
        conceded: false,
        is_bot: false,
        bot_style: None,
        bot_difficulty: None,
        turns_taken: 0,
        turn_time_ms: 0,
        cards_played: 0,
        cards_drawn: 0,
        peak_battlefield: 0,
        hand: Vec::new(),
        library,
        battlefield: Vec::new(),
        graveyard: Vec::new(),
        exile: Vec::new(),
        command,
        hand_revealed: false,
        online: true,
        undo: None,
        peeked: Vec::new(),
    });
    room.players.sort_by_key(|p| p.seat);
    // Late joins into a running game raise the match-end floor with them
    // (never lowered: a solo-started room still never "finishes").
    if room.started {
        room.started_players = room.started_players.max(room.players.len());
    }
    app.user_rooms.insert(
        user.id.clone(),
        RoomRef { room_id: room_id.to_string(), spectating: false },
    );
    room.seq += 1;
    let seq = room.seq;
    rooms::touch(app, &mut room);
    room_send_states(app, &room);
    room_log(app, &room, seq, &format!("{} takes seat {}", user.username, seat + 1));
    send_undo_state(app, &room);
    send_timeline(app, &room);
    drop(room);
    presence_update(app, &user.id);
}

fn spectate_room(app: &Arc<App>, user: &db::User, room_id: &str, tx: &Tx) {
    if let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) {
        if rref.room_id == room_id && rref.spectating {
            if let Some(room) = app.rooms.get(room_id) {
                let _ = tx.send(json!({"type": "room.state", "state": room.state_for(None)}).to_string());
                return;
            }
        }
        leave_room(app, user);
    }
    let Some(mut room) = app.rooms.get_mut(room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    room.spectators.push(rooms::UserRef {
        user_id: user.id.clone(),
        username: user.username.clone(),
    });
    app.user_rooms.insert(
        user.id.clone(),
        RoomRef { room_id: room_id.to_string(), spectating: true },
    );
    room.seq += 1;
    let seq = room.seq;
    rooms::touch(app, &mut room);
    room_send_states(app, &room);
    room_log(app, &room, seq, &format!("{} is now spectating", user.username));
    drop(room);
    presence_update(app, &user.id);
}

/// Vacate the user's seat (dumping their cards) or spectator slot. Emptied
/// rooms are NOT dropped anymore: they persist until the sweeper expires
/// them (24h offline for quick rooms, 30 days idle for persistent lobbies).
fn leave_room(app: &Arc<App>, user: &db::User) {
    let Some((_, rref)) = app.user_rooms.remove(&user.id) else {
        return;
    };
    if let Some(mut room) = app.rooms.get_mut(&rref.room_id) {
        if !rref.spectating && room.started {
            room_send_all(
                app,
                &room,
                &json!({
                    "type": "room.hand.hover",
                    "fromUserId": user.id,
                    "position": null,
                }),
            );
        }
        if rref.spectating {
            room.spectators.retain(|s| s.user_id != user.id);
        } else if room.persistent {
            // A persistent table is a SAVED table: leaving is "step away", not
            // "abandon". Keep the seat and board (so it stays in your saved
            // tables and you can resume), just mark the player offline.
            if let Some(p) = room.players.iter_mut().find(|p| p.user_id == user.id) {
                p.online = false;
                p.ready = false;
            }
        } else {
            let was_active = room.started
                && room
                    .players
                    .iter()
                    .find(|p| p.user_id == user.id)
                    .map(|p| p.seat)
                    == Some(room.active_seat);
            // Walking out of a started quick game IS a concession: settle the
            // match while the leaver is still seated (a 2-player walkout ends
            // it with them recorded as the conceding loser), and snapshot
            // them into `departed` otherwise so the eventual result still
            // lists the quitter instead of erasing their loss.
            if room.started && room.match_result.is_none() {
                let now = crate::now_ms();
                if was_active {
                    game::turn_clock_credit(&mut room, now);
                }
                if let Some(p) = room.players.iter_mut().find(|p| p.user_id == user.id) {
                    p.conceded = true;
                }
                maybe_finish_match(app, &mut room);
                if room.match_result.is_none() {
                    let snapshot = room
                        .players
                        .iter()
                        .find(|p| p.user_id == user.id)
                        .map(rooms::result_player);
                    if let Some(snapshot) = snapshot {
                        room.departed.push(snapshot);
                    }
                }
            }
            room.players.retain(|p| p.user_id != user.id);
            // Their shared-zone holdings leave with them.
            room.stack.retain(|e| e.owner != user.id);
            room.pending_cmd.retain(|p| p.owner != user.id);
            if room.host == user.id {
                // Hand the lobby to whoever remains. A human, preferably:
                // bots cannot run a lobby (no start, no settings, no kicks).
                if let Some(next) =
                    room.players.iter().find(|p| !p.is_bot).or_else(|| room.players.first())
                {
                    room.host = next.user_id.clone();
                }
            }
            // If it was the leaver's turn, advance so the table doesn't stall
            // on an empty seat (also what lets an all-bot game keep running).
            if was_active && !room.players.is_empty() {
                // A combat with attackers is stashed as last_combat so bot
                // defenders can still settle its damage.
                game::clear_combat(&mut room);
                let now = crate::now_ms();
                // The leaver is already gone, so the credit is a no-op, but
                // this still resets the clock for the seat that inherits it.
                game::turn_clock_credit(&mut room, now);
                let (next, wrapped) = game::next_occupied(&room, room.active_seat);
                if wrapped {
                    room.turn_number += 1;
                }
                room.active_seat = next;
                game::turn_clock_begin(&mut room, next, now);
                if room.auto_turn {
                    room.phase = "main1".to_string();
                    let _ = game::auto_turn_begin(&mut room, next);
                }
            }
        }
        room.seq += 1;
        let seq = room.seq;
        rooms::touch(app, &mut room);
        // Skip the leaver: on a persistent table they remain a (now offline)
        // member, and a fresh state would pull their client back into the room.
        room_send_states_except(app, &room, Some(&user.id));
        room_log(app, &room, seq, &format!("{} leaves the room", user.username));
        // Walking out of a started quick game can leave one player standing.
        maybe_finish_match(app, &mut room);
    }
}

fn start_room(app: &Arc<App>, user: &db::User, tx: &Tx) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    if room.host != user.id {
        send_err(tx, "forbidden", "only the host can start the game");
        return;
    }
    // A spectating host may start a table where every seat is a bot: that is
    // the "sit back and watch them play" mode. Any human seat still requires
    // the host to be seated like before.
    if rref.spectating {
        let all_bots = !room.players.is_empty() && room.players.iter().all(|p| p.is_bot);
        if !all_bots || room.players.len() < 2 {
            send_err(tx, "forbidden", "spectators can only start an all-bot table (2+ bots)");
            return;
        }
    }
    if room.started {
        send_err(tx, "already_started", "the game has already started");
        return;
    }
    // A draft owes every seat a deck it has not built yet; starting now would
    // deal opening hands from whatever people brought and throw the pools away.
    if room.draft.as_ref().is_some_and(|d| d.phase != "done") {
        send_err(tx, "draft_running", "finish the draft before starting the game");
        return;
    }
    if room.players.iter().any(|p| !p.online) {
        send_err(tx, "players_offline", "every seated player must be online");
        return;
    }
    if room.players.iter().any(|p| p.deck_id.is_none()) {
        send_err(tx, "deck_required", "every seated player must choose a deck");
        return;
    }
    if room.players.iter().any(|p| !p.ready) {
        send_err(tx, "not_ready", "every seated player must be ready");
        return;
    }
    room.started = true;
    if crate::rules::enforced(&room) {
        // Belt and braces: any card the lobby phase missed gets fetched now.
        crate::oracle::prefetch_room(app, &room);
    }
    let deal = crate::game::effective_hand_size(&room);
    // Reset each seat's life to the effective starting total (host override or
    // format/game default). Cyberpunk keeps its Net/RAM slots at 0; Yu-Gi-Oh
    // duels start at 8000 LP.
    let base_life = match room.game.as_str() {
        "cyberpunk" => 0,
        "yugioh" => 8000,
        _ => rooms::format_default_life(&room.format),
    };
    let starting_life = if room.game == "cyberpunk" {
        0
    } else {
        room.settings.starting_life.unwrap_or(base_life)
    };
    // Yu-Gi-Oh has no mulligans: seats start already "kept" so the first turn
    // begins the moment the hands are dealt.
    let mull_state = if room.game == "yugioh" { "kept" } else { "deciding" };
    for p in room.players.iter_mut() {
        p.life = starting_life;
        let n = deal.min(p.library.len());
        let drawn: Vec<rooms::Card> = p.library.drain(0..n).collect();
        p.hand.extend(drawn);
        // Every seat starts in the mulligan decision (freeform: no other action
        // is gated on it) — except Yu-Gi-Oh, which skips the flow entirely.
        p.mulligan = Some(rooms::Mull { state: mull_state.to_string(), taken: 0 });
    }
    // Turn order anchor: host may force a random seat or a specific one; the
    // default follows the lowest occupied seat.
    let mut seats: Vec<usize> = room.players.iter().map(|p| p.seat).collect();
    seats.sort_unstable();
    let starting = match room.settings.first_player.as_str() {
        "seat" => room
            .settings
            .first_seat
            .filter(|s| seats.contains(s))
            .unwrap_or_else(|| seats.first().copied().unwrap_or(0)),
        "random" if !seats.is_empty() => seats[rand::random_range(0..seats.len())],
        _ => seats.first().copied().unwrap_or(0),
    };
    room.starting_seat = starting;
    room.active_seat = starting;
    room.turn_number = 1;
    room.phase = "main1".to_string();
    // Match clock: when the game began, how many sat down (the match-end
    // check needs >= 2), and the starting player's turn clock.
    let started_now = crate::now_ms();
    room.started_at_ms = started_now;
    room.started_players = room.players.len();
    game::turn_clock_begin(&mut room, starting, started_now);
    room.seq += 1;
    let seq = room.seq;

    // Log this game to each human player's match history (idempotent per
    // room, so re-starting the same table never double-lists it).
    let players_json = serde_json::to_string(
        &room
            .players
            .iter()
            .map(|p| serde_json::json!({ "username": p.username, "isBot": p.is_bot }))
            .collect::<Vec<_>>(),
    )
    .unwrap_or_else(|_| "[]".to_string());
    let now = crate::now_ms();
    {
        let conn = app.db.lock().unwrap();
        // Bots have no account and no match-history page; skip their rows.
        for p in room.players.iter().filter(|p| !p.is_bot) {
            db::match_record(
                &conn,
                &crate::hex_id(8),
                &p.user_id,
                &room.id,
                &room.name,
                &room.format,
                &players_json,
                room.seats as i64,
                &room.game,
                now,
            );
        }
    }

    // Seed the undo/redo/replay timeline with the opening state, so undo can
    // reach all the way back to the deal. hist_clear records any prior rows for
    // deletion so a re-started persistent table does not leak an old timeline.
    room.hist_clear();
    room.push_history(user.id.clone(), "Game started".to_string(), seq, None);

    // Yu-Gi-Oh seats were dealt already "kept" (no mulligan flow): the first
    // turn begins right now. A no-op for every other game, whose seats are
    // still deciding (their keeps trigger it via MullKeep/Concede).
    let first_turn_logs = game::maybe_begin_first_turn(&mut room, started_now);

    rooms::touch(app, &mut room);
    room_send_states(app, &room);
    let started_line = if room.game == "yugioh" {
        format!("Game started: opening hands of {deal} dealt")
    } else {
        format!("Game started: opening hands of {deal} dealt; keep or mulligan")
    };
    room_log(app, &room, seq, &started_line);
    for line in first_turn_logs {
        room.seq += 1;
        let line_seq = room.seq;
        room_log(app, &room, line_seq, &line);
    }
    send_undo_state(app, &room);
    send_timeline(app, &room);
}

fn room_ready(app: &Arc<App>, user: &db::User, ready: bool, tx: &Tx) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    if rref.spectating {
        send_err(tx, "forbidden", "spectators cannot ready a seat");
        return;
    }
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    if room.started {
        send_err(tx, "already_started", "the game has already started");
        return;
    }
    let Some(player) = room.players.iter_mut().find(|p| p.user_id == user.id) else {
        send_err(tx, "not_seated", "you are not seated in this room");
        return;
    };
    if ready && player.deck_id.is_none() {
        send_err(tx, "deck_required", "choose a deck before marking ready");
        return;
    }
    if player.ready != ready {
        player.ready = ready;
        rooms::touch(app, &mut room);
        room_send_states(app, &room);
    }
}

fn room_deck_set(app: &Arc<App>, user: &db::User, deck_id: &str, tx: &Tx) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    if rref.spectating {
        send_err(tx, "forbidden", "spectators cannot choose a deck");
        return;
    }
    let Some(deck) = db::deck_get(&app.db.lock().unwrap(), deck_id) else {
        send_err(tx, "deck_not_found", "deck not found");
        return;
    };
    if deck.user_id != user.id {
        send_err(tx, "forbidden", "that deck does not belong to you");
        return;
    }
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    if room.started {
        send_err(tx, "already_started", "the game has already started");
        return;
    }
    // A locked draft table plays what it drafted. Enforced here rather than by
    // hiding the picker, because the picker is not the only way to send this.
    if room
        .draft
        .as_ref()
        .is_some_and(|d| d.lock_decks && d.seats.iter().any(|s| s.user_id == user.id && s.built))
    {
        send_err(tx, "draft_locked", "this table plays the decks it drafted");
        return;
    }
    if deck.game != room.game {
        send_err(tx, "wrong_game", "deck does not match this table's game");
        return;
    }
    let (command, library) = rooms::build_zones(&deck.cards(), rooms::format_has_commander(&room.format), &room.game);
    // A deck can bring its own mat. Resolved here rather than client-side
    // because this is the moment the deck is chosen, and it is immune to the
    // client's re-shares (any preference change, every reconnect) overwriting
    // the seat with the global preference a beat later.
    let deck_mat = valid_playmat(app, &user.id, deck.playmat.clone());
    let deck_back = deck.card_back.clone();
    let Some(player) = room.players.iter_mut().find(|p| p.user_id == user.id) else {
        send_err(tx, "not_seated", "you are not seated in this room");
        return;
    };
    if deck_mat.is_some() {
        player.playmat = deck_mat;
    }
    if deck_back.is_some() {
        player.card_back = deck_back;
    }
    player.deck_id = Some(deck.id);
    player.deck_name = Some(deck.name);
    // Metrics describe the previous deck; the owner's client re-sends fresh
    // ones (deckmeta.set) once it recomputes for the new list.
    player.deck_meta = None;
    player.command = command;
    player.library = library;
    player.hand.clear();
    player.battlefield.clear();
    player.graveyard.clear();
    player.exile.clear();
    player.ready = false;
    if crate::rules::enforced(&room) {
        crate::oracle::prefetch_room(app, &room);
    }
    rooms::touch(app, &mut room);
    room_send_states(app, &room);
}

/// Host-only pre-game rule change. Sanitizes free-form fields and rejects any
/// change once the game is running.
fn room_settings(app: &Arc<App>, user: &db::User, mut settings: rooms::GameSettings, tx: &Tx) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    if room.host != user.id {
        send_err(tx, "forbidden", "only the host can change settings");
        return;
    }
    if room.started {
        send_err(tx, "already_started", "settings are locked once the game starts");
        return;
    }
    // Clamp into sane ranges so a crafted payload cannot wedge the game.
    if settings.mulligan_rule != "vancouver" {
        settings.mulligan_rule = "london".to_string();
    }
    if !matches!(settings.first_player.as_str(), "random" | "seat") {
        settings.first_player = "auto".to_string();
    }
    // Yu-Gi-Oh life is four digits (8000 default); the other games stay tight.
    let life_cap = if room.game == "yugioh" { 99_999 } else { 999 };
    settings.starting_life = settings.starting_life.map(|l| l.clamp(1, life_cap));
    settings.starting_hand = settings.starting_hand.map(|h| h.clamp(0, 20));
    settings.free_mulligans = settings.free_mulligans.map(|m| m.min(7));
    if let Some(seat) = settings.first_seat {
        if seat >= room.seats {
            settings.first_seat = None;
        }
    }
    let enforce_flipped_on = settings.enforced && !room.settings.enforced;
    room.settings = settings;
    // Enforcement only means something for Magic tables.
    if room.game != "mtg" {
        room.settings.enforced = false;
    }
    if enforce_flipped_on && crate::rules::enforced(&room) {
        // Warm the oracle cache so the rules have answers by game start.
        crate::oracle::prefetch_room(app, &room);
    }
    rooms::touch(app, &mut room);
    room_send_states(app, &room);
}

fn chat_send(app: &Arc<App>, user: &db::User, text: &str, tx: &Tx) {
    let text = text.trim();
    if text.is_empty() {
        return;
    }
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    let Some(room) = app.rooms.get(&rref.room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    room_send_all(
        app,
        &room,
        &json!({
            "type": "chat",
            "from": {"userId": user.id, "username": user.username},
            "text": text,
            "ts": crate::now_ms(),
        }),
    );
}

/// Broadcast a chat line spoken by a bot. Bots have no `db::User` or socket;
/// the frame is byte-for-byte what a human's chat.send produces, so clients
/// need no special handling to render bot table talk.
pub fn bot_chat(app: &App, room: &Room, bot_id: &str, username: &str, text: &str) {
    room_send_all(
        app,
        room,
        &json!({
            "type": "chat",
            "from": {"userId": bot_id, "username": username},
            "text": text,
            "ts": crate::now_ms(),
        }),
    );
}

/// {"type":"bot.add"} per the Bots addendum: host-only, pre-start, needs a
/// free seat; seats a synthetic player with one of the embedded precons. The
/// bot's zones are built through the same path as a human's deck so cards
/// carry identical scryfall ids and commander flags.
fn bot_add(
    app: &Arc<App>,
    user: &db::User,
    deck_code: Option<String>,
    style: Option<String>,
    difficulty: Option<String>,
    tx: &Tx,
) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    if room.host != user.id {
        send_err(tx, "forbidden", "only the host can add bots");
        return;
    }
    if room.started {
        send_err(tx, "already_started", "the game has already started");
        return;
    }
    if room.game != "mtg" {
        send_err(tx, "bad_game", "bots only play Magic tables");
        return;
    }
    let taken: Vec<usize> = room.players.iter().map(|p| p.seat).collect();
    let Some(seat) = (0..room.seats).find(|s| !taken.contains(s)) else {
        send_err(tx, "room_full", "room is full");
        return;
    };
    let decks = &crate::bot::data().decks;
    let deck = match deck_code.as_deref() {
        None | Some("random") => &decks[rand::random_range(0..decks.len())],
        Some(code) => match decks.iter().find(|d| d.code == code) {
            Some(d) => d,
            None => {
                send_err(tx, "bad_deck", &format!("no bot deck {code}"));
                return;
            }
        },
    };
    let style = match style.as_deref() {
        Some("aggro") => "aggro",
        Some("defensive") => "defensive",
        _ => "casual",
    };
    let username = crate::bot::pick_name(&room);
    let bot_id = format!("bot:{}", crate::hex_id(6));
    let cards: Vec<db::DeckCard> = deck
        .cards
        .iter()
        .map(|c| db::DeckCard {
            scryfall_id: c.sid.clone(),
            name: c.name.clone(),
            quantity: c.qty,
            board: c.board.clone(),
        })
        .collect();
    let (command, library) =
        rooms::build_zones(&cards, rooms::format_has_commander(&room.format), &room.game);
    let starting_life = room
        .settings
        .starting_life
        .unwrap_or_else(|| rooms::format_default_life(&room.format));
    let gig_dice = rooms::new_gig_dice(&room.game);
    room.players.push(rooms::Player {
        user_id: bot_id.clone(),
        username: username.clone(),
        seat,
        // Bots are always ready and always online; the deck id is a sentinel
        // so start_room's "everyone picked a deck" check holds for them.
        ready: true,
        life: starting_life,
        poison: 0,
        mana: rooms::empty_mana(),
        cmd_damage: Default::default(),
        cmd_damage_by_commander: Default::default(),
        commander_tax: Default::default(),
        mulligan: None,
        playmat: Some(crate::bot::bot_playmat(&username).to_string()),
        card_back: None,
        deck_meta: None,
        // Bots untap and draw on their own turn without a human's clicks.
        auto_untap: true,
        auto_draw: true,
        // A bot never reads its own advice.
        coach: false,
        lands_this_turn: 0,
        mat_layout: Default::default(),
        gig_dice,
        roll_seq: 0,
        last_roll: None,
        deck_id: Some(format!("bot:{}", deck.code)),
        deck_name: Some(deck.name.clone()),
        conceded: false,
        is_bot: true,
        bot_style: Some(style.to_string()),
        bot_difficulty: Some(match difficulty.as_deref() {
            Some("easy") => "easy".to_string(),
            Some("hard") => "hard".to_string(),
            _ => "normal".to_string(),
        }),
        turns_taken: 0,
        turn_time_ms: 0,
        cards_played: 0,
        cards_drawn: 0,
        peak_battlefield: 0,
        hand: Vec::new(),
        library,
        battlefield: Vec::new(),
        graveyard: Vec::new(),
        exile: Vec::new(),
        command,
        hand_revealed: false,
        online: true,
        undo: None,
        peeked: Vec::new(),
    });
    room.players.sort_by_key(|p| p.seat);
    room.seq += 1;
    let seq = room.seq;
    if crate::rules::enforced(&room) {
        crate::oracle::prefetch_room(app, &room);
    }
    rooms::touch(app, &mut room);
    room_send_states(app, &room);
    room_log(app, &room, seq, &format!("{} takes seat {}", username, seat + 1));
    bot_chat(app, &room, &bot_id, &username, &crate::bot::greeting_line());
}

/// {"type":"bot.remove"}: host-only, pre-start, target seat must hold a bot.
fn bot_remove(app: &Arc<App>, user: &db::User, seat: usize, tx: &Tx) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    if room.host != user.id {
        send_err(tx, "forbidden", "only the host can remove bots");
        return;
    }
    if room.started {
        send_err(tx, "already_started", "the game has already started");
        return;
    }
    let target = room.players.iter().find(|p| p.seat == seat);
    let Some(bot) = target.filter(|p| p.is_bot) else {
        send_err(tx, "not_a_bot", &format!("seat {seat} does not hold a bot"));
        return;
    };
    let bot_id = bot.user_id.clone();
    let bot_name = bot.username.clone();
    room.players.retain(|p| p.user_id != bot_id);
    room.seq += 1;
    let seq = room.seq;
    rooms::touch(app, &mut room);
    room_send_states(app, &room);
    room_log(app, &room, seq, &format!("{} removes {}", user.username, bot_name));
}

fn room_ping(app: &Arc<App>, user: &db::User, target_user_id: &str, tx: &Tx) {
    const COOLDOWN_MS: i64 = 3_000;

    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    if rref.spectating {
        send_err(tx, "forbidden", "spectators cannot ping players");
        return;
    }
    let Some(room) = app.rooms.get(&rref.room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    if !room.players.iter().any(|player| player.user_id == user.id) {
        send_err(tx, "not_seated", "you are not seated in this room");
        return;
    }
    if target_user_id == user.id {
        send_err(tx, "invalid_ping_target", "you cannot ping yourself");
        return;
    }
    let Some(target) = room.players.iter().find(|player| player.user_id == target_user_id) else {
        send_err(tx, "invalid_ping_target", "that player is not seated in this room");
        return;
    };
    if !target.online {
        send_err(tx, "player_offline", "that player is offline");
        return;
    }
    if target.conceded {
        send_err(tx, "invalid_ping_target", "that player has conceded");
        return;
    }
    let target_id = target.user_id.clone();
    let target_name = target.username.clone();
    let now = crate::now_ms();
    if let Some(last) = app.ping_at.get(&user.id) {
        if now.saturating_sub(*last) < COOLDOWN_MS {
            send_err(tx, "ping_cooldown", "wait before pinging again");
            return;
        }
    }
    app.ping_at.insert(user.id.clone(), now);
    let message = json!({
        "type": "room.ping",
        "from": {"userId": user.id, "username": user.username},
        "to": {"userId": target_id, "username": target_name},
        "ts": now,
        "roomId": room.id,
    });
    send_user(app, &user.id, &message);
    send_user(app, &target_id, &message);
}

fn room_hand_hover(app: &Arc<App>, user: &db::User, position: Option<f64>, tx: &Tx) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    if rref.spectating {
        send_err(tx, "forbidden", "spectators do not have a hand");
        return;
    }
    let Some(room) = app.rooms.get(&rref.room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    if !room.started || !room.players.iter().any(|player| player.user_id == user.id) {
        return;
    }
    let position = position.map(|value| value.clamp(0.0, 1.0));
    room_send_all(
        app,
        &room,
        &json!({
            "type": "room.hand.hover",
            "fromUserId": user.id,
            "position": position,
        }),
    );
}

/// Live table pointer relay: broadcast the sender's normalized position and the
/// card they are hovering to everyone in the room. Ephemeral - nothing is
/// stored and it never enters the game state.
fn cursor_move(
    app: &Arc<App>,
    user: &db::User,
    x: f64,
    y: f64,
    hover: Option<String>,
    mat: Option<i64>,
    tx: &Tx,
) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    if rref.spectating {
        return;
    }
    let Some(room) = app.rooms.get(&rref.room_id) else {
        return;
    };
    let Some(player) = room.players.iter().find(|p| p.user_id == user.id) else {
        return;
    };
    if !room.started {
        return;
    }
    room_send_all(
        app,
        &room,
        &json!({
            "type": "cursor",
            "fromUserId": user.id,
            "username": player.username,
            "seat": player.seat,
            "x": x.clamp(0.0, 1.0),
            "y": y.clamp(0.0, 1.0),
            "hover": hover,
            "mat": mat,
        }),
    );
}

/// Notable-pull relay: tell everyone at the table what this player just opened.
/// Modelled on `cursor_move` - a pure broadcast that never touches game state.
///
/// Whether a pull is notable is decided by `collection::is_notable`, the same
/// rule the REST ingestion and the client use; the server relays what it is
/// told rather than re-deriving it, because the set release date that rule
/// needs is not part of this message. Spectators may send it too: someone
/// cracking packs while watching a game is exactly the moment worth sharing.
#[allow(clippy::too_many_arguments)]
fn pull_notify(
    app: &Arc<App>,
    user: &db::User,
    scryfall_id: &str,
    name: &str,
    set_code: &str,
    rarity: &str,
    foil: bool,
    tx: &Tx,
) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    let Some(room) = app.rooms.get(&rref.room_id) else {
        return;
    };
    let seat = room
        .players
        .iter()
        .find(|p| p.user_id == user.id)
        .map(|p| p.seat as i64);
    room_send_all(
        app,
        &room,
        &json!({
            "type": "pull",
            "fromUserId": user.id,
            "username": user.username,
            "seat": seat,
            "scryfallId": scryfall_id,
            "name": name,
            "setCode": set_code,
            "rarity": rarity,
            "foil": foil,
            "ts": crate::now_ms(),
        }),
    );
}

fn invite_send(app: &Arc<App>, user: &db::User, to_user_id: &str, room_id: &str) {
    // Dropped silently when the target is offline or the room is gone.
    let Some(room_name) = app.rooms.get(room_id).map(|r| r.name.clone()) else {
        return;
    };
    send_user(
        app,
        to_user_id,
        &json!({
            "type": "invite",
            "from": {"userId": user.id, "username": user.username},
            "roomId": room_id,
            "roomName": room_name,
        }),
    );
}

fn game_action(app: &Arc<App>, user: &db::User, action: game::Action, tx: &Tx) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    if rref.spectating {
        send_err(tx, "forbidden", "spectators cannot act");
        return;
    }
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    let outcome = dispatch_action(app, &mut room, &user.id, action, Some(tx));
    // Enforced rooms: any gap in the oracle cache (a failed fetch, a card the
    // prefetch missed) heals on the next human action - cached ids no-op.
    if crate::rules::enforced(&room) {
        crate::oracle::prefetch_room(app, &room);
    }
    if let Err((code, message)) = outcome {
        send_err(tx, code, &message);
    }
}

/// Apply an action and fan out every consequence (seq bump, touch, room.event
/// to players/spectators, log lines, per-viewer private messages, resync).
/// The ONE pipeline for both human and bot actions. `actor_tx` is the acting
/// connection for a human; None for bots, whose private messages fall through
/// send_user (a no-op for connectionless bot ids).
pub fn dispatch_action(
    app: &App,
    room: &mut Room,
    actor_id: &str,
    action: game::Action,
    actor_tx: Option<&Tx>,
) -> Result<(), (&'static str, String)> {
    // The card the move concerns, captured before apply consumes the action;
    // its public face is read AFTER apply (where the card has landed).
    let card_iid = game::action_card_iid(&action).map(str::to_string);
    let applied = game::apply(app, room, actor_id, action)?;
    room.seq += 1;
    let seq = room.seq;
    // Record this action as a new point on the undo/redo/replay timeline.
    // Undo/redo/rewind set record=false: they moved the cursor over existing
    // history rather than extending it. Skip recording when no player is present
    // to use it - keeps abandoned rooms from churning history.
    if applied.record && room.players.iter().any(|p| p.online) {
        let card = card_iid.as_deref().and_then(|iid| room.public_card_view(iid));
        room.push_history(actor_id.to_string(), applied.log.clone(), seq, card);
    }
    rooms::touch(app, room);
    for p in &room.players {
        let payload = if p.user_id == actor_id { &applied.for_actor } else { &applied.for_others };
        send_user(
            app,
            &p.user_id,
            &json!({"type": "room.event", "seq": seq, "actor": actor_id, "action": payload, "roomId": room.id}),
        );
    }
    let spec_msg = json!({"type": "room.event", "seq": seq, "actor": actor_id, "action": applied.for_others, "roomId": room.id});
    for s in &room.spectators {
        send_user(app, &s.user_id, &spec_msg);
    }
    // An empty log line means the action is not log-worthy (e.g. repositioning
    // a card): skip it rather than broadcasting a blank entry.
    if !applied.log.is_empty() {
        room_log(app, room, seq, &applied.log);
    }
    for line in &applied.extra_logs {
        room_log(app, room, seq, line);
    }
    // Per-viewer messages (library.cards, cmd.choice): the actor's own go only
    // to the acting connection; anyone else's to all of their connections.
    // Spectators never receive these. Stamped with roomId like every other
    // room-scoped message so the client can scope them to the viewed table.
    for (uid, msg) in &applied.private {
        let mut tagged = msg.clone();
        if let Some(obj) = tagged.as_object_mut() {
            obj.insert("roomId".to_string(), json!(room.id));
        }
        if uid == actor_id {
            match actor_tx {
                Some(tx) => {
                    let _ = tx.send(tagged.to_string());
                }
                None => send_user(app, uid, &tagged),
            }
        } else {
            send_user(app, uid, &tagged);
        }
    }
    if applied.resync {
        room_send_states(app, room);
    }
    // Any action can be the one that leaves a single player standing
    // (concede is the obvious path; leave has its own call site).
    maybe_finish_match(app, room);
    // Refresh everyone's undo/redo affordance after every action.
    send_undo_state(app, room);
    send_timeline(app, room);
    Ok(())
}

/// Push each seated player their per-viewer undo/redo affordance. `canUndo`/
/// `canRedo` are gated on the owns-the-move-or-host policy and disabled once
/// the match is frozen. Spectators do not act, so they are skipped.
pub fn send_undo_state(app: &App, room: &Room) {
    let head = room.history.len();
    let cursor = room.cursor;
    for p in &room.players {
        let is_host = p.user_id == room.host;
        // Undo/redo stay available even after the match freezes: they are the
        // recovery path from an accidental match-ending move (apply() exempts
        // them from the frozen guard).
        let can_undo =
            cursor > 0 && (is_host || room.history.get(cursor).map(|s| s.actor == p.user_id).unwrap_or(false));
        let can_redo = cursor + 1 < head
            && (is_host || room.history.get(cursor + 1).map(|s| s.actor == p.user_id).unwrap_or(false));
        send_user(
            app,
            &p.user_id,
            &json!({
                "type": "undo.state",
                "roomId": room.id,
                "canUndo": can_undo,
                "canRedo": can_redo,
                "cursor": cursor,
                "head": head,
                "host": is_host,
            }),
        );
    }
}

/// Broadcast the move timeline (one entry per history snapshot: its wall-clock
/// timestamp, log label, and actor) to every viewer. Same for all - labels are
/// the public log lines - so it goes to players and spectators alike.
pub fn send_timeline(app: &App, room: &Room) {
    let entries: Vec<Value> = room
        .history
        .iter()
        .map(|s| json!({ "ts": s.ts, "label": s.label, "actor": s.actor, "card": s.card }))
        .collect();
    let msg = json!({ "type": "timeline", "roomId": room.id, "entries": entries });
    room_send_all(app, room, &msg);
}

/// Serve one historical frame to the requesting connection only (read-only
/// replay scrubbing). Never mutates the room or the shared cursor, and is
/// hidden-info filtered through state_for for that viewer at that past point.
fn replay_seek(app: &Arc<App>, user: &db::User, index: usize, tx: &Tx) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        return;
    };
    let Some(room) = app.rooms.get(&rref.room_id) else {
        return;
    };
    let head = room.history.len();
    if head == 0 {
        return;
    }
    let viewer = if rref.spectating { None } else { Some(user.id.as_str()) };
    let clamped = index.min(head - 1);
    if let Some(state) = room.replay_frame(clamped, viewer) {
        let _ = tx.send(
            json!({
                "type": "replay.frame",
                "roomId": room.id,
                "index": clamped,
                "head": head,
                "state": state,
            })
            .to_string(),
        );
    }
}

/// Ends the match when exactly one non-conceded player remains in a started
/// multiplayer game: freezes the result onto the room (reconnects keep seeing
/// it), persists it for all-time stats, and tells everyone.
pub fn maybe_finish_match(app: &App, room: &mut Room) {
    if !room.started || room.match_result.is_some() || room.started_players < 2 {
        return;
    }
    let standing: Vec<usize> = room
        .players
        .iter()
        .enumerate()
        .filter(|(_, p)| !p.conceded)
        .map(|(i, _)| i)
        .collect();
    if standing.len() != 1 {
        return;
    }
    let now = crate::now_ms();
    // Close out the running turn so the winner's clock includes it.
    game::turn_clock_credit(room, now);

    let winner = &room.players[standing[0]];
    // Mid-game leavers were snapshotted into `departed`; they lead so the
    // result reads in original seat order more often than not.
    let players: Vec<rooms::MatchResultPlayer> = room
        .departed
        .iter()
        .cloned()
        .chain(room.players.iter().map(rooms::result_player))
        .collect();
    let duration_ms = if room.started_at_ms > 0 { now - room.started_at_ms } else { 0 };
    // The substance floor: only real multiplayer games feed all-time stats
    // and unlock endorse/salt. Instant-concede farms (three turns of nothing,
    // seconds of play) and bot-only stomps stay decorative.
    let humans = players.iter().filter(|p| !p.is_bot).count();
    let ranked = humans >= 2 && room.turn_number >= 3 && (room.started_at_ms == 0 || duration_ms >= 120_000);
    let result = rooms::MatchResult {
        match_id: crate::hex_id(8),
        winner_user_id: winner.user_id.clone(),
        winner_username: winner.username.clone(),
        turns: room.turn_number,
        duration_ms,
        ended_at: now,
        ranked,
        players,
    };
    let winner_name = result.winner_username.clone();
    if ranked {
        let conn = app.db.lock().unwrap();
        db::match_result_record(&conn, &result, &room.id, &room.name, &room.format);
    }
    room.match_result = Some(result);
    room.seq += 1;
    let seq = room.seq;
    rooms::touch(app, room);
    room_send_states(app, room);
    room_log(app, room, seq, &format!("{winner_name} wins the match"));
}

// --- booster draft --------------------------------------------------------

/// Open a draft in a room that has not started yet.
///
/// The packs arrive from the HOST's client, already collated: the real sheets
/// and weights are bundled with the app (public/cache/packs), so generating
/// them here would mean shipping and refreshing a second copy of MTGJSON
/// server-side. What is enforced here is everything that actually matters -
/// who may start one, that the shape is sane, and that nobody can see another
/// drafter's pack (rooms::Room::draft_view).
#[allow(clippy::too_many_arguments)]
fn draft_start(
    app: &Arc<App>,
    user: &db::User,
    setup: rooms::DraftSetup,
    packs: Vec<Vec<rooms::DraftCard>>,
    tx: &Tx,
) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    if rref.spectating {
        send_err(tx, "forbidden", "spectators cannot start a draft");
        return;
    }
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    if room.host != user.id {
        send_err(tx, "forbidden", "only the host can start the draft");
        return;
    }
    if room.started {
        send_err(tx, "already_started", "the game has already started");
        return;
    }
    if room.draft.is_some() {
        send_err(tx, "draft_running", "this table is already drafting");
        return;
    }
    // An empty mode is an older client, which only knew how to draft.
    let mode = if setup.mode.is_empty() { "draft".to_string() } else { setup.mode.clone() };
    if mode != "draft" && mode != "sealed" {
        send_err(tx, "bad_mode", "unknown limited format");
        return;
    }
    let sealed = mode == "sealed";
    if room.players.iter().any(|p| !p.online) {
        send_err(tx, "players_offline", "every seated player must be online");
        return;
    }
    // Two is the minimum that can pass a pack to anyone. Sealed passes nothing,
    // so it is the one limited format a lone player can open - the lobby still
    // wants a second seat before the game itself can start.
    if !sealed && room.players.len() < 2 {
        send_err(tx, "need_players", "a draft needs at least two drafters");
        return;
    }
    if setup.rounds == 0 || setup.rounds > rooms::DRAFT_MAX_ROUNDS {
        send_err(tx, "bad_rounds", "unreasonable number of packs");
        return;
    }
    let wanted = setup.rounds * room.players.len();
    if packs.len() != wanted {
        send_err(tx, "bad_packs", "wrong number of packs for this table");
        return;
    }
    if packs.iter().any(|p| p.is_empty() || p.len() > rooms::DRAFT_MAX_PACK) {
        send_err(tx, "bad_packs", "a pack is empty or unreasonably large");
        return;
    }

    // Seat order follows the table, so "passing left" is the seat to your left.
    let mut seats: Vec<rooms::DraftSeat> = room
        .players
        .iter()
        .map(|p| rooms::DraftSeat {
            user_id: p.user_id.clone(),
            pack: Vec::new(),
            pool: Vec::new(),
            picked: false,
            built: false,
        })
        .collect();
    seats.sort_by_key(|s| {
        room.players.iter().find(|p| p.user_id == s.user_id).map(|p| p.seat).unwrap_or(0)
    });

    let now = crate::now_ms();
    // Clamp rather than reject: an absurd clock is a slider mistake, not an
    // attack, and a draft with no clock at all is a legitimate choice. Sealed
    // has no picks to put a clock on at all.
    let pick_seconds = if sealed || setup.pick_seconds == 0 {
        0
    } else {
        setup.pick_seconds.clamp(10, 600)
    };
    let build_seconds = if setup.build_seconds == 0 { 0 } else { setup.build_seconds.clamp(60, 3600) };
    let mut basics = setup.basics;
    basics.truncate(rooms::DRAFT_MAX_BASICS);
    let mut draft = rooms::Draft {
        set: setup.set,
        set_name: setup.set_name,
        mode,
        rounds: setup.rounds,
        phase: "picking".to_string(),
        round: 1,
        pick: 1,
        seats,
        reserve: packs,
        deadline_ms: 0,
        pick_seconds,
        build_seconds,
        lock_decks: setup.lock_decks,
        basics,
    };
    // Sealed comes out of this already in its building phase - there is
    // nothing to pick, so the pool is dealt and the build clock starts.
    draft.begin(now);
    let round_note = if sealed {
        format!("Sealed started: {} packs each from {}", draft.rounds, draft.set_name)
    } else {
        format!("Draft started: {} packs of {}", draft.rounds, draft.set_name)
    };
    room.draft = Some(draft);
    // A draft replaces whatever decks people brought: the seat plays what it
    // drafts, and a stale deck would otherwise let someone skip building.
    for p in room.players.iter_mut() {
        p.ready = false;
    }
    room.seq += 1;
    let seq = room.seq;
    rooms::touch(app, &mut room);
    room_send_states(app, &room);
    room_log(app, &room, seq, &round_note);
}

fn draft_pick(app: &Arc<App>, user: &db::User, index: usize, id: &str, tx: &Tx) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    let Some(draft) = room.draft.as_mut() else {
        send_err(tx, "no_draft", "this table is not drafting");
        return;
    };
    if draft.phase != "picking" {
        send_err(tx, "not_picking", "the picking rounds are over");
        return;
    }
    let Some(seat) = draft.seats.iter().position(|s| s.user_id == user.id) else {
        send_err(tx, "not_drafting", "you are not in this draft");
        return;
    };
    if !draft.take(seat, index, id) {
        // Stale pack, double click, or a card that is not there any more.
        send_err(tx, "bad_pick", "that card is not in your pack");
        return;
    }
    let now = crate::now_ms();
    let advanced = draft.pass_complete();
    if advanced {
        draft.advance(now);
    }
    let building = draft.phase == "building";
    let round = draft.round;
    let pick = draft.pick;
    room.seq += 1;
    let seq = room.seq;
    rooms::touch(app, &mut room);
    room_send_states(app, &room);
    if building {
        room_log(app, &room, seq, "Draft complete: build your deck from the pool");
    } else if advanced {
        room_log(app, &room, seq, &format!("Pack {round}, pick {pick}"));
    }
}

/// One seat finished building. The deck itself went through the normal
/// `room.deck.set` path, so this only records that the seat is done - and once
/// every seat is, the draft steps aside and the ordinary pre-game lobby (with
/// everyone's freshly built deck already seated) takes over.
fn draft_built(app: &Arc<App>, user: &db::User, tx: &Tx) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        send_err(tx, "not_in_room", "you are not in a room");
        return;
    };
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    let has_deck = room.players.iter().any(|p| p.user_id == user.id && p.deck_id.is_some());
    if !has_deck {
        send_err(tx, "deck_required", "save a deck before finishing");
        return;
    }
    let Some(draft) = room.draft.as_mut() else {
        send_err(tx, "no_draft", "this table is not drafting");
        return;
    };
    if draft.phase != "building" {
        send_err(tx, "not_building", "the draft is not in its building phase");
        return;
    }
    let Some(seat) = draft.seats.iter_mut().find(|s| s.user_id == user.id) else {
        send_err(tx, "not_drafting", "you are not in this draft");
        return;
    };
    if seat.built {
        return;
    }
    seat.built = true;
    let done = draft.seats.iter().all(|s| s.built);
    if done {
        draft.phase = "done".to_string();
    }
    room.seq += 1;
    let seq = room.seq;
    rooms::touch(app, &mut room);
    room_send_states(app, &room);
    if done {
        room_log(app, &room, seq, "Every deck is built - the table is ready");
    }
}

/// Called from the room sweeper: take the pick for anyone who cannot make it.
///
/// Two ways a seat stops answering, and both stall the whole table because a
/// pass only completes when every seat has picked:
///
///   the clock  they are there and thinking too long (if a clock was set)
///   absent     they closed the tab, so no clock will ever save the table
///
/// The second is why this does not simply key off `deadline_ms`: an untimed
/// draft is a legitimate choice, and it must still survive someone leaving.
pub fn draft_tick(app: &App) {
    let now = crate::now_ms();
    let mut wake: Vec<String> = Vec::new();
    for room in app.rooms.iter() {
        let Some(draft) = room.draft.as_ref() else { continue };
        if draft.phase != "picking" {
            continue;
        }
        let lapsed = draft.deadline_ms > 0 && now >= draft.deadline_ms;
        let absent = draft.seats.iter().any(|s| {
            !s.picked
                && !s.pack.is_empty()
                && !room.players.iter().any(|p| p.user_id == s.user_id && p.online)
        });
        if lapsed || absent {
            wake.push(room.id.clone());
        }
    }
    for id in wake {
        let Some(mut room) = app.rooms.get_mut(&id) else { continue };
        // Who is here, read before the draft is borrowed mutably.
        let online: Vec<String> = room
            .players
            .iter()
            .filter(|p| p.online)
            .map(|p| p.user_id.clone())
            .collect();
        let Some(draft) = room.draft.as_mut() else { continue };
        // Re-check under the write lock: a pick may have landed in between and
        // already moved the table on.
        if draft.phase != "picking" {
            continue;
        }
        let lapsed = draft.deadline_ms > 0 && now >= draft.deadline_ms;
        let mut forced = 0usize;
        for seat in 0..draft.seats.len() {
            let here = online.contains(&draft.seats[seat].user_id);
            // The clock takes a card off anyone; absence only off the absent.
            if (lapsed || !here) && draft.force_seat(seat) {
                forced += 1;
            }
        }
        if forced == 0 || !draft.pass_complete() {
            continue;
        }
        draft.advance(now);
        let building = draft.phase == "building";
        room.seq += 1;
        let seq = room.seq;
        rooms::touch(app, &mut room);
        room_send_states(app, &room);
        let note = if lapsed {
            "Pick clock expired - the first card was taken"
        } else {
            "A drafter left - their pick was taken for them"
        };
        room_log(app, &room, seq, note);
        if building {
            room_log(app, &room, seq, "Draft complete: build your deck from the pool");
        }
    }
    draft_build_tick(app, now);
}

/// The other half of the sweeper: the OPTIONAL build clock.
///
/// Picking is not the only phase that can stall - the table also waits for the
/// last deck to be saved, and someone who wanders off after their final pick
/// wedges it just as thoroughly. When the host set a build clock, anyone still
/// unbuilt when it lapses gets a deck assembled from their own pool.
fn draft_build_tick(app: &App, now: i64) {
    let mut wake: Vec<String> = Vec::new();
    for room in app.rooms.iter() {
        let Some(draft) = room.draft.as_ref() else { continue };
        if draft.phase != "building" || draft.deadline_ms == 0 || now < draft.deadline_ms {
            continue;
        }
        if draft.seats.iter().any(|s| !s.built) {
            wake.push(room.id.clone());
        }
    }
    for id in wake {
        // Three passes, and the split matters: the deck rows have to be written
        // while NO room lock is held. Everything else in this file takes the db
        // lock before the room lock, and inverting that order here would be a
        // deadlock waiting for a busy night.
        let plans: Vec<(String, String, Vec<db::DeckCard>)> = {
            let Some(room) = app.rooms.get(&id) else { continue };
            let Some(draft) = room.draft.as_ref() else { continue };
            draft
                .seats
                .iter()
                .enumerate()
                .filter(|(_, s)| !s.built)
                .map(|(seat, s)| {
                    let what = if draft.sealed() { "sealed" } else { "draft" };
                    (s.user_id.clone(), format!("{} {}", draft.set_name, what), draft.auto_deck(seat))
                })
                .filter(|(_, _, cards)| !cards.is_empty())
                .collect()
        };
        if plans.is_empty() {
            continue;
        }
        let mut saved: Vec<(String, db::DeckRow)> = Vec::new();
        for (user_id, name, cards) in plans {
            let row = db::DeckRow {
                id: crate::hex_id(8),
                user_id: user_id.clone(),
                name,
                format: "draft".to_string(),
                cards_json: serde_json::to_string(&cards).unwrap_or_else(|_| "[]".to_string()),
                updated_at: now,
                header: cards.first().map(|c| c.scryfall_id.clone()),
                game: "mtg".to_string(),
                playmat: None,
                card_back: None,
            };
            db::deck_insert(&app.db.lock().unwrap(), &row);
            saved.push((user_id, row));
        }
        let Some(mut room) = app.rooms.get_mut(&id) else { continue };
        let has_commander = rooms::format_has_commander(&room.format);
        let game = room.game.clone();
        let mut applied = 0usize;
        for (user_id, row) in saved {
            // Re-check: a deck may have landed in the moment the lock was down.
            let still_open = room
                .draft
                .as_ref()
                .is_some_and(|d| d.seats.iter().any(|s| s.user_id == user_id && !s.built));
            if !still_open {
                continue;
            }
            let (command, library) = rooms::build_zones(&row.cards(), has_commander, &game);
            if let Some(player) = room.players.iter_mut().find(|p| p.user_id == user_id) {
                player.deck_id = Some(row.id.clone());
                player.deck_name = Some(row.name.clone());
                player.deck_meta = None;
                player.command = command;
                player.library = library;
                player.hand.clear();
                player.battlefield.clear();
                player.graveyard.clear();
                player.exile.clear();
                player.ready = false;
            }
            if let Some(draft) = room.draft.as_mut() {
                if let Some(seat) = draft.seats.iter_mut().find(|s| s.user_id == user_id) {
                    seat.built = true;
                }
            }
            send_user(app, &user_id, &json!({"type": "decks.changed"}));
            applied += 1;
        }
        if applied == 0 {
            continue;
        }
        let done = room.draft.as_ref().is_some_and(|d| d.seats.iter().all(|s| s.built));
        if done {
            if let Some(draft) = room.draft.as_mut() {
                draft.phase = "done".to_string();
            }
        }
        room.seq += 1;
        let seq = room.seq;
        rooms::touch(app, &mut room);
        room_send_states(app, &room);
        room_log(app, &room, seq, "Build clock expired - a deck was built from the pool");
        if done {
            room_log(app, &room, seq, "Every deck is built - the table is ready");
        }
    }
}

/// The bundled playmat ids (client's src/app/data/playmats.ts); a player's
/// chosen mat must be one of these. Includes the solid-color token mats.
const PLAYMATS: [&str; 39] = [
    "arcane-study", "tavern", "house-felt", "plains", "island", "swamp", "mountain",
    "forest", "confluence", "marble", "boneyard", "forgefloor", "fae-glade",
    "planar-sky", "neon-grid",
    "aurora-drift", "deep-field", "felted-field", "heirloom-table", "quarry-slab",
    "back-alley", "corporate-arcology", "neon-megacity", "rain-ramen", "the-net",
    "burgundy-dotted", "navy-dotted", "slate-plus", "tan-dotted",
    "solid-blue", "solid-teal", "solid-green", "solid-amber", "solid-red",
    "solid-purple", "solid-graphite", "solid-ink", "solid-slate", "solid-surface",
];

/// A player's chosen playmat, mirrored into the room so every client can show
/// the active player's mat as the shared felt. Unknown ids are dropped.
/// Bundled ids come from the fixed list; `custom-<file>` ids must name a mat
/// that exists in our upload store AND belongs to `user_id` (files are named
/// `<user id>-<suffix>` - without the prefix check anyone could adopt a
/// tablemate's upload). A deck's stored mat goes through this too: the column
/// is user data like any other.
fn valid_playmat(app: &Arc<App>, user_id: &str, id: Option<String>) -> Option<String> {
    id.filter(|v| {
        PLAYMATS.contains(&v.as_str())
            || v.strip_prefix("custom-").is_some_and(|f| {
                crate::api::valid_mat_file(f)
                    && f.starts_with(&format!("{user_id}-"))
                    && app.mats_dir.join(f).is_file()
            })
    })
}

fn playmat_set(app: &Arc<App>, user: &db::User, id: Option<String>) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        return;
    };
    if rref.spectating {
        return;
    }
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        return;
    };
    let valid = valid_playmat(app, &user.id, id);
    if let Some(p) = room.players.iter_mut().find(|p| p.user_id == user.id) {
        if p.playmat != valid {
            p.playmat = valid;
            rooms::touch(app, &mut room);
            room_send_states(app, &room);
        }
    }
}

/// A player's custom zone-pile placement, mirrored to every viewer. Untrusted
/// input: keep only the four logical zones and clamp coordinates into the mat.
fn mat_layout_set(app: &Arc<App>, user: &db::User, mut layout: std::collections::BTreeMap<String, rooms::MatPos>) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        return;
    };
    if rref.spectating {
        return;
    }
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        return;
    };
    layout.retain(|zone, _| matches!(zone.as_str(), "library" | "graveyard" | "exile" | "command"));
    for pos in layout.values_mut() {
        pos.x = pos.x.clamp(0.0, 1.0);
        pos.y = pos.y.clamp(0.0, 1.0);
    }
    if let Some(p) = room.players.iter_mut().find(|p| p.user_id == user.id) {
        p.mat_layout = layout;
        rooms::touch(app, &mut room);
        room_send_states(app, &room);
    }
}

/// A player's chosen card back, mirrored so every viewer paints this player's
/// face-down cards with it. The id is a free-form client asset name (validated
/// client-side); we just relay it and broadcast so boards repaint.
fn card_back_set(app: &Arc<App>, user: &db::User, id: Option<String>) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        return;
    };
    if rref.spectating {
        return;
    }
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        return;
    };
    if let Some(p) = room.players.iter_mut().find(|p| p.user_id == user.id) {
        if p.card_back != id {
            p.card_back = id;
            rooms::touch(app, &mut room);
            room_send_states(app, &room);
        }
    }
}

/// Client-computed deck metrics for the matchup splash: stored verbatim (the
/// server has no card data to verify), clamped so the blob can't bloat room
/// state, and public to every viewer via state_for.
fn deck_meta_set(app: &Arc<App>, user: &db::User, meta: Option<serde_json::Value>) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        return;
    };
    if rref.spectating {
        return;
    }
    let meta = meta.and_then(sanitize_deck_meta);
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        return;
    };
    if let Some(p) = room.players.iter_mut().find(|p| p.user_id == user.id) {
        if p.deck_meta != meta {
            p.deck_meta = meta;
            rooms::touch(app, &mut room);
            room_send_states(app, &room);
        }
    }
}

/// Rebuild the metrics blob from a strict whitelist: numeric fields clamped,
/// colors a short array of 1-char strings. Everything is rebroadcast to every
/// client and rendered as React children, so a crafted payload (objects where
/// numbers belong) must never survive to the wire.
fn sanitize_deck_meta(raw: serde_json::Value) -> Option<serde_json::Value> {
    let obj = raw.as_object()?;
    let num = |key: &str, max: f64| -> Option<f64> {
        obj.get(key).and_then(|v| v.as_f64()).map(|n| (n.clamp(0.0, max) * 10.0).round() / 10.0)
    };
    let mut clean = serde_json::Map::new();
    clean.insert("size".into(), serde_json::json!(num("size", 100_000.0).unwrap_or(0.0) as u64));
    for key in ["creatures", "lands", "spells", "other", "ram"] {
        if let Some(n) = num(key, 100_000.0) {
            clean.insert(key.into(), serde_json::json!(n as u64));
        }
    }
    for key in ["avgMv", "avgCost"] {
        if let Some(n) = num(key, 99.0) {
            clean.insert(key.into(), serde_json::json!(n));
        }
    }
    if let Some(colors) = obj.get("colors").and_then(|v| v.as_array()) {
        let letters: Vec<String> = colors
            .iter()
            .filter_map(|c| c.as_str())
            .filter(|s| matches!(*s, "W" | "U" | "B" | "R" | "G" | "C"))
            .take(6)
            .map(str::to_string)
            .collect();
        clean.insert("colors".into(), serde_json::json!(letters));
    }
    Some(serde_json::Value::Object(clean))
}

/// A player's turn-automation choices (untap/draw at their own turn start),
/// mirrored onto their seat so `auto_turn_begin` honors them. Private per-player
/// state, so no broadcast — the owner's client is the source of truth and
/// re-syncs on join; persisting keeps it across reconnects.
fn auto_set(app: &Arc<App>, user: &db::User, untap: bool, draw: bool) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        return;
    };
    if rref.spectating {
        return;
    }
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        return;
    };
    if let Some(p) = room.players.iter_mut().find(|p| p.user_id == user.id) {
        if p.auto_untap != untap || p.auto_draw != draw {
            p.auto_untap = untap;
            p.auto_draw = draw;
            rooms::touch(app, &mut room);
        }
    }
}

/// Turn the rules coach on or off for one seat. Purely a preference: the coach
/// only ever adds private advice, so flipping it can never change the game.
fn coach_set(app: &Arc<App>, user: &db::User, on: bool) {
    let Some(rref) = app.user_rooms.get(&user.id).map(|r| r.clone()) else {
        return;
    };
    if rref.spectating {
        return;
    }
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        return;
    };
    if let Some(p) = room.players.iter_mut().find(|p| p.user_id == user.id) {
        if p.coach != on {
            p.coach = on;
            rooms::touch(app, &mut room);
        }
    }
}
