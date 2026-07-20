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
    #[serde(rename = "chat.send")]
    ChatSend { text: String },
    #[serde(rename = "invite.send", rename_all = "camelCase")]
    InviteSend { to_user_id: String, room_id: String },
    #[serde(rename = "game.action")]
    GameAction { action: game::Action },
    #[serde(rename = "playmat.set")]
    PlaymatSet { id: Option<String> },
    /// My chosen card back, mirrored so every viewer paints my face-down cards
    /// with it (their board wears their back, not mine).
    #[serde(rename = "cardback.set")]
    CardBackSet { id: Option<String> },
    /// Per-player turn automation: untap/draw at the start of my turn (off by
    /// default; synced from the client's settings).
    #[serde(rename = "auto.set")]
    AutoSet { untap: bool, draw: bool },
    // Replay scrubbing: viewer-local and read-only. These NEVER enter apply()
    // and never move the shared cursor - they only materialize a past frame
    // for the requesting connection.
    #[serde(rename = "replay.seek")]
    ReplaySeek { index: usize },
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
                    rooms::touch(&app, &mut room);
                }
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
        ClientMsg::ChatSend { text } => chat_send(app, user, &text, tx),
        ClientMsg::InviteSend { to_user_id, room_id } => invite_send(app, user, &to_user_id, &room_id),
        ClientMsg::GameAction { action } => game_action(app, user, action, tx),
        ClientMsg::PlaymatSet { id } => playmat_set(app, user, id),
        ClientMsg::CardBackSet { id } => card_back_set(app, user, id),
        ClientMsg::AutoSet { untap, draw } => auto_set(app, user, untap, draw),
        ClientMsg::ReplaySeek { index } => replay_seek(app, user, index, tx),
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
    let is_commander_room = room.format == "commander";
    let starting_life = if room.game == "cyberpunk" {
        0
    } else if is_commander_room {
        40
    } else {
        20
    };
    // Snapshot the deck's name now: match results must survive a later
    // rename or delete of the deck row.
    let deck_name = deck.as_ref().map(|d| d.name.clone());
    let (command, library) = deck
        .map(|d| rooms::build_zones(&d.cards(), is_commander_room, &room.game))
        .unwrap_or_default();
    let gig_dice = rooms::new_gig_dice(&room.game);
    room.players.push(rooms::Player {
        user_id: user.id.clone(),
        username: user.username.clone(),
        seat,
        life: starting_life,
        poison: 0,
        cmd_damage: Default::default(),
        cmd_damage_by_commander: Default::default(),
        commander_tax: Default::default(),
        mulligan: None,
        playmat: None,
        card_back: None,
        auto_untap: false,
        auto_draw: false,
        gig_dice,
        deck_id: deck_id.clone(),
        deck_name,
        conceded: false,
        turns_taken: 0,
        turn_time_ms: 0,
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
        if rref.spectating {
            room.spectators.retain(|s| s.user_id != user.id);
        } else if room.persistent {
            // A persistent table is a SAVED table: leaving is "step away", not
            // "abandon". Keep the seat and board (so it stays in your saved
            // tables and you can resume), just mark the player offline.
            if let Some(p) = room.players.iter_mut().find(|p| p.user_id == user.id) {
                p.online = false;
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
                // Hand the lobby to whoever remains.
                if let Some(next) = room.players.first() {
                    room.host = next.user_id.clone();
                }
            }
            // If it was the leaver's turn, advance so the table doesn't stall
            // on an empty seat (also what lets an all-bot game keep running).
            if was_active && !room.players.is_empty() {
                // Locked combats cancel outright; un-locked ones stash the
                // legacy settle record (game::clear_combat decides).
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
    if rref.spectating {
        send_err(tx, "forbidden", "spectators cannot start the game");
        return;
    }
    let Some(mut room) = app.rooms.get_mut(&rref.room_id) else {
        send_err(tx, "room_not_found", "no such room");
        return;
    };
    if room.host != user.id {
        send_err(tx, "forbidden", "only the host can start the game");
        return;
    }
    if room.started {
        send_err(tx, "already_started", "the game has already started");
        return;
    }
    room.started = true;
    let deal = crate::game::opening_hand(&room.game);
    for p in room.players.iter_mut() {
        let n = deal.min(p.library.len());
        let drawn: Vec<rooms::Card> = p.library.drain(0..n).collect();
        p.hand.extend(drawn);
        // Every seat starts in the London-mulligan decision (freeform: no
        // other action is gated on it).
        p.mulligan = Some(rooms::Mull { state: "deciding".to_string(), taken: 0 });
    }
    let starting = room.players.iter().map(|p| p.seat).min().unwrap_or(0);
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
            .map(|p| serde_json::json!({ "username": p.username, "isBot": false }))
            .collect::<Vec<_>>(),
    )
    .unwrap_or_else(|_| "[]".to_string());
    let now = crate::now_ms();
    {
        let conn = app.db.lock().unwrap();
        for p in room.players.iter() {
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

    rooms::touch(app, &mut room);
    room_send_states(app, &room);
    room_log(app, &room, seq, &format!("Game started: opening hands of {deal} dealt; keep or mulligan"));
    send_undo_state(app, &room);
    send_timeline(app, &room);
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
    if let Err((code, message)) = dispatch_action(app, &mut room, &user.id, action, Some(tx)) {
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
    let applied = game::apply(room, actor_id, action)?;
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

/// The bundled playmat ids (client's src/app/data/playmats.ts); a player's
/// chosen mat must be one of these.
const PLAYMATS: [&str; 25] = [
    "arcane-study", "tavern", "house-felt", "plains", "island", "swamp", "mountain",
    "forest", "confluence", "marble", "boneyard", "forgefloor", "fae-glade",
    "planar-sky", "neon-grid",
    "aurora-drift", "deep-field", "felted-field", "heirloom-table", "quarry-slab",
    "back-alley", "corporate-arcology", "neon-megacity", "rain-ramen", "the-net",
];

/// A player's chosen playmat, mirrored into the room so every client can show
/// the active player's mat as the shared felt. Unknown ids are dropped.
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
    let valid = id.filter(|v| PLAYMATS.contains(&v.as_str()));
    if let Some(p) = room.players.iter_mut().find(|p| p.user_id == user.id) {
        if p.playmat != valid {
            p.playmat = valid;
            rooms::touch(app, &mut room);
            room_send_states(app, &room);
        }
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
