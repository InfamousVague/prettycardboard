# Server architecture

The backend is a single Rust binary (`server/`, crate `prettycardboard-server`)
built on **axum** + **tokio**, with **rusqlite** for persistence. It owns all
game state and is authoritative: clients send intents, the server validates and
applies them, then broadcasts the results.

Run it locally with `cargo run` from `server/` (listens on `PC_PORT`, default
`8787`; data in `PC_DATA_DIR`, default `server/data`).

## Module map (`server/src/`)

| File | Responsibility |
|------|----------------|
| `main.rs` | Process entry: builds the `App` state, opens the DB, restores persisted rooms, mounts the axum router, and spawns the background `rooms::sweeper`. |
| `api.rs` | The REST surface: register/login, decks, friends, rooms list/create/delete, match history, endorsements. Token auth middleware lives here. |
| `ws.rs` | The WebSocket surface and the **fan-out pipeline**. One connection per socket; `dispatch_action` is the single choke point every game action flows through. Room membership, presence, join/leave/spectate, and message scoping live here. |
| `game.rs` | The **rules engine**: the `Action` enum (the whole gameplay protocol), `apply()` (the authoritative dispatcher), combat resolution, and the shared card/zone/turn helpers. |
| `game/turns.rs` | Turn order, the per-seat turn clock, and auto-turn (untap + draw) bookkeeping. |
| `rooms.rs` | The `Room`/`Player`/`Card`/`Combat` data model, per-viewer state filtering (`state_for`), persistence (write-behind to SQLite), and the room-expiry sweeper. |
| `db.rs` | SQLite schema + queries: users, decks, friends, rooms, match history, endorsements. |

## The action pipeline (the thing to understand first)

Every gameplay mutation — dragging a card, declaring an attacker, an
auto-pass — goes through **one** function: `ws::dispatch_action`.

```
client WS msg ─▶ ws::game_action ─▶ dispatch_action ─▶ game::apply(room, actor, action) ─▶ Applied
                                                                              │
                                                                              ▼
                              ws::dispatch_action fans `Applied` out to viewers
```

`game::apply` is a pure-ish function: it takes `&mut Room` + an `Action`,
validates it, mutates the room, and returns an `Applied` struct describing
everything that must be sent:

- `for_actor` / `for_others` — the per-viewer `room.event` delta (hidden info
  such as hand contents is already filtered per recipient).
- `log` / `extra_logs` — human-readable log lines.
- `extra_broadcasts` — whole-room messages, e.g. `combat.results`.
- `private` — per-user messages, e.g. `library.cards`, `cmd.choice`.
- `resync` — when set, everyone also gets a fresh filtered `room.state`.

`ws::dispatch_action` then delivers each of those. **Every room-scoped message
it sends is stamped with `roomId`** so a client that is a member of several
tables only applies the events for the table it is currently viewing (see
`room_send_all` and the `room.event`/`private` sends).

## State ownership

`App` (in `main.rs`) holds the shared, in-memory state behind `DashMap`s:
`rooms`, `conns` (user_id → live sockets), and `user_rooms` (who is seated
where). A room is locked individually (`rooms.get_mut(id)`); **never hold a
DashMap ref across an `.await`**.

Rooms are persisted to SQLite with a 2 s write-behind (`rooms::touch` marks a
room dirty; a flush task writes the full board JSON). On boot, `main.rs`
restores every persisted room so seats resume across restarts. Quick rooms
expire 24 h after all seats go offline; persistent lobbies after 30 idle days
(`rooms::sweeper`).

## Combat v3 (the locked declare → respond → resolve loop)

Combat is a small state machine layered on the freeform board. The **state**
lives on `Combat` (`rooms.rs`); the **transitions** are `Action` variants
handled in `game::apply`; the **resolution arithmetic** is `game/combat.rs`.

1. `combat.begin` — the active player opens combat.
2. `combat.attack` — declare an attacker (with a client-computed effective
   power/toughness, since the server has no card stats) and an optional
   `defenderSeat` (explicit only in 3+ player rooms).
3. `combat.lock` — freeze the declaration. After this no more attackers.
4. `combat.ready { prevent? }` — each targeted defender responds (declare
   blocks first, then ready). The **last** ready triggers `resolve_combat`,
   which applies life loss / blocker trades / deaths and broadcasts
   `combat.results`.

Invariant: a **locked** combat never stashes `room.last_combat` (it resolves
server-side); only the legacy un-locked flow does. Breaking this double-applies
damage.

## Testing

`playtest/` is a Node harness that speaks the real protocol over WebSocket. See
[testing.md](./testing.md). The quick loop:

```
cd playtest
node run-all.js          # seed + commander-pod + standard-duel + chaos-monkey + locked-combat
```

Point it at a non-default server with `PC_BASE=http://127.0.0.1:8798`.
