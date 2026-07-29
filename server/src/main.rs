mod api;
mod brackets;
mod collection;
mod db;
mod game;
mod rooms;
mod ws;

use axum::http::HeaderValue;
use axum::middleware;
use axum::routing::{delete, get, post};
use axum::Router;
use dashmap::{DashMap, DashSet};
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc::UnboundedSender;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};

/// Where a user currently is (seated player or spectator).
#[derive(Clone)]
pub struct RoomRef {
    pub room_id: String,
    pub spectating: bool,
}

pub struct App {
    pub db: Mutex<rusqlite::Connection>,
    /// roomId -> Room (live rooms are memory-only).
    pub rooms: DashMap<String, rooms::Room>,
    /// join code -> roomId.
    pub codes: DashMap<String, String>,
    /// userId -> open WS connections (connId, sender of raw JSON text).
    pub conns: DashMap<String, Vec<(u64, UnboundedSender<String>)>>,
    /// userId -> current room.
    pub user_rooms: DashMap<String, RoomRef>,
    /// Last targeted ping per sender, used to prevent repeated sound alerts.
    pub ping_at: DashMap<String, i64>,
    /// roomIds mutated since the last write-behind flush (drained every 2s).
    pub dirty: DashSet<String>,
    pub conn_seq: AtomicU64,
    /// Player-uploaded custom playmats (served at /api/mats/{file}).
    pub mats_dir: std::path::PathBuf,
    /// Serializes mat uploads (scan-delete-write is racy unguarded).
    pub mats_lock: tokio::sync::Mutex<()>,
    /// Player-uploaded custom card backs (served at /api/backs/{file}).
    pub backs_dir: std::path::PathBuf,
    /// Serializes card-back uploads (scan-delete-write is racy unguarded).
    pub backs_lock: tokio::sync::Mutex<()>,
    /// Curated global alternate-art printings (served at /api/art/{file}).
    /// Unlike mats these are NOT user uploads: the directory is published by
    /// ops and every player sees the same catalog as extra printing options.
    pub alt_art_dir: std::path::PathBuf,
    /// Cached booster-set poster art (served at /api/boosters/art/{code}).
    pub booster_art_dir: std::path::PathBuf,
    /// Serializes cache misses: one Scryfall fetch at a time keeps us far
    /// inside their published rate limit however many tiles land at once.
    pub booster_art_lock: tokio::sync::Mutex<()>,
}

impl App {
    pub fn is_online(&self, user_id: &str) -> bool {
        self.conns.get(user_id).map(|v| !v.is_empty()).unwrap_or(false)
    }

    /// The roomId a user is *seated* in (spectating does not count for presence).
    pub fn seated_room(&self, user_id: &str) -> Option<String> {
        self.user_rooms
            .get(user_id)
            .and_then(|r| if r.spectating { None } else { Some(r.room_id.clone()) })
    }
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

/// Random lowercase-hex id, `bytes` bytes long (2 chars per byte).
pub fn hex_id(bytes: usize) -> String {
    use rand::RngCore;
    let mut buf = vec![0u8; bytes];
    rand::rng().fill_bytes(&mut buf);
    let mut s = String::with_capacity(bytes * 2);
    for b in buf {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

/// Format unix milliseconds as an ISO-8601 UTC string, e.g. "2026-07-17T20:15:03.123Z".
pub fn iso8601(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let millis = ms.rem_euclid(1000);
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    let (h, m, s) = (sod / 3600, (sod % 3600) / 60, sod % 60);
    // civil_from_days (Howard Hinnant's algorithm)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mo <= 2 { y + 1 } else { y };
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}.{millis:03}Z")
}

fn allowed_origin(origin: &str) -> bool {
    if origin == "tauri://localhost" || origin == "https://tauri.localhost" {
        return true;
    }
    for prefix in [
        "http://localhost",
        "http://127.0.0.1",
        "https://localhost",
        "https://127.0.0.1",
    ] {
        if let Some(rest) = origin.strip_prefix(prefix) {
            return rest.is_empty() || rest.starts_with(':');
        }
    }
    false
}

#[tokio::main]
async fn main() {
    let port: u16 = std::env::var("PC_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8787);

    let data_dir = std::path::PathBuf::from(
        std::env::var("PC_DATA_DIR").unwrap_or_else(|_| "data".to_string()),
    );
    std::fs::create_dir_all(&data_dir).expect("create data dir");
    let conn = db::open(&data_dir.join("pc.db"));

    // Reload persisted rooms: players come back offline (they resume by
    // reconnecting), spectators reset, unparseable rows are pruned.
    let mut restored: Vec<rooms::Room> = Vec::new();
    for (id, state_json) in db::rooms_load(&conn) {
        let parsed = state_json
            .as_deref()
            .and_then(|s| serde_json::from_str::<rooms::Room>(s).ok());
        match parsed {
            Some(mut room) => {
                // Everyone resumes by reconnecting.
                for p in room.players.iter_mut() {
                    p.online = false;
                }
                room.spectators.clear();
                // Rooms persisted before the match-end feature carry zeroed
                // clocks; backfill so their in-flight games can still finish.
                if room.started && room.started_players == 0 {
                    room.started_players = room.players.len();
                }
                if room.started && room.started_at_ms == 0 {
                    room.started_at_ms = room.created_at;
                }
                // Pre-feature games past their opening mulligans must not
                // re-fire the first-turn draw on a late keep/concede.
                if room.started
                    && (room.turn_number > 1
                        || room
                            .players
                            .iter()
                            .all(|p| p.mulligan.as_ref().map(|m| m.state == "kept").unwrap_or(true)))
                {
                    room.first_turn_begun = true;
                }
                // Restore the undo/redo/replay timeline persisted out-of-band, so
                // undo reaches back across the restart. Bookkeeping is primed to
                // match the DB (nothing to re-write until the next real change).
                let (history, cursor) = db::history_load(&conn, &id);
                let max_hid = history.iter().map(|s| s.hid).max();
                room.hist_next_hid = max_hid.map(|m| m + 1).unwrap_or(0);
                room.hist_saved_hi = max_hid;
                room.cursor = cursor;
                room.history = history;
                room.hist_removed.clear();
                room.hist_dirty = false;
                restored.push(room);
            }
            None => db::room_delete(&conn, &id),
        }
    }

    let mats_dir = data_dir.join("mats");
    std::fs::create_dir_all(&mats_dir).expect("create mats dir");
    let booster_art_dir = data_dir.join("booster-art");
    std::fs::create_dir_all(&booster_art_dir).expect("create booster art dir");
    let backs_dir = data_dir.join("backs");
    std::fs::create_dir_all(&backs_dir).expect("create backs dir");
    let alt_art_dir = data_dir.join("alt-art");
    std::fs::create_dir_all(&alt_art_dir).expect("create alt art dir");

    let app = Arc::new(App {
        db: Mutex::new(conn),
        rooms: DashMap::new(),
        codes: DashMap::new(),
        conns: DashMap::new(),
        user_rooms: DashMap::new(),
        ping_at: DashMap::new(),
        dirty: DashSet::new(),
        conn_seq: AtomicU64::new(1),
        mats_dir,
        mats_lock: tokio::sync::Mutex::new(()),
        backs_dir,
        backs_lock: tokio::sync::Mutex::new(()),
        alt_art_dir,
        booster_art_dir,
        booster_art_lock: tokio::sync::Mutex::new(()),
    });

    // Rebuild the secondary indexes so codes resolve and seated players
    // resume their seats on reconnect.
    for room in restored {
        app.codes.insert(room.code.clone(), room.id.clone());
        for p in &room.players {
            app.user_rooms.insert(
                p.user_id.clone(),
                RoomRef { room_id: room.id.clone(), spectating: false },
            );
        }
        app.rooms.insert(room.id.clone(), room);
    }

    tokio::spawn(rooms::sweeper(app.clone()));

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin: &HeaderValue, _| {
            origin.to_str().map(allowed_origin).unwrap_or(false)
        }))
        .allow_methods(Any)
        .allow_headers(Any);

    let protected = Router::new()
        .route("/api/me", get(api::me))
        .route("/api/playmat/{file}", axum::routing::delete(api::playmat_delete))
        .route("/api/me/stats", get(api::my_stats))
        .route("/api/me/decks/stats", get(api::my_deck_stats))
        .route("/api/users/search", get(api::search_users))
        .route("/api/users/{id}/stats", get(api::user_stats))
        .route("/api/friends", get(api::friends))
        .route("/api/friends/requests", post(api::friend_request))
        .route("/api/friends/requests/{id}/accept", post(api::friend_accept))
        .route("/api/friends/requests/{id}/decline", post(api::friend_decline))
        .route("/api/friends/{user_id}", delete(api::friend_remove))
        .route("/api/decks", get(api::decks_list).post(api::deck_create))
        .route(
            "/api/decks/{id}",
            get(api::deck_get).put(api::deck_update).delete(api::deck_delete),
        )
        .route("/api/decks/{id}/stats", get(api::deck_stats))
        .route("/api/import/moxfield/{id}", get(api::import_moxfield))
        .route("/api/rooms", post(api::room_create))
        .route("/api/rooms/mine", get(api::rooms_mine))
        .route("/api/collection", get(api::collection_get))
        .route("/api/collection/pulls", post(api::collection_pulls))
        .route("/api/collection/feed", get(api::collection_feed))
        .route("/api/matches", get(api::matches))
        .route("/api/matches/{id}/endorse", post(api::match_endorse))
        .route("/api/matches/{id}/salt", post(api::match_salt))
        .route("/api/matches/{id}/stats", get(api::match_stats))
        .route("/api/rooms/{code}", get(api::room_get).delete(api::room_delete))
        .route(
            "/api/playmat",
            post(api::playmat_upload).layer(axum::extract::DefaultBodyLimit::max(api::MAT_MAX_BYTES)),
        )
        .route(
            "/api/cardback",
            post(api::cardback_upload)
                .delete(api::cardback_delete)
                .layer(axum::extract::DefaultBodyLimit::max(api::BACK_MAX_BYTES)),
        )
        .route_layer(middleware::from_fn_with_state(app.clone(), api::auth_mw));

    let router = Router::new()
        .route("/api/register", post(api::register))
        .route("/api/login", post(api::login))
        // Public: custom playmats load from CSS url()/<img>, which can't send
        // Bearer headers. Filenames are unguessable (user id + random suffix).
        .route("/api/mats/{file}", get(api::playmat_serve))
        // Public, like mats: art loads from <img> tags that cannot send a
        // Bearer header. This is curated global content, not user data.
        .route("/api/backs/{file}", get(api::cardback_serve))
        .route("/api/art/catalog", get(api::alt_art_catalog))
        .route("/api/art/{file}", get(api::alt_art_serve))
        .route("/api/boosters/art/{code}", get(api::booster_art))
        .route("/api/boosters/card/{code}/{index}", get(api::booster_card))
        .route("/api/ws", get(ws::ws_handler))
        .merge(protected)
        .layer(cors)
        .with_state(app);

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .expect("bind");
    println!("PrettyCardboard server listening on http://127.0.0.1:{port}");
    axum::serve(listener, router).await.expect("serve");
}
