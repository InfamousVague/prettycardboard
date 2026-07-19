use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// Authenticated user (also stored as the request extension by the auth middleware).
#[derive(Clone)]
pub struct User {
    pub id: String,
    pub username: String,
    pub created_at: i64,
}

/// One entry of a deck's card list, stored verbatim as JSON.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckCard {
    pub scryfall_id: String,
    pub name: String,
    pub quantity: u32,
    #[serde(default = "default_board")]
    pub board: String,
}

fn default_board() -> String {
    "main".to_string()
}

pub struct DeckRow {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub format: String,
    pub cards_json: String,
    pub updated_at: i64,
    /// Scryfall id of the deck's chosen header/cover card, when customized.
    pub header: Option<String>,
}

impl DeckRow {
    pub fn cards(&self) -> Vec<DeckCard> {
        serde_json::from_str(&self.cards_json).unwrap_or_default()
    }
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS users(
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    token TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friend_requests(
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friendships(
    a_id TEXT NOT NULL,
    b_id TEXT NOT NULL,
    PRIMARY KEY(a_id, b_id)
);
CREATE TABLE IF NOT EXISTS decks(
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    format TEXT NOT NULL,
    cards_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms(
    id TEXT PRIMARY KEY,
    code TEXT,
    name TEXT,
    seats INTEGER,
    host_id TEXT,
    persistent INTEGER,
    started INTEGER,
    state_json TEXT,
    created_at INTEGER,
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS match_history(
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    room_name TEXT,
    format TEXT,
    players_json TEXT,
    seats INTEGER,
    played_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_match_user ON match_history(user_id, played_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_once ON match_history(user_id, room_id);
CREATE TABLE IF NOT EXISTS matches(
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    room_name TEXT,
    format TEXT,
    winner_user_id TEXT NOT NULL,
    turns INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    ended_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS match_players(
    match_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT,
    seat INTEGER,
    is_bot INTEGER NOT NULL DEFAULT 0,
    deck_id TEXT,
    deck_name TEXT,
    won INTEGER NOT NULL DEFAULT 0,
    conceded INTEGER NOT NULL DEFAULT 0,
    turns_taken INTEGER NOT NULL DEFAULT 0,
    avg_turn_ms INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(match_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_mp_user ON match_players(user_id);
CREATE INDEX IF NOT EXISTS idx_mp_deck ON match_players(deck_id);
CREATE TABLE IF NOT EXISTS endorsements(
    match_id TEXT NOT NULL,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(match_id, from_id, to_id)
);
CREATE INDEX IF NOT EXISTS idx_endorse_to ON endorsements(to_id);
CREATE TABLE IF NOT EXISTS salt_ratings(
    match_id TEXT NOT NULL,
    from_id TEXT NOT NULL,
    deck_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    salt INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(match_id, from_id, deck_id)
);
CREATE INDEX IF NOT EXISTS idx_salt_deck ON salt_ratings(deck_id);
";

pub fn open(path: &std::path::Path) -> Connection {
    let conn = Connection::open(path).expect("open sqlite db");
    conn.execute_batch(SCHEMA).expect("apply schema");
    // Additive migration: accounts predating password auth have a NULL hash
    // (they keep working via their stored token but cannot log back in).
    let _ = conn.execute("ALTER TABLE users ADD COLUMN password_hash TEXT", []);
    let _ = conn.execute("ALTER TABLE decks ADD COLUMN header TEXT", []);
    conn
}

/// Login lookup: the stored credentials for a username, if any.
pub fn user_credentials(conn: &Connection, username: &str) -> Option<(String, String, String, Option<String>)> {
    conn.query_row(
        "SELECT id, username, token, password_hash FROM users WHERE username = ?",
        [username],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .ok()
}

fn row_user(row: &rusqlite::Row) -> rusqlite::Result<User> {
    Ok(User {
        id: row.get(0)?,
        username: row.get(1)?,
        created_at: row.get(2)?,
    })
}

pub fn user_by_token(conn: &Connection, token: &str) -> Option<User> {
    conn.query_row(
        "SELECT id, username, created_at FROM users WHERE token = ?",
        [token],
        row_user,
    )
    .optional()
    .ok()
    .flatten()
}

pub fn user_by_id(conn: &Connection, id: &str) -> Option<User> {
    conn.query_row(
        "SELECT id, username, created_at FROM users WHERE id = ?",
        [id],
        row_user,
    )
    .optional()
    .ok()
    .flatten()
}

/// Prefix search, case-insensitive, excluding `exclude_id`. Returns (id, username).
pub fn search_users(conn: &Connection, q: &str, exclude_id: &str) -> Vec<(String, String)> {
    let escaped = q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
    let mut stmt = conn
        .prepare(
            "SELECT id, username FROM users
             WHERE username LIKE ? ESCAPE '\\' AND id != ?
             ORDER BY username LIMIT 20",
        )
        .unwrap();
    stmt.query_map(params![format!("{escaped}%"), exclude_id], |r| {
        Ok((r.get(0)?, r.get(1)?))
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

/// Record that `user_id` played a game in `room_id`. Idempotent per (user,
/// room): the unique index makes a re-record a no-op, so restarting the same
/// table never double-lists it.
pub fn match_record(
    conn: &Connection,
    id: &str,
    user_id: &str,
    room_id: &str,
    room_name: &str,
    format: &str,
    players_json: &str,
    seats: i64,
    played_at: i64,
) {
    let _ = conn.execute(
        "INSERT OR IGNORE INTO match_history(id, user_id, room_id, room_name, format, players_json, seats, played_at)
         VALUES(?,?,?,?,?,?,?,?)",
        params![id, user_id, room_id, room_name, format, players_json, seats, played_at],
    );
}

/// The caller's recent games, newest first (JSON values, ready to serialize).
pub fn matches_for(conn: &Connection, user_id: &str) -> Vec<serde_json::Value> {
    let mut stmt = conn
        .prepare(
            "SELECT room_name, format, players_json, seats, played_at
             FROM match_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 50",
        )
        .unwrap();
    let rows = stmt
        .query_map([user_id], |row| {
            let players_json: String = row.get(2)?;
            let players: serde_json::Value =
                serde_json::from_str(&players_json).unwrap_or(serde_json::Value::Array(vec![]));
            Ok(serde_json::json!({
                "name": row.get::<_, Option<String>>(0)?,
                "format": row.get::<_, Option<String>>(1)?,
                "players": players,
                "seats": row.get::<_, Option<i64>>(3)?,
                "playedAt": row.get::<_, i64>(4)?,
            }))
        })
        .unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

/// Persist a finished match: one matches row plus one match_players row per
/// seat (bots included; they anchor per-match display, not all-time stats).
pub fn match_result_record(
    conn: &Connection,
    result: &crate::rooms::MatchResult,
    room_id: &str,
    room_name: &str,
    format: &str,
) {
    let _ = conn.execute(
        "INSERT OR IGNORE INTO matches(id, room_id, room_name, format, winner_user_id, turns, duration_ms, ended_at)
         VALUES(?,?,?,?,?,?,?,?)",
        params![
            result.match_id,
            room_id,
            room_name,
            format,
            result.winner_user_id,
            result.turns as i64,
            result.duration_ms,
            result.ended_at
        ],
    );
    for p in &result.players {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO match_players(match_id, user_id, username, seat, is_bot, deck_id, deck_name, won, conceded, turns_taken, avg_turn_ms)
             VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            params![
                result.match_id,
                p.user_id,
                p.username,
                p.seat as i64,
                p.is_bot as i64,
                p.deck_id,
                p.deck_name,
                (p.user_id == result.winner_user_id) as i64,
                p.conceded as i64,
                p.turns_taken as i64,
                p.avg_turn_ms
            ],
        );
    }
}

/// One participant of a stored match, straight from match_players.
pub struct MatchPlayerRow {
    pub user_id: String,
    pub username: Option<String>,
    pub seat: i64,
    pub is_bot: bool,
    pub deck_id: Option<String>,
    pub deck_name: Option<String>,
    pub won: bool,
    pub conceded: bool,
    pub turns_taken: i64,
    pub avg_turn_ms: i64,
}

pub fn match_players_rows(conn: &Connection, match_id: &str) -> Vec<MatchPlayerRow> {
    let mut stmt = conn
        .prepare(
            "SELECT user_id, username, seat, is_bot, deck_id, deck_name, won, conceded, turns_taken, avg_turn_ms
             FROM match_players WHERE match_id = ? ORDER BY seat",
        )
        .unwrap();
    stmt.query_map([match_id], |r| {
        Ok(MatchPlayerRow {
            user_id: r.get(0)?,
            username: r.get(1)?,
            seat: r.get(2)?,
            is_bot: r.get::<_, i64>(3)? != 0,
            deck_id: r.get(4)?,
            deck_name: r.get(5)?,
            won: r.get::<_, i64>(6)? != 0,
            conceded: r.get::<_, i64>(7)? != 0,
            turns_taken: r.get(8)?,
            avg_turn_ms: r.get(9)?,
        })
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

pub fn match_has_player(conn: &Connection, match_id: &str, user_id: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM match_players WHERE match_id = ? AND user_id = ?",
        params![match_id, user_id],
        |_| Ok(()),
    )
    .is_ok()
}

/// Who played `deck_id` in this match (salt ratings must target a deck that
/// was actually at the table).
pub fn match_deck_owner(conn: &Connection, match_id: &str, deck_id: &str) -> Option<String> {
    conn.query_row(
        "SELECT user_id FROM match_players WHERE match_id = ? AND deck_id = ?",
        params![match_id, deck_id],
        |r| r.get(0),
    )
    .ok()
}

pub fn endorse_insert(conn: &Connection, match_id: &str, from: &str, to: &str, now: i64) {
    let _ = conn.execute(
        "INSERT OR IGNORE INTO endorsements(match_id, from_id, to_id, created_at) VALUES(?,?,?,?)",
        params![match_id, from, to, now],
    );
}

/// Upsert: a rater may revise their salt for a deck within the same match.
pub fn salt_upsert(
    conn: &Connection,
    match_id: &str,
    from: &str,
    deck_id: &str,
    owner: &str,
    salt: i64,
    now: i64,
) {
    let _ = conn.execute(
        "INSERT OR REPLACE INTO salt_ratings(match_id, from_id, deck_id, owner_id, salt, created_at)
         VALUES(?,?,?,?,?,?)",
        params![match_id, from, deck_id, owner, salt, now],
    );
}

/// All-time (wins, losses) for a user across recorded results.
pub fn user_match_counts(conn: &Connection, user_id: &str) -> (i64, i64) {
    conn.query_row(
        "SELECT COALESCE(SUM(won), 0), COALESCE(SUM(1 - won), 0) FROM match_players WHERE user_id = ?",
        [user_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .unwrap_or((0, 0))
}

/// Distinct endorsers, not raw rows: a hundred matches with the same friend
/// still counts as one voice.
pub fn user_endorsement_count(conn: &Connection, user_id: &str) -> i64 {
    conn.query_row(
        "SELECT COUNT(DISTINCT from_id) FROM endorsements WHERE to_id = ?",
        [user_id],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

pub fn match_player_is_bot(conn: &Connection, match_id: &str, user_id: &str) -> Option<bool> {
    conn.query_row(
        "SELECT is_bot FROM match_players WHERE match_id = ? AND user_id = ?",
        params![match_id, user_id],
        |r| Ok(r.get::<_, i64>(0)? != 0),
    )
    .ok()
}

/// All-time average seconds-per-turn signal, weighted by turns played.
pub fn user_avg_turn_ms(conn: &Connection, user_id: &str) -> i64 {
    conn.query_row(
        "SELECT COALESCE(SUM(avg_turn_ms * turns_taken) / NULLIF(SUM(turns_taken), 0), 0)
         FROM match_players WHERE user_id = ? AND turns_taken > 0",
        [user_id],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

/// All-time (wins, losses) for a specific deck.
pub fn deck_match_counts(conn: &Connection, deck_id: &str) -> (i64, i64) {
    conn.query_row(
        "SELECT COALESCE(SUM(won), 0), COALESCE(SUM(1 - won), 0) FROM match_players WHERE deck_id = ?",
        [deck_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .unwrap_or((0, 0))
}

/// (average salt x100 to keep it integral, distinct-rater count) for a deck.
/// Each rater contributes one vote (their personal average across matches),
/// so repeat games with the same salty friend cannot pile on.
pub fn deck_salt(conn: &Connection, deck_id: &str) -> (i64, i64) {
    conn.query_row(
        "SELECT COALESCE(CAST(ROUND(AVG(s) * 100.0) AS INTEGER), 0), COUNT(*)
         FROM (SELECT AVG(salt) AS s FROM salt_ratings WHERE deck_id = ? GROUP BY from_id)",
        [deck_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .unwrap_or((0, 0))
}

pub fn endorsed_by(conn: &Connection, match_id: &str, from: &str, to: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM endorsements WHERE match_id = ? AND from_id = ? AND to_id = ?",
        params![match_id, from, to],
        |_| Ok(()),
    )
    .is_ok()
}

pub fn salt_by(conn: &Connection, match_id: &str, from: &str, deck_id: &str) -> Option<i64> {
    conn.query_row(
        "SELECT salt FROM salt_ratings WHERE match_id = ? AND from_id = ? AND deck_id = ?",
        params![match_id, from, deck_id],
        |r| r.get(0),
    )
    .ok()
}

pub fn friend_ids(conn: &Connection, user_id: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare("SELECT CASE WHEN a_id = ?1 THEN b_id ELSE a_id END FROM friendships WHERE a_id = ?1 OR b_id = ?1")
        .unwrap();
    stmt.query_map([user_id], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

/// Friends with usernames: (id, username).
pub fn friends_of(conn: &Connection, user_id: &str) -> Vec<(String, String)> {
    let mut stmt = conn
        .prepare(
            "SELECT u.id, u.username FROM friendships f
             JOIN users u ON u.id = CASE WHEN f.a_id = ?1 THEN f.b_id ELSE f.a_id END
             WHERE f.a_id = ?1 OR f.b_id = ?1 ORDER BY u.username",
        )
        .unwrap();
    stmt.query_map([user_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

pub fn are_friends(conn: &Connection, a: &str, b: &str) -> bool {
    let (lo, hi) = if a < b { (a, b) } else { (b, a) };
    conn.query_row(
        "SELECT 1 FROM friendships WHERE a_id = ? AND b_id = ?",
        params![lo, hi],
        |_| Ok(()),
    )
    .optional()
    .unwrap_or(None)
    .is_some()
}

pub fn request_pending(conn: &Connection, a: &str, b: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM friend_requests WHERE (from_id = ?1 AND to_id = ?2) OR (from_id = ?2 AND to_id = ?1)",
        params![a, b],
        |_| Ok(()),
    )
    .optional()
    .unwrap_or(None)
    .is_some()
}

pub fn insert_request(conn: &Connection, id: &str, from: &str, to: &str, now: i64) {
    conn.execute(
        "INSERT INTO friend_requests(id, from_id, to_id, created_at) VALUES(?,?,?,?)",
        params![id, from, to, now],
    )
    .unwrap();
}

/// (from_id, to_id) of a request.
pub fn get_request(conn: &Connection, id: &str) -> Option<(String, String)> {
    conn.query_row(
        "SELECT from_id, to_id FROM friend_requests WHERE id = ?",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .optional()
    .unwrap_or(None)
}

pub fn delete_request(conn: &Connection, id: &str) {
    conn.execute("DELETE FROM friend_requests WHERE id = ?", [id]).unwrap();
}

pub fn insert_friendship(conn: &Connection, a: &str, b: &str) {
    let (lo, hi) = if a < b { (a, b) } else { (b, a) };
    conn.execute(
        "INSERT OR IGNORE INTO friendships(a_id, b_id) VALUES(?,?)",
        params![lo, hi],
    )
    .unwrap();
}

pub fn delete_friendship(conn: &Connection, a: &str, b: &str) {
    let (lo, hi) = if a < b { (a, b) } else { (b, a) };
    conn.execute(
        "DELETE FROM friendships WHERE a_id = ? AND b_id = ?",
        params![lo, hi],
    )
    .unwrap();
}

/// Incoming friend requests: (request_id, from_id, from_username).
pub fn incoming_requests(conn: &Connection, user_id: &str) -> Vec<(String, String, String)> {
    let mut stmt = conn
        .prepare(
            "SELECT r.id, u.id, u.username FROM friend_requests r
             JOIN users u ON u.id = r.from_id WHERE r.to_id = ? ORDER BY r.created_at",
        )
        .unwrap();
    stmt.query_map([user_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

/// Outgoing friend requests: (request_id, to_id, to_username).
pub fn outgoing_requests(conn: &Connection, user_id: &str) -> Vec<(String, String, String)> {
    let mut stmt = conn
        .prepare(
            "SELECT r.id, u.id, u.username FROM friend_requests r
             JOIN users u ON u.id = r.to_id WHERE r.from_id = ? ORDER BY r.created_at",
        )
        .unwrap();
    stmt.query_map([user_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

fn row_deck(row: &rusqlite::Row) -> rusqlite::Result<DeckRow> {
    Ok(DeckRow {
        id: row.get(0)?,
        user_id: row.get(1)?,
        name: row.get(2)?,
        format: row.get(3)?,
        cards_json: row.get(4)?,
        updated_at: row.get(5)?,
        header: row.get(6)?,
    })
}

pub fn decks_for(conn: &Connection, user_id: &str) -> Vec<DeckRow> {
    let mut stmt = conn
        .prepare(
            "SELECT id, user_id, name, format, cards_json, updated_at, header
             FROM decks WHERE user_id = ? ORDER BY updated_at DESC",
        )
        .unwrap();
    stmt.query_map([user_id], row_deck)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

pub fn deck_get(conn: &Connection, id: &str) -> Option<DeckRow> {
    conn.query_row(
        "SELECT id, user_id, name, format, cards_json, updated_at, header FROM decks WHERE id = ?",
        [id],
        row_deck,
    )
    .optional()
    .unwrap_or(None)
}

pub fn deck_insert(conn: &Connection, row: &DeckRow) {
    conn.execute(
        "INSERT INTO decks(id, user_id, name, format, cards_json, updated_at, header) VALUES(?,?,?,?,?,?,?)",
        params![row.id, row.user_id, row.name, row.format, row.cards_json, row.updated_at, row.header],
    )
    .unwrap();
}

pub fn deck_update(
    conn: &Connection,
    id: &str,
    name: &str,
    format: &str,
    cards_json: &str,
    header: Option<&str>,
    now: i64,
) {
    conn.execute(
        "UPDATE decks SET name = ?, format = ?, cards_json = ?, header = ?, updated_at = ? WHERE id = ?",
        params![name, format, cards_json, header, now, id],
    )
    .unwrap();
}

pub fn deck_delete(conn: &Connection, id: &str) {
    conn.execute("DELETE FROM decks WHERE id = ?", [id]).unwrap();
}

// --- room persistence ---

/// One persisted room row. `state_json` is the full serialized `rooms::Room`;
/// the other columns duplicate its metadata for queryability.
pub struct RoomRow {
    pub id: String,
    pub code: String,
    pub name: String,
    pub seats: i64,
    pub host_id: String,
    pub persistent: bool,
    pub started: bool,
    pub state_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn room_save(conn: &Connection, row: &RoomRow) {
    conn.execute(
        "INSERT OR REPLACE INTO rooms(id, code, name, seats, host_id, persistent, started, state_json, created_at, updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)",
        params![
            row.id,
            row.code,
            row.name,
            row.seats,
            row.host_id,
            row.persistent as i64,
            row.started as i64,
            row.state_json,
            row.created_at,
            row.updated_at
        ],
    )
    .unwrap();
}

/// All persisted rooms as (id, state_json). A NULL state_json comes back as
/// None so the caller can prune the row.
pub fn rooms_load(conn: &Connection) -> Vec<(String, Option<String>)> {
    let mut stmt = conn.prepare("SELECT id, state_json FROM rooms").unwrap();
    stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

pub fn room_delete(conn: &Connection, id: &str) {
    conn.execute("DELETE FROM rooms WHERE id = ?", [id]).unwrap();
}
