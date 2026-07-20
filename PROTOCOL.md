# PrettyCardboard protocol — REST + WebSocket contract

The server is Rust/axum (`server/`), listening on **http://127.0.0.1:8787** in dev.
All REST bodies are JSON. Authenticated routes take `Authorization: Bearer <token>`.
The client reads the base URL from `VITE_PC_SERVER` (default `http://127.0.0.1:8787`).

Identity is username-only and temporary: registering returns a bearer token the
client stores locally. No passwords; accounts become claimable later.

## REST

### Identity
- `POST /api/register` `{username}` → `201 {userId, username, token}`
  - username: 3–24 chars, `[a-zA-Z0-9_]`, unique case-insensitive. `409` if taken.
- `GET /api/me` → `{userId, username, createdAt}`
- `GET /api/users/search?q=<prefix>` → `[{userId, username, online}]` (max 20)

### Friends
- `GET /api/friends` → `{friends: [{userId, username, online, roomId?}], incoming: [{id, from: {userId, username}}], outgoing: [{id, to: {userId, username}}]}`
- `POST /api/friends/requests` `{toUserId}` → `201 {id}` (`409` if already friends/pending)
- `POST /api/friends/requests/{id}/accept` → `204`
- `POST /api/friends/requests/{id}/decline` → `204`
- `DELETE /api/friends/{userId}` → `204`

### Decks
Deck cards reference Scryfall ids; the server stores, never validates.
- `GET /api/decks` → `[{id, name, format, commander, cardCount, coverImageUrl, updatedAt}]`
- `GET /api/decks/{id}` → `{id, name, format, cards: [{scryfallId, name, quantity, board}]}`
  - `board` ∈ `commander | main | side`
- `POST /api/decks` `{name, format, cards}` → `201 {id}`
- `PUT /api/decks/{id}` `{name, format, cards}` → `200`
- `DELETE /api/decks/{id}` → `204`

### Rooms (lobby handshake; live play is WS)
- `POST /api/rooms` `{name, seats}` → `201 {roomId, code}` (seats 2–6; code = 6 chars A–Z0–9)
- `GET /api/rooms/{code}` → `{roomId, name, seats, players: [{userId, username}], started}`

## WebSocket `/api/ws?token=<token>`

JSON text frames, `{type, ...}` both directions. Server assigns a monotonically
increasing `seq` per room; clients apply events in order.

### Client → server
- `{type: "room.join", roomId, deckId?}` — take a seat (deckId loads that deck: library shuffled face-down, commanders to command zone)
- `{type: "room.spectate", roomId}` — read-only subscribe (never sees hands/libraries)
- `{type: "room.leave"}`
- `{type: "room.start"}` — host only; deals opening hands (7) to every seat
- `{type: "chat.send", text}`
- `{type: "invite.send", toUserId, roomId}`
- `{type: "game.action", action: Action}`

### Action (freeform table ops — server applies, never judges legality)
- `{kind: "card.move", iid, to: Zone, x?, y?, index?}` — zones: `library | hand | battlefield | graveyard | exile | command`. Moving to library: `index` 0 = top, -1 = bottom.
- `{kind: "card.pos", iid, x, y}` — battlefield drag (0..1 normalized within the seat's field)
- `{kind: "card.tap", iid, tapped}`
- `{kind: "card.face", iid, faceDown}`
- `{kind: "card.counter", iid, counter, delta}` — e.g. `+1/+1`, `loyalty`, `charge`
- `{kind: "token.create", name, imageUrl?, power?, toughness?, x, y}`
- `{kind: "token.clone", iid, x, y}`
- `{kind: "draw", count}`
- `{kind: "shuffle"}`
- `{kind: "mulligan"}` — hand → library, shuffle, draw 7
- `{kind: "untap.all"}`
- `{kind: "life.set", value}` / `{kind: "life.add", delta}`
- `{kind: "cmd.damage", fromSeat, delta}`
- `{kind: "poison.add", delta}`
- `{kind: "reveal.hand"}` — flip your hand public (until next draw)

### Server → client
- `{type: "welcome", userId}`
- `{type: "presence", userId, online, roomId?}` — friends only
- `{type: "invite", from: {userId, username}, roomId, roomName}`
- `{type: "room.state", state: RoomState}` — full snapshot on join/spectate/resync
- `{type: "room.event", seq, actor, action}` — the applied action, rebroadcast (with server-filled fields, e.g. drawn card details go only to the drawer)
- `{type: "chat", from: {userId, username}, text, ts}`
- `{type: "log", seq, text, ts}` — human-readable action log line
- `{type: "error", code, message}`

### RoomState (per viewer — hidden info filtered server-side)
```jsonc
{
  "roomId": "...", "name": "...", "code": "ABC123", "seats": 4, "started": true,
  "hostUserId": "...",
  "players": [{
    "userId": "...", "username": "...", "seat": 0, "life": 40, "poison": 0,
    "cmdDamage": {"1": 6},           // by seat
    "handCount": 5,                  // always
    "hand": [CardInst],              // ONLY for the viewer's own seat
    "libraryCount": 87,
    "battlefield": [CardInst], "graveyard": [CardInst], "exile": [CardInst], "command": [CardInst]
  }],
  "spectators": [{"userId", "username"}]
}
```
`CardInst`: `{iid, scryfallId?, name, imageUrl, tapped, faceDown, counters: {}, x, y, isToken, power?, toughness?}`

## Server internals (implementation notes)
- SQLite (rusqlite, bundled) at `server/data/pc.db`: `users`, `friend_requests`, `friendships`, `decks` (cards as JSON column).
- Rooms live in-memory (`DashMap<RoomId, Room>`); library order + hands are server-side only — this is why the server is authoritative.
- Log lines are generated server-side per action ("Matt draws 2 cards", "Terra, Herald of Hope attacks — tapped").
- Presence: userId → set of WS connections; on change, notify friends.
- CORS: allow any localhost origin + `tauri://localhost`.

## Persistence addendum (2026-07-18)

Rooms survive server restarts: the full table state (seats, hands, libraries,
battlefield positions, life, counters) is serialized to SQLite on every applied
action (write-behind, flushed within ~2s) and reloaded into memory at boot with
every player marked offline. Reconnecting players resume their seats exactly as
before.

### REST changes
- `POST /api/rooms` body gains `persistent?: boolean` (default false). A
  persistent room is a long-lived lobby.
- `GET /api/rooms/mine` → rooms where the caller holds a seat:
  `[{roomId, code, name, seats, persistent, started, updatedAt,
     players: [{userId, username, online}]}]`, newest activity first.
- `DELETE /api/rooms/{id}` → 204. Host only. Ends the table for everyone;
  each seated user's live sockets receive `{type: "room.closed", roomId}`.

### WS changes
- `{type: "decks.changed"}` — pushed to all of a user's OTHER connections when
  any of their decks is created, updated, or deleted (multi-device sync; the
  originating connection is skipped when the REST call carries the
  `X-PC-Conn` header with that connection's id; without it, push to all).
  Simplification allowed: pushing to ALL connections including the originator
  is acceptable; the client treats it as a cheap refresh signal.
- `{type: "room.closed", roomId}` — the table was ended by its host (or
  expired); clients seated there clear their game state.

### Lifecycle
- Quick (non-persistent) rooms: deleted once every seat has been offline for
  24 hours.
- Persistent lobbies: deleted after 30 days without any action.
- Explicit `room.leave` still abandons the seat and removes that player's
  cards (unchanged); disconnecting keeps the seat for resume (unchanged).

## Gameplay v2 addendum (2026-07-18) — turns, phases, combat, tools

Everything below stays freeform: the server structures and records, never
judges legality. All new actions rebroadcast as `room.event` + a `log` line,
and hidden-info rules from v1 apply unchanged.

### Room format
- `POST /api/rooms` body gains `format?: "commander" | "standard"` (default
  `"commander"`). Sets starting life (40 / 20), first-turn draw skip (2-player
  and standard: the starting seat skips its first draw; 3+ seat commander: no
  skip), and whether command-zone machinery is active.
- RoomState gains: `format`, `turnNumber` (1-based), `activeSeat`,
  `phase` ("upkeep" | "main1" | "attack" | "block" | "damage" | "main2" | "end"),
  `autoTurn` (bool, default true), `stack: [CardInst]` (shared, ordered),
  `combat: {attackers: {iid, defenderSeat?}[], blocks: {blockerIid, attackerIid}[]} | null`,
  `markers: {monarch?: seat, initiative?: seat, dayNight?: "day"|"night", storm?: number}`,
  and per-player: `commanderTax: {iid: number}`, `mulligan: {state: "deciding"|"kept", taken: number} | null`,
  `lands?: [CardInst]` is NOT a zone (lands-row is client-side layout).

### New actions (client -> server, inside game.action)
Turn + phase:
- `{kind: "turn.pass"}` — advance to next occupied seat clockwise; increments
  turnNumber when wrapping to the first seat; when `autoTurn`, the server
  untaps the incoming player's battlefield and draws 1 (respecting the
  first-turn skip rule and drawing nothing for a seat with an empty library),
  then sets phase to "main1" (upkeep/draw are collapsed into the pass).
- `{kind: "turn.set", seat}` — hand the turn to ANY seat (extra turns); same
  auto behavior, turnNumber increments only on wrap-past-start.
- `{kind: "phase.set", phase}` — move the ribbon (any direction, logged).
- `{kind: "turn.auto", enabled}` — host toggles autoTurn.

Stack:
- `{kind: "stack.push", iid}` — move a card (from hand/battlefield/anywhere
  visible) to the shared stack (top). Hidden-zone sources reveal the card.
- `{kind: "stack.resolve", iid, to, x?, y?}` — pop to a destination zone.
- `{kind: "stack.counter", iid, to}` — same, but logs "countered" (to usually
  graveyard).

Guided combat (unenforced, inform-only bookkeeping). The server NEVER resolves
damage: `combat` is a lightweight public overlay of who attacks whom and which
creatures block which attackers. Players read it to see incoming attacks, then
adjust life and move dead creatures BY HAND (the client offers a one-click
"take unblocked damage" helper that just dispatches `life.add`). There is no
lock/ready/prevent, no auto-resolution, and no `combat.results` message.
- `{kind: "combat.begin"}` — phase -> "attack", empty combat block created.
- `{kind: "combat.attack", iid, defenderSeat?, power?, toughness?}` — toggle a
  creature as attacker (auto-taps it unless already tapped). `defenderSeat`
  omitted is an open swing every opponent sees. `power`/`toughness` are the
  attacker's client-declared effective values (strings), shown to defenders.
- `{kind: "combat.block", blockerIid, attackerIid, power?, toughness?}` —
  toggle a block pairing; requires `attackerIid` to be a declared attacker.
- `{kind: "combat.end"}` — clears the overlay, phase -> "main2". Combat also
  clears automatically on turn change.

Commander:
- `{kind: "cmd.cast", iid, x, y}` — command zone -> battlefield; increments
  that commander's tax counter AFTER the cast (tax shown = 2 x prior casts).
- On any `card.move` that takes a commander OFF the battlefield the server
  asks the owner via a new per-viewer message `{type: "cmd.choice", iid, to}`;
  the owner answers `{kind: "cmd.return", iid, accept: bool}` — accept sends
  it to the command zone instead of `to`. (Commanders are flagged server-side
  from the deck's commander board; partners both flagged.)

Counters, dice, markers:
- `card.counter` is unchanged but `counter` is free-text now (client offers a
  palette). New: `{kind: "dice.roll", sides: 6|20|2, count?}` — server rolls,
  logs "Matt rolls d20: 17" (2 = coin: Heads/Tails).
- `{kind: "marker.set", marker: "monarch"|"initiative", seat}` /
  `{kind: "marker.day", value: "day"|"night"|null}` /
  `{kind: "marker.storm", delta}`.

Zone viewers (all logged; server filters what each viewer may see):
- `{kind: "library.peek", count}` — top N of YOUR library, per-viewer reply
  `{type: "library.cards", iid-list with details}`; logs "X looks at top 3".
- `{kind: "library.reorder", iids}` — reorder the peeked cards (scry).
- `{kind: "library.bottom", iids}` — send peeked cards to bottom.
- `{kind: "library.search"}` — reply with the FULL library (yours only),
  logs "X searches their library" (pair with shuffle afterward).
- `{kind: "library.reveal", count}` — reveal top N to the whole table.
- Graveyard/exile are public: full contents already in RoomState.

Attach / stacking:
- `{kind: "card.attach", iid, hostIid}` — attach iid to a host battlefield
  card (CardInst gains `attachedTo?: iid`); detach with hostIid null. Attached
  cards render tucked under their host and move with it.

Mulligan (game start):
- `room.start` now puts every seated player in `mulligan: {state: "deciding",
  taken: 0}` after dealing 7.
- `{kind: "mull.take"}` — reshuffle hand, draw 7, taken += 1.
- `{kind: "mull.keep", bottomIids}` — bottom N cards where
  N = max(0, taken - freeFirst) (freeFirst = 1 in 3+ player commander and any
  Brawl, 0 in 1v1 standard), then state -> "kept". Game phase work begins when
  all seats are kept.

Undo:
- Server keeps each player's last simple action (card.move / card.pos /
  card.tap / card.face / card.counter / token.create / card.attach) for 10s.
- `{kind: "undo"}` — revert it if present and still valid; logs "X undoes ...".

### CardInst additions
`attachedTo?: string`, `isCommander?: bool`, `revealed?: bool` (temporarily
public while on the stack from a hidden zone).

## Match end addendum (2026-07-18)

Concessions, match results, and the post-match social layer (endorsements +
deck salt ratings + aggregate stats).

### Concede (game action)

- `{ "kind": "concede" }` — marks the actor as out of the game. Allowed only
  after start; errors: `not_started`, `already_conceded`, `match_over`.
- A conceded player keeps their seat, zones, and board (nothing moves); they
  are skipped by turn order (`turn.pass` wrap, `turn.set` to a conceded seat
  errors `conceded`). If the active player concedes, the turn advances
  immediately (with auto-turn untap/draw for the inheritor).
- RoomState players gain `"conceded": <bool>` and `"deckName": <string|null>`
  (the deck the seat was taken with, snapshotted at join).

### Match result

- When exactly one non-conceded player remains in a started game that began
  with >= 2 seats (concede or leaving a quick table both count), the server
  freezes the match: RoomState gains a top-level `"matchResult"`:

  ```json
  {
    "matchId": "…", "winnerUserId": "…", "winnerUsername": "…",
    "turns": 12, "durationMs": 1830000, "endedAt": 1750000000000,
    "ranked": true,
    "players": [{
      "userId": "…", "username": "…", "seat": 0, "isBot": false,
      "conceded": true, "turnsTaken": 6, "avgTurnMs": 95000,
      "deckId": "…", "deckName": "…", "life": 31
    }]
  }
  ```

- `matchResult` is null until then and never clears for the life of the room.
  A log line `"<winner> wins the match"` is broadcast alongside the resync.
  Once set, ALL further game actions error `match_over` (the board freezes).
- Turn timing: the server clocks the active seat from game start and from
  every turn handoff; `avgTurnMs` = active time / turns begun. The mulligan
  window is nobody's turn time: the active player's clock restarts when the
  last keep (or a window-closing concede) lands.
- `ranked` = at least 2 human seats, >= 3 turn rounds, and >= 2 minutes of
  play. Only ranked results are persisted server-side (`matches` +
  `match_players`) and feed the aggregate stats below; unranked results
  still render the popup but mint no rows, so endorse/salt reject with
  `not_in_match`. Mid-game leavers of quick tables are recorded as conceded
  losers (snapshotted at departure) even though they left `players`.

### REST (all Bearer-authed)

- `POST /api/matches/{matchId}/endorse` `{ "toUserId": "…" }` — endorse a
  fellow participant (good sport, fun deck, whatever). One per
  (match, rater, target); repeats are no-ops. 204. Errors: `self_endorse`,
  `not_in_match`, `player_not_in_match`.
- `POST /api/matches/{matchId}/salt` `{ "deckId": "…", "salt": 1-5 }` — rate
  how salty another participant's deck made you; re-rating within the match
  replaces the value. 204. Errors: `bad_salt`, `not_in_match`,
  `deck_not_in_match`, `self_salt`.
- `GET /api/matches/{matchId}/stats` — per-participant aggregates:

  ```json
  { "players": [{
      "userId": "…", "username": "…", "seat": 0, "isBot": false,
      "deckId": "…", "deckName": "…", "won": true, "conceded": false,
      "turnsTaken": 9, "avgTurnMs": 88000,
      "wins": 4, "losses": 2, "endorsements": 7, "allTimeAvgTurnMs": 91000,
      "deck": { "wins": 3, "losses": 1, "salt": 2.5, "saltCount": 4 },
      "myEndorsed": false, "mySalt": null
  }] }
  ```

  `deck` is null for deckless seats. `myEndorsed`/`mySalt` are the caller's
  own submissions for this match.
- Seats record `deckId` + a `deckName` snapshot at join time, so results
  survive later deck renames/deletes.

## Undo / redo / replay addendum (2026-07-20)

Whole-match undo/redo and read-only replay scrubbing, built on a per-room
in-memory **snapshot timeline** (not event-sourcing): every mutating action
records a full game-state snapshot, so any point is restored by re-loading a
snapshot (correct by construction for shuffles, hidden draws, and combat — no
inverse-patching or RNG re-rolling). Live-only: the timeline is serde-skipped,
so it is not persisted and resets on server restart (like the old single-slot
undo it replaces). Capped at 400 snapshots per room (oldest dropped).

### Game actions (client -> server, inside `game.action`)
- `{ kind: 'undo' }` — move the shared cursor back one, restoring that state.
  Errors: `undo_stale` (nothing to undo), `not_your_action`.
- `{ kind: 'redo' }` — move the cursor forward one. Errors: `redo_stale`,
  `not_your_action`.
- `{ kind: 'rewintTo', index }` *(sic: `rewindTo`)* — host-only destructive jump
  to any timeline index; discards everyone's later moves. Errors: `forbidden`,
  `bad_rewind`.

Permission: undo/redo are allowed to the **host** or the **player who made the
move being undone/redone** (owns-the-move policy). A new action taken after an
undo truncates the redo tail (single linear branch). All three resync via
`room.state` (hidden-info safe) and are rejected once the match is frozen.

### Replay scrubbing (viewer-local, read-only)
- Client -> server: `{ type: 'replay.seek', index }` — top-level message, NOT a
  game action; never mutates the room or the shared cursor.
- Server -> client (only to the requesting connection):
  `{ type: 'replay.frame', roomId, index, head, state }` — `state` is
  `state_for(viewer)` at that historical snapshot, so hidden zones stay filtered
  at any past point.
- Entering/exiting replay is purely client-side (show the frame vs. the live
  board); the board is read-only while scrubbing.

### Undo affordance (server -> client)
- `{ type: 'undo.state', roomId, canUndo, canRedo, cursor, head, host }` — pushed
  per seated player after every action (and on game start). `canUndo`/`canRedo`
  are computed per-viewer under the owns-the-move-or-host policy and are false
  once the match is frozen; `head` = timeline length, `cursor` = current index.

RoomState is unchanged. Undo/redo/replay all reuse the existing full-state
resync path, so no per-action inverse deltas exist on the wire.

## Multi-game addendum (`mtg` | `cyberpunk`)

The engine is game-agnostic (it moves cards between zones and never judges
legality), so a "game" is defined by presentation + defaults, not new engine
rules. A `game` field tags rooms and decks; the client reads it to relabel
zones, pick vitals, hide phases, and resolve card art. Default `"mtg"`, so every
pre-multigame room/deck/snapshot reads back unchanged.

- `POST /api/rooms` body gains `game?: "mtg" | "cyberpunk"` (default `mtg`).
  Cyberpunk rooms are forced to `format: "standard"`.
- `POST /api/decks` / `PUT` body gains `game?`; `GET /api/decks` items gain
  `game` + `coverCardId` (Cyberpunk art is client-resolved from the id, so
  `coverImageUrl` is null for Cyberpunk).
- `RoomState` gains `game`.
- Starting vitals are game-driven: MTG `life` 40/20 + `poison`; Cyberpunk reuses
  the `life`/`poison` slots as **Net** + **RAM** counters, both starting at 0.
- Zones map onto the same six physical slots; Cyberpunk relabels them
  Deck / Hand / In-Play / Trash / Eddies / Legend (the Legend rides the
  `commander` board slot, so it deals into the command zone without MTG tax).
- Cyberpunk cards carry a bundled art path in `imageUrl`
  (`/cache/cyberpunk/<id>.webp`); MTG still sends `imageUrl: null` and the client
  resolves Scryfall from the id. Card identity for Cyberpunk is the Netdeck UUID,
  stored in the same `scryfallId` slot.
