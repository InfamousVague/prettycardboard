use crate::rooms::{self, Room};
use crate::{db, hex_id, iso8601, now_ms, ws, App};
use axum::extract::{Path, Query, Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

fn err(status: StatusCode, code: &str, message: &str) -> Response {
    (status, Json(json!({"code": code, "message": message}))).into_response()
}

pub async fn auth_mw(State(app): State<Arc<App>>, mut req: Request, next: Next) -> Response {
    let token = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::to_string);
    let user = token.and_then(|t| db::user_by_token(&app.db.lock().unwrap(), &t));
    match user {
        Some(user) => {
            req.extensions_mut().insert(user);
            next.run(req).await
        }
        None => err(StatusCode::UNAUTHORIZED, "unauthorized", "missing or invalid bearer token"),
    }
}

// --- identity ---

#[derive(Deserialize)]
pub struct RegisterBody {
    username: String,
    password: String,
}

pub async fn register(State(app): State<Arc<App>>, Json(body): Json<RegisterBody>) -> Response {
    let username = body.username.trim();
    let valid = (3..=24).contains(&username.len())
        && username.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if !valid {
        return err(
            StatusCode::BAD_REQUEST,
            "invalid_username",
            "username must be 3-24 characters of letters, digits, or underscore",
        );
    }
    if !(6..=128).contains(&body.password.len()) {
        return err(
            StatusCode::BAD_REQUEST,
            "invalid_password",
            "password must be at least 6 characters",
        );
    }
    // Hashing is CPU-bound; keep it off the async worker.
    let password = body.password.clone();
    let hash = tokio::task::spawn_blocking(move || {
        use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
        let salt = SaltString::generate(&mut OsRng);
        argon2::Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map(|h| h.to_string())
    })
    .await
    .ok()
    .and_then(Result::ok);
    let Some(hash) = hash else {
        return err(StatusCode::INTERNAL_SERVER_ERROR, "hash_error", "could not hash password");
    };
    let id = hex_id(8);
    let token = hex_id(24);
    let result = app.db.lock().unwrap().execute(
        "INSERT INTO users(id, username, token, created_at, password_hash) VALUES(?,?,?,?,?)",
        rusqlite::params![id, username, token, now_ms(), hash],
    );
    match result {
        Ok(_) => (
            StatusCode::CREATED,
            Json(json!({"userId": id, "username": username, "token": token})),
        )
            .into_response(),
        Err(rusqlite::Error::SqliteFailure(e, _))
            if e.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            err(StatusCode::CONFLICT, "username_taken", "that username is taken")
        }
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, "db_error", &e.to_string()),
    }
}

#[derive(Deserialize)]
pub struct LoginBody {
    username: String,
    password: String,
}

pub async fn login(State(app): State<Arc<App>>, Json(body): Json<LoginBody>) -> Response {
    let credentials = db::user_credentials(&app.db.lock().unwrap(), body.username.trim());
    let Some((id, username, token, hash_opt)) = credentials else {
        return err(StatusCode::UNAUTHORIZED, "bad_credentials", "wrong username or password");
    };
    let Some(stored_hash) = hash_opt else {
        // A pre-password account: the first login claims it, adopting this
        // password (the "temporary identity, claimable later" promise).
        if !(6..=128).contains(&body.password.len()) {
            return err(
                StatusCode::BAD_REQUEST,
                "invalid_password",
                "password must be at least 6 characters",
            );
        }
        let password = body.password.clone();
        let hash = tokio::task::spawn_blocking(move || {
            use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
            let salt = SaltString::generate(&mut OsRng);
            argon2::Argon2::default()
                .hash_password(password.as_bytes(), &salt)
                .map(|h| h.to_string())
        })
        .await
        .ok()
        .and_then(Result::ok);
        let Some(hash) = hash else {
            return err(StatusCode::INTERNAL_SERVER_ERROR, "hash_error", "could not hash password");
        };
        let updated = app.db.lock().unwrap().execute(
            "UPDATE users SET password_hash = ? WHERE id = ? AND password_hash IS NULL",
            rusqlite::params![hash, id],
        );
        return match updated {
            Ok(1) => Json(json!({"userId": id, "username": username, "token": token})).into_response(),
            // Raced by another claim: fall through to a plain retry-able error.
            _ => err(StatusCode::UNAUTHORIZED, "bad_credentials", "wrong username or password"),
        };
    };
    let password = body.password.clone();
    let verified = tokio::task::spawn_blocking(move || {
        use argon2::password_hash::{PasswordHash, PasswordVerifier};
        PasswordHash::new(&stored_hash)
            .map(|parsed| {
                argon2::Argon2::default()
                    .verify_password(password.as_bytes(), &parsed)
                    .is_ok()
            })
            .unwrap_or(false)
    })
    .await
    .unwrap_or(false);
    if !verified {
        return err(StatusCode::UNAUTHORIZED, "bad_credentials", "wrong username or password");
    }
    Json(json!({"userId": id, "username": username, "token": token})).into_response()
}

pub async fn me(Extension(user): Extension<db::User>) -> Response {
    Json(json!({
        "userId": user.id,
        "username": user.username,
        "createdAt": iso8601(user.created_at),
    }))
    .into_response()
}

#[derive(Deserialize)]
pub struct SearchQuery {
    #[serde(default)]
    q: String,
}

pub async fn search_users(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    Query(query): Query<SearchQuery>,
) -> Response {
    let q = query.q.trim();
    if q.is_empty() {
        return Json(json!([])).into_response();
    }
    let hits = db::search_users(&app.db.lock().unwrap(), q, &user.id);
    let out: Vec<Value> = hits
        .into_iter()
        .map(|(id, username)| {
            let online = app.is_online(&id);
            json!({"userId": id, "username": username, "online": online})
        })
        .collect();
    Json(out).into_response()
}

// --- friends ---

pub async fn friends(State(app): State<Arc<App>>, Extension(user): Extension<db::User>) -> Response {
    let (friends, incoming, outgoing) = {
        let conn = app.db.lock().unwrap();
        (
            db::friends_of(&conn, &user.id),
            db::incoming_requests(&conn, &user.id),
            db::outgoing_requests(&conn, &user.id),
        )
    };
    let friends: Vec<Value> = friends
        .into_iter()
        .map(|(id, username)| {
            let mut f = json!({"userId": id, "username": username, "online": app.is_online(&id)});
            if let Some(room_id) = app.seated_room(&id) {
                f["roomId"] = json!(room_id);
            }
            f
        })
        .collect();
    let incoming: Vec<Value> = incoming
        .into_iter()
        .map(|(id, uid, username)| json!({"id": id, "from": {"userId": uid, "username": username}}))
        .collect();
    let outgoing: Vec<Value> = outgoing
        .into_iter()
        .map(|(id, uid, username)| json!({"id": id, "to": {"userId": uid, "username": username}}))
        .collect();
    Json(json!({"friends": friends, "incoming": incoming, "outgoing": outgoing})).into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendRequestBody {
    to_user_id: String,
}

pub async fn friend_request(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    Json(body): Json<FriendRequestBody>,
) -> Response {
    if body.to_user_id == user.id {
        return err(StatusCode::BAD_REQUEST, "self_request", "cannot friend yourself");
    }
    let id = hex_id(8);
    {
        let conn = app.db.lock().unwrap();
        if db::user_by_id(&conn, &body.to_user_id).is_none() {
            return err(StatusCode::NOT_FOUND, "user_not_found", "no such user");
        }
        if db::are_friends(&conn, &user.id, &body.to_user_id) {
            return err(StatusCode::CONFLICT, "already_friends", "you are already friends");
        }
        if db::request_pending(&conn, &user.id, &body.to_user_id) {
            return err(StatusCode::CONFLICT, "request_pending", "a request is already pending");
        }
        db::insert_request(&conn, &id, &user.id, &body.to_user_id, now_ms());
    }
    // The recipient hears about it immediately, wherever they are in the app.
    ws::send_user(
        &app,
        &body.to_user_id,
        &json!({
            "type": "friend.request",
            "id": id,
            "from": {"userId": user.id, "username": user.username},
        }),
    );
    (StatusCode::CREATED, Json(json!({"id": id}))).into_response()
}

pub async fn friend_accept(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    Path(id): Path<String>,
) -> Response {
    let from_id = {
        let conn = app.db.lock().unwrap();
        let Some((from_id, to_id)) = db::get_request(&conn, &id) else {
            return err(StatusCode::NOT_FOUND, "not_found", "no such friend request");
        };
        if to_id != user.id {
            return err(StatusCode::FORBIDDEN, "forbidden", "not your friend request");
        }
        db::insert_friendship(&conn, &from_id, &to_id);
        db::delete_request(&conn, &id);
        from_id
    };
    // Both sides learn each other's live presence immediately, and the
    // original requester hears that the request was accepted.
    ws::presence_update(&app, &user.id);
    ws::presence_update(&app, &from_id);
    ws::send_user(
        &app,
        &from_id,
        &json!({
            "type": "friend.accepted",
            "by": {"userId": user.id, "username": user.username},
        }),
    );
    StatusCode::NO_CONTENT.into_response()
}

pub async fn friend_decline(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    Path(id): Path<String>,
) -> Response {
    let conn = app.db.lock().unwrap();
    let Some((_, to_id)) = db::get_request(&conn, &id) else {
        return err(StatusCode::NOT_FOUND, "not_found", "no such friend request");
    };
    if to_id != user.id {
        return err(StatusCode::FORBIDDEN, "forbidden", "not your friend request");
    }
    db::delete_request(&conn, &id);
    StatusCode::NO_CONTENT.into_response()
}

pub async fn friend_remove(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    Path(user_id): Path<String>,
) -> Response {
    db::delete_friendship(&app.db.lock().unwrap(), &user.id, &user_id);
    StatusCode::NO_CONTENT.into_response()
}

// --- decks ---

fn deck_summary(row: &db::DeckRow) -> Value {
    let cards = row.cards();
    let commander = cards.iter().find(|c| c.board == "commander");
    // The cover card id: a customized header wins, else the anchor (commander /
    // Legend), else the first card. MTG resolves it to a Scryfall scan here;
    // Cyberpunk art is resolved client-side from the bundled catalog, so we send
    // the id + game and leave coverImageUrl null.
    let cover_id = row
        .header
        .clone()
        .or_else(|| commander.or_else(|| cards.first()).map(|c| c.scryfall_id.clone()));
    let cover = if row.game == "cyberpunk" {
        None
    } else {
        cover_id.as_deref().map(rooms::scryfall_image_url)
    };
    let count: u32 = cards.iter().map(|c| c.quantity).sum();
    json!({
        "id": row.id,
        "name": row.name,
        "format": row.format,
        "game": row.game,
        "commander": commander.map(|c| c.name.clone()),
        "cardCount": count,
        "coverImageUrl": cover,
        "coverCardId": cover_id,
        // The seated client needs this to know whether to push its own global
        // mat or leave the deck's alone.
        "playmat": row.playmat,
        "updatedAt": iso8601(row.updated_at),
    })
}

pub async fn decks_list(State(app): State<Arc<App>>, Extension(user): Extension<db::User>) -> Response {
    let rows = db::decks_for(&app.db.lock().unwrap(), &user.id);
    let out: Vec<Value> = rows.iter().map(deck_summary).collect();
    Json(out).into_response()
}

#[derive(Deserialize)]
pub struct DeckBody {
    name: String,
    format: String,
    #[serde(default)]
    cards: Vec<db::DeckCard>,
    /// Scryfall id of the chosen header/cover card, if customized.
    #[serde(default)]
    header: Option<String>,
    /// "mtg" (default) or "cyberpunk": which card game this deck is for.
    #[serde(default)]
    game: Option<String>,
    /// The playmat this deck brings to the table; null/absent = the player's
    /// global mat preference.
    #[serde(default)]
    playmat: Option<String>,
}

pub async fn deck_create(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    Json(body): Json<DeckBody>,
) -> Response {
    let name = body.name.trim();
    if name.is_empty() {
        return err(StatusCode::BAD_REQUEST, "invalid_name", "deck name is required");
    }
    let row = db::DeckRow {
        id: hex_id(8),
        user_id: user.id,
        name: name.to_string(),
        format: body.format,
        cards_json: serde_json::to_string(&body.cards).unwrap(),
        updated_at: now_ms(),
        header: body.header,
        game: body.game.unwrap_or_else(|| "mtg".to_string()),
        playmat: body.playmat,
    };
    db::deck_insert(&app.db.lock().unwrap(), &row);
    // Multi-device sync: every connection (originator included) refreshes.
    ws::send_user(&app, &row.user_id, &json!({"type": "decks.changed"}));
    (StatusCode::CREATED, Json(json!({"id": row.id}))).into_response()
}

pub async fn deck_get(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    Path(id): Path<String>,
) -> Response {
    let Some(row) = db::deck_get(&app.db.lock().unwrap(), &id) else {
        return err(StatusCode::NOT_FOUND, "not_found", "no such deck");
    };
    if row.user_id != user.id {
        return err(StatusCode::NOT_FOUND, "not_found", "no such deck");
    }
    Json(json!({
        "id": row.id,
        "name": row.name,
        "format": row.format,
        "game": row.game,
        "cards": row.cards(),
        "header": row.header,
        "playmat": row.playmat,
    }))
    .into_response()
}

pub async fn deck_update(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    Path(id): Path<String>,
    Json(body): Json<DeckBody>,
) -> Response {
    let name = body.name.trim();
    if name.is_empty() {
        return err(StatusCode::BAD_REQUEST, "invalid_name", "deck name is required");
    }
    let updated = {
        let conn = app.db.lock().unwrap();
        match db::deck_get(&conn, &id) {
            Some(row) if row.user_id == user.id => {
                db::deck_update(
                    &conn,
                    &id,
                    name,
                    &body.format,
                    &serde_json::to_string(&body.cards).unwrap(),
                    body.header.as_deref(),
                    body.playmat.as_deref(),
                    now_ms(),
                );
                true
            }
            _ => false,
        }
    };
    if !updated {
        return err(StatusCode::NOT_FOUND, "not_found", "no such deck");
    }
    ws::send_user(&app, &user.id, &json!({"type": "decks.changed"}));
    Json(json!({"id": id})).into_response()
}

pub async fn deck_delete(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    Path(id): Path<String>,
) -> Response {
    let deleted = {
        let conn = app.db.lock().unwrap();
        match db::deck_get(&conn, &id) {
            Some(row) if row.user_id == user.id => {
                db::deck_delete(&conn, &id);
                true
            }
            _ => false,
        }
    };
    if !deleted {
        return err(StatusCode::NOT_FOUND, "not_found", "no such deck");
    }
    ws::send_user(&app, &user.id, &json!({"type": "decks.changed"}));
    StatusCode::NO_CONTENT.into_response()
}

// --- deck import proxy ---

/// Moxfield's deck API sits behind Cloudflare and rejects browser requests, so
/// the client cannot read it directly. This proxies the fetch server-side and
/// returns Moxfield's JSON verbatim; the client parses it (the per-card
/// scryfall_id is the exact printing the deck author chose, so alternate art
/// like Secret Lair drops is preserved).
pub async fn import_moxfield(Path(deck_id): Path<String>) -> Response {
    // Only allow the id shape Moxfield uses, so this can never be pointed at
    // an arbitrary host (also makes the curl args injection-proof).
    if deck_id.is_empty()
        || deck_id.len() > 64
        || !deck_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return err(StatusCode::BAD_REQUEST, "bad_ref", "not a Moxfield deck id");
    }
    // Moxfield fronts its API with Cloudflare bot management, which fingerprints
    // the TLS handshake. Rust HTTP clients get flagged; the system curl clears
    // it. Shell out to curl (args are a fixed vector, never a shell string).
    let url = format!("https://api2.moxfield.com/v3/decks/all/{deck_id}");
    let output = tokio::process::Command::new("curl")
        .arg("-s")
        .arg("-m")
        .arg("15")
        .arg("-H")
        .arg("user-agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
        .arg("-H")
        .arg("referer: https://www.moxfield.com/")
        .arg("-H")
        .arg("accept: application/json")
        .arg(&url)
        .output()
        .await;
    let body = match output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).into_owned(),
        _ => return err(StatusCode::BAD_GATEWAY, "moxfield_unreachable", "could not reach Moxfield"),
    };
    let trimmed = body.trim_start();
    if !trimmed.starts_with('{') {
        // A Cloudflare challenge page or an error - not deck JSON.
        return err(StatusCode::BAD_GATEWAY, "moxfield_blocked", "Moxfield did not return deck data");
    }
    if trimmed.contains("\"code\":\"NotFound\"") {
        return err(StatusCode::NOT_FOUND, "moxfield_not_found", "no such Moxfield deck");
    }
    (StatusCode::OK, [(header::CONTENT_TYPE, "application/json")], body).into_response()
}

// --- rooms (lobby handshake) ---

#[derive(Deserialize)]
pub struct RoomBody {
    name: String,
    seats: usize,
    /// Persistent rooms are long-lived lobbies (30-day expiry instead of 24h).
    #[serde(default)]
    persistent: bool,
    /// "commander" (default) or "standard": sets starting life (40/20),
    /// first-draw-skip, and whether command-zone machinery is active.
    #[serde(default)]
    format: Option<String>,
    /// "mtg" (default) or "cyberpunk": which card game this table plays.
    #[serde(default)]
    game: Option<String>,
}

pub async fn room_create(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    Json(body): Json<RoomBody>,
) -> Response {
    if !(2..=6).contains(&body.seats) {
        return err(StatusCode::BAD_REQUEST, "invalid_seats", "seats must be 2-6");
    }
    let game = body.game.unwrap_or_else(|| "mtg".to_string());
    if game != "mtg" && game != "cyberpunk" {
        return err(StatusCode::BAD_REQUEST, "invalid_game", "game must be mtg or cyberpunk");
    }
    // Cyberpunk has no commander/standard split; force a plain "standard" table.
    let format = if game == "cyberpunk" {
        "standard".to_string()
    } else {
        body.format.unwrap_or_else(|| "commander".to_string())
    };
    if !crate::rooms::MTG_FORMATS.contains(&format.as_str()) {
        return err(
            StatusCode::BAD_REQUEST,
            "invalid_format",
            "unknown format preset",
        );
    }
    let name = body.name.trim();
    let name = if name.is_empty() {
        format!("{}'s table", user.username)
    } else {
        name.to_string()
    };
    let room_id = hex_id(8);
    let code = rooms::new_room_code(&app);
    let now = now_ms();
    let room = Room {
        id: room_id.clone(),
        name,
        code: code.clone(),
        seats: body.seats,
        host: user.id,
        persistent: body.persistent,
        started: false,
        seq: 0,
        created_at: now,
        updated_at: now,
        format,
        game,
        settings: Default::default(),
        turn_number: 1,
        active_seat: 0,
        phase: "main1".to_string(),
        auto_turn: true,
        starting_seat: 0,
        stack: Vec::new(),
        combat: None,
        markers: Default::default(),
        pending_cmd: Vec::new(),
        turn_started_ms: 0,
        turn_last_interaction_ms: 0,
        started_at_ms: 0,
        started_players: 0,
        match_result: None,
        departed: Vec::new(),
        first_turn_begun: false,
        players: Vec::new(),
        spectators: Vec::new(),
        history: Vec::new(),
        cursor: 0,
        hist_next_hid: 0,
        hist_saved_hi: None,
        hist_removed: Vec::new(),
        hist_dirty: false,
    };
    // Stored immediately so the room survives a restart even before the
    // first write-behind flush.
    db::room_save(&app.db.lock().unwrap(), &rooms::room_row(&room));
    app.codes.insert(code.clone(), room_id.clone());
    app.rooms.insert(room_id.clone(), room);
    (StatusCode::CREATED, Json(json!({"roomId": room_id, "code": code}))).into_response()
}

/// GET /api/rooms/mine: every room where the caller occupies a seat, newest
/// activity first. The in-memory map is complete after boot, so no DB read.
pub async fn rooms_mine(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
) -> Response {
    let mut mine: Vec<(i64, Value)> = Vec::new();
    for room in app.rooms.iter() {
        if !room.players.iter().any(|p| p.user_id == user.id) {
            continue;
        }
        mine.push((
            room.updated_at,
            json!({
                "roomId": room.id,
                "code": room.code,
                "name": room.name,
                "seats": room.seats,
                "persistent": room.persistent,
                "started": room.started,
                "game": room.game,
                "updatedAt": iso8601(room.updated_at),
                "players": room.players
                    .iter()
                    .map(|p| json!({
                        "userId": p.user_id,
                        "username": p.username,
                        "online": p.online,
                    }))
                    .collect::<Vec<_>>(),
            }),
        ));
    }
    mine.sort_by(|a, b| b.0.cmp(&a.0));
    Json(mine.into_iter().map(|(_, v)| v).collect::<Vec<_>>()).into_response()
}

/// GET /api/matches: the caller's recent games, newest first.
pub async fn matches(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
) -> Response {
    let rows = db::matches_for(&app.db.lock().unwrap(), &user.id);
    Json(rows).into_response()
}

/// GET /api/me/stats: the caller's all-time aggregates (wins/losses/win rate,
/// endorsements, avg turn), for the Home dashboard. Reuses the same aggregate
/// queries the post-match stats screen uses.
pub async fn my_stats(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
) -> Response {
    let conn = app.db.lock().unwrap();
    let (wins, losses) = db::user_match_counts(&conn, &user.id);
    let endorsements = db::user_endorsement_count(&conn, &user.id);
    let avg_turn_ms = db::user_avg_turn_ms(&conn, &user.id);
    Json(json!({
        "wins": wins,
        "losses": losses,
        "played": wins + losses,
        "endorsements": endorsements,
        "avgTurnMs": avg_turn_ms,
    }))
    .into_response()
}

/// GET /api/users/{id}/stats: any player's all-time aggregates - the matchup
/// splash shows every seat's record. Same queries as /api/me/stats; unknown
/// ids just come back all zeros.
pub async fn user_stats(State(app): State<Arc<App>>, Path(user_id): Path<String>) -> Response {
    let conn = app.db.lock().unwrap();
    let (wins, losses) = db::user_match_counts(&conn, &user_id);
    let endorsements = db::user_endorsement_count(&conn, &user_id);
    let avg_turn_ms = db::user_avg_turn_ms(&conn, &user_id);
    Json(json!({
        "wins": wins,
        "losses": losses,
        "played": wins + losses,
        "endorsements": endorsements,
        "avgTurnMs": avg_turn_ms,
    }))
    .into_response()
}

/// GET /api/decks/{id}/stats: a deck's all-time record + saltiness (how salty
/// opponents rated it, a 1-5 average; 0 when unrated). Public read.
pub async fn deck_stats(State(app): State<Arc<App>>, Path(deck_id): Path<String>) -> Response {
    let conn = app.db.lock().unwrap();
    let (wins, losses) = db::deck_match_counts(&conn, &deck_id);
    let (salt_x100, salt_count) = db::deck_salt(&conn, &deck_id);
    Json(json!({
        "wins": wins,
        "losses": losses,
        "salt": salt_x100 as f64 / 100.0,
        "saltCount": salt_count,
    }))
    .into_response()
}

/// DELETE /api/rooms/{id}: host only. Ends the table for everyone; seated
/// users' sockets get {type:"room.closed", roomId}.
pub async fn room_delete(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    Path(id): Path<String>,
) -> Response {
    let host = app.rooms.get(&id).map(|r| r.host.clone());
    let Some(host) = host else {
        return err(StatusCode::NOT_FOUND, "not_found", "no such room");
    };
    if host != user.id {
        return err(StatusCode::FORBIDDEN, "forbidden", "only the host can end the table");
    }
    rooms::delete_room(&app, &id);
    StatusCode::NO_CONTENT.into_response()
}

pub async fn room_get(State(app): State<Arc<App>>, Path(code): Path<String>) -> Response {
    let code = code.to_ascii_uppercase();
    let room_id = app.codes.get(&code).map(|r| r.clone());
    let Some(room_id) = room_id else {
        return err(StatusCode::NOT_FOUND, "not_found", "no such room");
    };
    let Some(room) = app.rooms.get(&room_id) else {
        return err(StatusCode::NOT_FOUND, "not_found", "no such room");
    };
    Json(json!({
        "roomId": room.id,
        "name": room.name,
        "seats": room.seats,
        "format": room.format,
        "players": room.players
            .iter()
            .map(|p| json!({"userId": p.user_id, "username": p.username}))
            .collect::<Vec<_>>(),
        "started": room.started,
    }))
    .into_response()
}

// --- post-match: endorsements, salt ratings, aggregate stats ---

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndorseBody {
    to_user_id: String,
}

/// POST /api/matches/{id}/endorse: one endorsement per (match, rater, target);
/// both must have played in the match. Repeat calls are no-ops.
pub async fn match_endorse(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    Path(match_id): Path<String>,
    Json(body): Json<EndorseBody>,
) -> Response {
    if body.to_user_id == user.id {
        return err(StatusCode::BAD_REQUEST, "self_endorse", "you cannot endorse yourself");
    }
    let conn = app.db.lock().unwrap();
    if !db::match_has_player(&conn, &match_id, &user.id) {
        return err(StatusCode::FORBIDDEN, "not_in_match", "you did not play in this match");
    }
    match db::match_player_is_bot(&conn, &match_id, &body.to_user_id) {
        None => {
            return err(StatusCode::NOT_FOUND, "player_not_in_match", "that player was not in this match");
        }
        Some(true) => {
            return err(StatusCode::BAD_REQUEST, "bot_endorse", "bots cannot be endorsed");
        }
        Some(false) => {}
    }
    db::endorse_insert(&conn, &match_id, &user.id, &body.to_user_id, now_ms());
    StatusCode::NO_CONTENT.into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaltBody {
    deck_id: String,
    salt: i64,
}

/// POST /api/matches/{id}/salt: rate another player's deck 1-5; re-rating the
/// same deck in the same match replaces the earlier value.
pub async fn match_salt(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    Path(match_id): Path<String>,
    Json(body): Json<SaltBody>,
) -> Response {
    if !(1..=5).contains(&body.salt) {
        return err(StatusCode::BAD_REQUEST, "bad_salt", "salt must be 1-5");
    }
    let conn = app.db.lock().unwrap();
    if !db::match_has_player(&conn, &match_id, &user.id) {
        return err(StatusCode::FORBIDDEN, "not_in_match", "you did not play in this match");
    }
    let Some(owner) = db::match_deck_owner(&conn, &match_id, &body.deck_id) else {
        return err(StatusCode::NOT_FOUND, "deck_not_in_match", "that deck was not in this match");
    };
    if owner == user.id {
        return err(StatusCode::BAD_REQUEST, "self_salt", "you cannot salt-rate your own deck");
    }
    db::salt_upsert(&conn, &match_id, &user.id, &body.deck_id, &owner, body.salt, now_ms());
    StatusCode::NO_CONTENT.into_response()
}

/// GET /api/matches/{id}/stats: per-participant all-time aggregates for the
/// post-match screen, plus the caller's own submissions for that match.
pub async fn match_stats(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    Path(match_id): Path<String>,
) -> Response {
    let conn = app.db.lock().unwrap();
    let rows = db::match_players_rows(&conn, &match_id);
    if rows.is_empty() {
        return err(StatusCode::NOT_FOUND, "not_found", "no such match");
    }
    let players: Vec<Value> = rows
        .iter()
        .map(|p| {
            let (wins, losses) = db::user_match_counts(&conn, &p.user_id);
            let deck = p.deck_id.as_ref().map(|deck_id| {
                let (dw, dl) = db::deck_match_counts(&conn, deck_id);
                let (salt_x100, salt_count) = db::deck_salt(&conn, deck_id);
                let (avg_cards_per_turn, avg_cards_drawn, avg_peak_battlefield) =
                    db::deck_gameplay_stats(&conn, deck_id);
                json!({
                    "wins": dw,
                    "losses": dl,
                    "salt": salt_x100 as f64 / 100.0,
                    "saltCount": salt_count,
                    "avgCardsPerTurn": avg_cards_per_turn,
                    "avgCardsDrawn": avg_cards_drawn,
                    "avgPeakBattlefield": avg_peak_battlefield,
                })
            });
            json!({
                "userId": p.user_id,
                "username": p.username,
                "seat": p.seat,
                "isBot": p.is_bot,
                "deckId": p.deck_id,
                "deckName": p.deck_name,
                "won": p.won,
                "conceded": p.conceded,
                "turnsTaken": p.turns_taken,
                "avgTurnMs": p.avg_turn_ms,
                "cardsPlayed": p.cards_played,
                "cardsDrawn": p.cards_drawn,
                "peakBattlefield": p.peak_battlefield,
                "wins": wins,
                "losses": losses,
                "endorsements": db::user_endorsement_count(&conn, &p.user_id),
                "allTimeAvgTurnMs": db::user_avg_turn_ms(&conn, &p.user_id),
                "deck": deck,
                "myEndorsed": db::endorsed_by(&conn, &match_id, &user.id, &p.user_id),
                "mySalt": p.deck_id.as_ref().and_then(|d| db::salt_by(&conn, &match_id, &user.id, d)),
            })
        })
        .collect();
    Json(json!({ "players": players })).into_response()
}

// --- custom playmats -------------------------------------------------------

/// Upload cap for a custom playmat image (also the route's body limit).
pub const MAT_MAX_BYTES: usize = 8 * 1024 * 1024;

/// Magic-byte sniff: only real PNG / JPEG / WebP bytes are stored, whatever
/// the request claims.
fn sniff_image(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Some("png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("jpg");
    }
    None
}

/// A servable mat filename: `<hex user id>-<hex suffix>.<ext>`, nothing that
/// could walk the filesystem.
pub fn valid_mat_file(file: &str) -> bool {
    let Some((stem, ext)) = file.rsplit_once('.') else {
        return false;
    };
    matches!(ext, "webp" | "png" | "jpg")
        && !stem.is_empty()
        && stem.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

/// POST /api/playmat — body is the raw image bytes. Each player keeps ONE
/// custom mat (a new upload replaces the previous file), stored under
/// data/mats and served at /api/mats/{file}. The returned id (`custom-<file>`)
/// goes through the normal playmat preference + `playmat.set` sync, so every
/// viewer of the table resolves the same URL.
pub async fn playmat_upload(
    State(app): State<Arc<App>>,
    Extension(user): Extension<db::User>,
    body: axum::body::Bytes,
) -> Response {
    if body.is_empty() {
        return err(StatusCode::BAD_REQUEST, "empty_upload", "no image data received");
    }
    let Some(ext) = sniff_image(&body) else {
        return err(StatusCode::BAD_REQUEST, "bad_image", "upload a PNG, JPEG, or WebP image");
    };
    // One writer at a time: the scan-delete-write below is racy unguarded
    // (parallel uploads from one account would each survive the scan and
    // strand orphans), and the global-cap check must see a settled dir.
    let _guard = app.mats_lock.lock().await;
    // Replace any previous upload by this player - storage stays bounded at
    // one mat per account - and cap the store as a whole so open registration
    // can't be scripted into filling the disk.
    let mut total: u64 = 0;
    if let Ok(entries) = std::fs::read_dir(&app.mats_dir) {
        let mine = format!("{}-", user.id);
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().starts_with(&mine) {
                let _ = std::fs::remove_file(entry.path());
            } else {
                total += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    const MATS_TOTAL_CAP: u64 = 2 * 1024 * 1024 * 1024; // 2GiB across all accounts
    if total + body.len() as u64 > MATS_TOTAL_CAP {
        return err(
            StatusCode::INSUFFICIENT_STORAGE,
            "mats_full",
            "custom playmat storage is full right now - try again later",
        );
    }
    let file = format!("{}-{}.{ext}", user.id, hex_id(4));
    if !valid_mat_file(&file) {
        return err(StatusCode::BAD_REQUEST, "bad_image", "unexpected upload name");
    }
    if std::fs::write(app.mats_dir.join(&file), &body).is_err() {
        return err(StatusCode::INTERNAL_SERVER_ERROR, "write_failed", "could not store the image");
    }
    Json(json!({ "id": format!("custom-{file}"), "url": format!("/api/mats/{file}") })).into_response()
}

/// How long a "this set has no art" marker is trusted before we look again.
/// Not permanent: the miss may have been a transient Scryfall outage, and a
/// preview set gains art crops as spoilers land.
const ART_MISS_TTL: std::time::Duration = std::time::Duration::from_secs(24 * 60 * 60);

/// Whether a negative-cache marker is still fresh. An unreadable or expired
/// marker falls through to a re-fetch, which rewrites it on a genuine miss.
fn miss_fresh(miss: &std::path::Path) -> bool {
    std::fs::metadata(miss)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|at| at.elapsed().ok())
        .map(|age| age < ART_MISS_TTL)
        .unwrap_or(false)
}

/// GET /api/boosters/art/{code} — the marquee art crop for a set, fetched from
/// Scryfall once and cached on disk forever after. Public for the same reason
/// as mats: it is painted from <img>/url(), which cannot attach auth headers.
///
/// The booster grid shows a simulated pack per set; ~150 tiles each wanting an
/// art crop would blow straight through Scryfall's rate limit from every
/// visitor's browser, so the server takes the hit exactly once per set.
pub async fn booster_art(State(app): State<Arc<App>>, Path(code): Path<String>) -> Response {
    // Scryfall set codes: short lowercase alphanumerics ("trk", "2xm", "m20").
    if code.is_empty() || code.len() > 8 || !code.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()) {
        return err(StatusCode::BAD_REQUEST, "bad_code", "not a set code");
    }
    let hit = app.booster_art_dir.join(format!("{code}.jpg"));
    let miss = app.booster_art_dir.join(format!("{code}.none"));

    let serve = |bytes: Vec<u8>| {
        (
            [
                (header::CONTENT_TYPE, "image/jpeg"),
                // A set's poster art never changes once cached.
                (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
            ],
            bytes,
        )
            .into_response()
    };

    if let Ok(bytes) = std::fs::read(&hit) {
        return serve(bytes);
    }
    if miss_fresh(&miss) {
        // Negative cache, but time-limited: a transient Scryfall failure (or a
        // preview set whose spoilers had no art yet) must not brick the set.
        return err(StatusCode::NOT_FOUND, "no_art", "no art for this set");
    }

    // One fetch at a time; re-check the disk once inside, because every tile
    // for the same set queues here on a cold cache.
    let _guard = app.booster_art_lock.lock().await;
    if let Ok(bytes) = std::fs::read(&hit) {
        return serve(bytes);
    }
    if miss_fresh(&miss) {
        return err(StatusCode::NOT_FOUND, "no_art", "no art for this set");
    }

    // Only a *definitive* miss (Scryfall answered, nothing usable) is cached;
    // an unreachable Scryfall leaves no marker so the next request retries.
    let reached = warm_booster_set(&app.booster_art_dir, &code).await;
    match std::fs::read(&hit) {
        Ok(bytes) => serve(bytes),
        Err(_) => {
            if reached {
                let _ = std::fs::write(&miss, b"");
            }
            err(StatusCode::NOT_FOUND, "no_art", "no art for this set")
        }
    }
}

/// GET /api/boosters/card/{code}/{index} — one of the set's three showcase
/// cards (its rarest faces), cached by the same warm pass as the poster art.
pub async fn booster_card(
    State(app): State<Arc<App>>,
    Path((code, index)): Path<(String, u8)>,
) -> Response {
    if code.is_empty() || code.len() > 8 || !code.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()) {
        return err(StatusCode::BAD_REQUEST, "bad_code", "not a set code");
    }
    if index > 2 {
        return err(StatusCode::BAD_REQUEST, "bad_index", "0..=2");
    }
    let hit = app.booster_art_dir.join(format!("{code}.card{index}.jpg"));
    let miss = app.booster_art_dir.join(format!("{code}.card{index}.none"));

    let serve = |bytes: Vec<u8>| {
        (
            [
                (header::CONTENT_TYPE, "image/jpeg"),
                (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
            ],
            bytes,
        )
            .into_response()
    };

    if let Ok(bytes) = std::fs::read(&hit) {
        return serve(bytes);
    }
    if miss_fresh(&miss) {
        return err(StatusCode::NOT_FOUND, "no_card", "no such showcase card");
    }

    let _guard = app.booster_art_lock.lock().await;
    if let Ok(bytes) = std::fs::read(&hit) {
        return serve(bytes);
    }
    if miss_fresh(&miss) {
        return err(StatusCode::NOT_FOUND, "no_card", "no such showcase card");
    }

    let reached = warm_booster_set(&app.booster_art_dir, &code).await;
    match std::fs::read(&hit) {
        Ok(bytes) => serve(bytes),
        Err(_) => {
            if reached {
                let _ = std::fs::write(&miss, b"");
            }
            err(StatusCode::NOT_FOUND, "no_card", "no such showcase card")
        }
    }
}

/// Warm the whole cache for a set in one pass: the poster art crop plus the
/// top three rare/mythic card faces. The poster is the most talked-about rare
/// or mythic (EDHREC ordering is stable and exists even before a set has
/// prices); sets without rares fall back to any card. One search, then at most
/// four image downloads, all behind the caller's art lock.
/// Returns true when Scryfall actually answered (so an empty result is a real
/// "no art" rather than an outage), false when every request failed.
async fn warm_booster_set(dir: &std::path::Path, code: &str) -> bool {
    let queries = [
        format!("set:{code} (rarity:mythic or rarity:rare)"),
        format!("set:{code}"),
    ];
    let mut reached = false;
    for query in &queries {
        let url = format!(
            "https://api.scryfall.com/cards/search?q={}&unique=cards&order=edhrec",
            urlencode(query)
        );
        let Some(body) = curl_text(&url).await else { continue };
        let Ok(payload) = serde_json::from_str::<Value>(&body) else { continue };
        // Scryfall answered with JSON. Even an empty/errored payload counts as
        // reached: it is an answer about the set, not a network failure.
        reached = true;
        let cards = payload.get("data").and_then(Value::as_array);
        let Some(cards) = cards else { continue };
        // Scryfall politeness: the search above counts against /cards/*.
        tokio::time::sleep(std::time::Duration::from_millis(550)).await;

        // The poster: the first card with a usable art crop.
        let art_path = dir.join(format!("{code}.jpg"));
        if !art_path.exists() {
            for card in cards.iter().take(5) {
                let art = card
                    .pointer("/image_uris/art_crop")
                    .or_else(|| card.pointer("/card_faces/0/image_uris/art_crop"))
                    .and_then(Value::as_str);
                let Some(art) = art else { continue };
                if let Some(bytes) = curl_jpeg(art).await {
                    let _ = std::fs::write(&art_path, &bytes);
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(550)).await;
            }
        }

        // The showcase fan: the three rarest faces, by the same ordering.
        for (index, card) in cards.iter().take(3).enumerate() {
            let card_path = dir.join(format!("{code}.card{index}.jpg"));
            if card_path.exists() {
                continue;
            }
            let face = card
                .pointer("/image_uris/normal")
                .or_else(|| card.pointer("/card_faces/0/image_uris/normal"))
                .and_then(Value::as_str);
            let Some(face) = face else { continue };
            if let Some(bytes) = curl_jpeg(face).await {
                let _ = std::fs::write(&card_path, &bytes);
            }
            tokio::time::sleep(std::time::Duration::from_millis(550)).await;
        }
        return reached;
    }
    reached
}

/// Download a URL and hand it back only if it is a real JPEG: magic bytes and
/// a size floor keep any error page (whatever its status) out of the cache.
async fn curl_jpeg(url: &str) -> Option<Vec<u8>> {
    let bytes = curl_bytes(url).await?;
    if bytes.len() > 1024 && bytes.starts_with(&[0xFF, 0xD8]) {
        Some(bytes)
    } else {
        None
    }
}

fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// GET a URL through the system curl (see import_moxfield for why curl).
async fn curl_out(url: &str) -> Option<Vec<u8>> {
    let output = tokio::process::Command::new("curl")
        .arg("-s")
        // Fail on HTTP >= 400: without this curl exits 0 for a 404 and the
        // error body would flow onward as if it were the payload.
        .arg("-f")
        .arg("-L")
        .arg("-m")
        .arg("20")
        .arg("-H")
        .arg("user-agent: PrettyCardboard/1.0 (booster art cache)")
        .arg("-H")
        .arg("accept: */*")
        .arg(url)
        .output()
        .await
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(output.stdout)
}

async fn curl_text(url: &str) -> Option<String> {
    String::from_utf8(curl_out(url).await?).ok()
}

async fn curl_bytes(url: &str) -> Option<Vec<u8>> {
    curl_out(url).await
}

/// GET /api/mats/{file} — serves stored custom mats. Public: mats are painted
/// from CSS url() / <img>, which cannot attach auth headers.
pub async fn playmat_serve(State(app): State<Arc<App>>, Path(file): Path<String>) -> Response {
    if !valid_mat_file(&file) {
        return err(StatusCode::BAD_REQUEST, "bad_name", "not a mat file");
    }
    let ctype = match file.rsplit_once('.').map(|(_, e)| e) {
        Some("webp") => "image/webp",
        Some("png") => "image/png",
        _ => "image/jpeg",
    };
    match std::fs::read(app.mats_dir.join(&file)) {
        Ok(bytes) => (
            [
                (header::CONTENT_TYPE, ctype),
                // Filenames are unique per upload - safe to cache hard.
                (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
            ],
            bytes,
        )
            .into_response(),
        Err(_) => err(StatusCode::NOT_FOUND, "not_found", "no such mat"),
    }
}
