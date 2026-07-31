# PrettyCardboard protocol — REST + WebSocket contract

The server is Rust/axum (`server/`), listening on **http://127.0.0.1:8787** in dev.
All REST bodies are JSON. Authenticated routes take `Authorization: Bearer <token>`.
The client reads the base URL from `VITE_PC_SERVER` (default `http://127.0.0.1:8787`).

Identity is username/password based: registering or logging in returns a bearer
token the client stores locally.

## REST

### Identity
- `POST /api/register` `{username, password}` → `201 {userId, username, token}`
  - username: 3–24 chars, `[a-zA-Z0-9_]`, unique case-insensitive. `409` if taken.
- `POST /api/login` `{username, password}` → `200 {userId, username, token}`
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
- `GET /api/decks` → `[{id, name, format, commander, cardCount, bracket, coverImageUrl, updatedAt}]`
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
- `{type: "room.ready", ready}` — seated player only; a deck is required to become ready
- `{type: "room.deck.set", deckId}` — switch to another owned deck for this game; clears readiness
- `{type: "room.start"}` — host only; requires every seated player online, decked, and ready, then deals opening hands
- `{type: "room.ping", targetUserId}` — seated player nudges another online seat; delivered only to sender and recipient, rate-limited to once per sender every 3 seconds
- `{type: "room.hand.hover", position}` — seated player only; ephemeral normalized hand position (`0..1`), or `null` when leaving the hand
- `{type: "chat.send", text}`
- `{type: "invite.send", toUserId, roomId}`
- `{type: "game.action", action: Action}`

### Action (freeform table ops — server applies, never judges legality)
- `{kind: "card.move", iid, to: Zone, x?, y?, index?, faceDown?}` — zones: `library | hand | battlefield | graveyard | exile | command`. Moving to library: `index` 0 = top, -1 = bottom. `faceDown` (battlefield only) lands the card hidden in the same act — a Yu-Gi-Oh Set. The card's identity is never broadcast: other seats get no `card` payload, the log says "sets a card face-down", and they are resynced from the masked snapshot.
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
- `{kind: "mana.add", color, delta}` — color is `W | U | B | R | G | C`; clamped to 0–999
- `{kind: "mana.clear"}` — clear the actor's floating mana pool
- `{kind: "reveal.hand"}` — flip your hand public (until next draw)

### Server → client
- `{type: "welcome", userId}`
- `{type: "presence", userId, online, roomId?}` — friends only
- `{type: "invite", from: {userId, username}, roomId, roomName}`
- `{type: "room.state", state: RoomState}` — full snapshot on join/spectate/resync
- `{type: "room.ping", from: {userId, username}, to: {userId, username}, ts, roomId}` — ephemeral targeted alert delivered only to sender and recipient
- `{type: "room.hand.hover", fromUserId, position, roomId}` — ephemeral hand-browsing motion; contains no card identity or contents and is never persisted
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
    "userId": "...", "username": "...", "seat": 0,
    "ready": true, "online": true, "life": 40, "poison": 0,
    "mana": {"W": 2, "U": 0, "B": 0, "R": 0, "G": 0, "C": 1},
    "deckName": "Terra, Herald of Hope",
    "deckId": "...",                 // ONLY for the viewer's own seat
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

Readiness, online state, deck names, and mana pools are public to seated players
and spectators. Only the authenticated seat may change its own readiness, deck,
or mana. Disconnecting clears that seat's readiness; reconnecting resumes the
same seat as unready. Spectators cannot ready, select decks, start, or send game
actions.

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
- `POST /api/rooms` body gains `format?` (default `"commander"`), one of the
  preset ids `commander | brawl | standard | pioneer | modern | legacy |
  vintage | pauper | freeform`. The preset sets starting life (commander 40,
  brawl 25, everything else 20 — the host's `startingLife` setting still
  overrides), the first-turn draw skip (2-player and non-commander formats:
  the starting seat skips its first draw; 3+ seat commander/brawl: no skip),
  and whether command-zone machinery (tax, cmd damage, return prompts) is
  active (`commander` and `brawl`).
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
- `{kind: "cmd.tax", iid, delta}` — manually adjust a commander's tax (e.g.
  "Reduce tax" undo). Self-only, clamped at 0, and only for iids that already
  have tax; the entry is removed when it reaches 0.
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

Table markers and pointing arrows (2026-07-30) — the shared "look at this"
layer, deliberately split in two:

- **Markers are table state.** `{kind: "mark.set", iid, mark: "skull"|"sword"|
  "shield"|"star"|"eye"|"flame"|"ban"|"question"|null}` parks a marker on a
  card (`mark: null` lifts it); `{kind: "mark.clear"}` sweeps them all.
  Anyone at the table may mark anyone's card. They ride in `room.state` as
  `marks: {<iid>: {kind, by, seat, username, ts}}`, so they survive a
  reconnect, reach every spectator, and a late joiner inherits the annotated
  board. The client colours each puck by the placing SEAT (the same palette
  as that player's cursor and arrows). A marker is dropped automatically when
  its card leaves the battlefield, including combat deaths. Refusals:
  `card_not_found` (no such card at the table), `bad_mark` (empty or >24
  chars), `too_many_marks` (128 cap), `no_marks` (clearing a clean table).
- **Arrows are ephemeral.** The `aim` relay is unchanged in shape but now
  carries `fromSeat` so every arrow can wear its sender's colour (plus
  `ward` in enforced rooms, see below). Nothing about an aim is stored:
  it is broadcast to every player AND spectator and forgotten. The client
  draws one arrow per sender - source card → target card or seat - and
  expires it after ~4s. When the source is not on screen (the staged view
  shows one board), the arrow arrives from the table edge rather than
  vanishing, because a ring with no visible origin tells you nothing about
  who is pointing.

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
- `{kind: "card.attach", iid, hostIid, piled?}` — attach iid to a host
  battlefield card (CardInst gains `attachedTo?: iid`); detach with hostIid
  null. Attached cards render tucked under their host and move with it.
- `piled: true` makes it a PILE member instead of an aura (CardInst gains
  `piled?: bool`, absent = false = an aura): the card squares up UNDER its base
  and the group renders as one object with a count, the way stacked lands do on
  a real table. The base must be on YOUR battlefield (`bad_pile`) — unlike an
  aura, which may sit on an opponent's creature. A piled card is never a host: a
  drop aimed at one resolves to its base (one hop, never nested). Board order is
  pile order, so a joining card moves to the end of its owner's battlefield and
  the last member is the top of the pile. Detaching a member (hostIid null)
  lands it beside its base. When a pile's base leaves the battlefield the top
  member is promoted to base at the leaver's position and the rest re-point to
  it, so a pile survives its base. Same relation, so a pile travels with its
  base, resyncs, and is undoable exactly like an attachment. Unrelated to the
  shared spell `stack`. NOT a tap group: tapping a pile taps only its base.

Mulligan (game start):
- `room.start` now puts every seated player in `mulligan: {state: "deciding",
  taken: 0}` after dealing 7.
- `{kind: "mull.take"}` — reshuffle hand, draw 7, taken += 1.
- `{kind: "mull.keep", bottomIids}` — bottom N cards where
  N = max(0, taken - freeFirst) (freeFirst = 1 in 3+ player commander and any
  Brawl, 0 in 1v1 standard), then state -> "kept".
- Game settings gain `unlimitedMulligans?: bool`. It beats `freeMulligans`
  outright: every mulligan is free, so a London keep bottoms nothing and a
  Vancouver redraw never shrinks, however many you take. Game phase work begins when
  all seats are kept.

Undo:
- Server keeps each player's last simple action (card.move / card.pos /
  card.tap / card.face / card.counter / token.create / card.attach) for 10s.
- `{kind: "undo"}` — revert it if present and still valid; logs "X undoes ...".

### CardInst additions
`attachedTo?: string`, `piled?: bool` (that attachment is a pile member, not an
aura; only ever sent alongside `attachedTo`), `isCommander?: bool`, `revealed?:
bool` (temporarily public while on the stack from a hidden zone).

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
      "cardsPlayed": 14, "cardsDrawn": 11, "peakBattlefield": 8,
      "deckId": "…", "deckName": "…", "life": 31
    }]
  }
  ```

- `matchResult` is null until then and never clears for the life of the room.
  A log line `"<winner> wins the match"` is broadcast alongside the resync.
  Once set, ALL further game actions error `match_over` (the board freezes).
- Turn timing: the server credits time only when the active player interacts.
  Each silent gap contributes at most 30 seconds, so an abandoned tab cannot
  dominate the average; frequent interactions still accumulate real active
  time. `avgTurnMs` = credited active time / turns begun. The mulligan window is
  nobody's turn time: the clock restarts when the last keep lands.
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
      "cardsPlayed": 20, "cardsDrawn": 13, "peakBattlefield": 9,
      "wins": 4, "losses": 2, "endorsements": 7, "allTimeAvgTurnMs": 91000,
      "deck": { "wins": 3, "losses": 1, "salt": 2.5, "saltCount": 4,
        "avgCardsPerTurn": 2.2, "avgCardsDrawn": 12.4, "avgPeakBattlefield": 8.1 },
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

## Multi-game addendum (`mtg` | `cyberpunk` | `yugioh`)

The engine is game-agnostic (it moves cards between zones and never judges
legality), so a "game" is defined by presentation + defaults, not new engine
rules. A `game` field tags rooms and decks; the client reads it to relabel
zones, pick vitals, hide phases, and resolve card art. Default `"mtg"`, so every
pre-multigame room/deck/snapshot reads back unchanged.

- `POST /api/rooms` body gains `game?: "mtg" | "cyberpunk" | "yugioh"` (default
  `mtg`). Cyberpunk and Yu-Gi-Oh rooms are forced to `format: "standard"`
  (which also keeps the commander machinery off).
- `POST /api/decks` / `PUT` body gains `game?`; `GET /api/decks` items gain
  `game` + `coverCardId` (Cyberpunk/Yu-Gi-Oh art is client-resolved from the
  id, so `coverImageUrl` is null for both).
- `RoomState` gains `game`.
- Starting vitals are game-driven: MTG `life` 40/20 + `poison`; Cyberpunk reuses
  the `life`/`poison` slots as **Net** + **RAM** counters, both starting at 0;
  Yu-Gi-Oh starts `life` at **8000 LP** (host override clamp widens to 99999
  for it) and leaves `poison` unused. Yu-Gi-Oh deals 5-card opening hands and
  has NO mulligan flow: seats are dealt already `kept`, so the first turn
  begins with the deal.
- Zones map onto the same six physical slots; Cyberpunk relabels them
  Deck / Hand / In-Play / Trash / Eddies / Legend (the Legend rides the
  `commander` board slot, so it deals into the command zone without MTG tax);
  Yu-Gi-Oh relabels them Deck / Hand / Field / Graveyard / Banished /
  **Extra Deck** (the Extra Deck rides the `commander` board slot, with the
  `side` board as the Side Deck). Extra Deck contents are hidden information
  to everyone but their owner: snapshots mask command-zone cards (identity
  stripped, `faceDown: true`) for every other viewer, while the owner sees
  them face-up and plays them with ordinary `card.move`. The command zone
  counts as a HIDDEN zone for yugioh events too, so moves in and out of it are
  logged as "a card" and never carry the identity to other seats.
- The Yu-Gi-Oh field is a printed 7x3 zone grid (Extra Monster / Field /
  Monster / Spell & Trap, with Banished, Graveyard, Deck and Extra Deck in
  their own cells). It is a CLIENT concern only — the server stays freeform and
  stores whatever normalized x/y it is sent; the client snaps drops to the
  nearest cell center (`src/app/pages/table/yugiohZones.tsx`).
- Cyberpunk cards carry a bundled art path in `imageUrl`
  (`/cache/cyberpunk/<id>.webp`); MTG and Yu-Gi-Oh send `imageUrl: null` and
  the client resolves art from the id (Scryfall CDN for MTG; for Yu-Gi-Oh the
  bundled starter cache, else `GET /api/ygo/img/{passcode}.jpg` — a public
  server endpoint that fetches a face from YGOPRODeck's CDN once, caches it on
  disk, and serves it thereafter, since YGOPRODeck forbids client hotlinking).
  Card identity is the Netdeck UUID for Cyberpunk and the YGOPRODeck passcode
  (unpadded decimal string, e.g. `"46986414"`) for Yu-Gi-Oh, both stored in
  the same `scryfallId` slot.

## Mat layout addendum (2026-07-24)

Per-seat zone-pile placement (the "mat editor"), following the per-seat
cosmetic-setting pattern (not a game action: no undo/timeline churn).

- Client -> server: `{type: "matlayout.set", layout: {<zone>: {x, y}, ...}}` —
  seated players only. Keys are the logical zone ids
  `library | graveyard | exile | command`; values are the pile's normalized
  center (0..1) within the seat's board. The server whitelists keys, clamps
  coordinates, stores the map on the player, and rebroadcasts full state.
  An empty map resets to the default strip layout.
- Each player in `RoomState` gains `matLayout` (same shape; empty = default).
  Every viewer renders that seat's piles at the custom spots; the staged
  mirrored opponent view rotates the overlay 180°, so (x, y) reads as
  (1-x, 1-y) across the table.

## Custom playmats + matchup metrics addendum (2026-07-24)

- `POST /api/playmat` (Bearer) — body is raw PNG/JPEG/WebP bytes (≤8MB, magic-
  byte sniffed). Stores ONE custom mat per account (re-upload replaces) and
  returns `{id: "custom-<file>", url: "/api/mats/<file>"}`. The id flows
  through the normal playmat preference + `playmat.set` sync; `playmat.set`
  accepts `custom-<file>` ids that name an existing stored mat.
- `GET /api/mats/{file}` — public (CSS url() can't send auth); serves the
  stored image with immutable caching. Filenames are per-upload unique.
- `GET /api/me` carries `customPlaymats`: every `custom-<file>` id this account
  has uploaded, newest first, plus `customPlaymat` (the newest) for anything
  that wants just one. Uploads ACCUMULATE - a mat belongs to the deck that
  chose it, so a new upload never replaces another deck's - capped at 16 per
  account on top of the store-wide cap.
- `DELETE /api/playmat/{file}` (Bearer) — remove one upload. The filename
  carries its owner, so naming a file that is not yours is a `bad_mat`. Decks
  still pointing at it fall back to the player's own mat, exactly as a deck
  with no mat of its own does, so nothing is rewritten.
- Historically `customPlaymat` was singular. The id is a property of the ACCOUNT (one file per
  user on the server's disk), not of the browser that uploaded it - signing in
  elsewhere adopts it, and an id left over from a replaced upload is corrected
  rather than painting a mat that no longer exists.
- A DECK may also carry its own CARD BACK: the same body/response fields gain
  `cardBack?: string | null`, applied to `Player.cardBack` at `room.join` and
  `room.deck.set` exactly like `playmat`, and relayed unvalidated like
  `cardback.set` (back ids are client asset names). Every seat paints its own
  back, so a table shows as many backs as it has players, and a change
  broadcasts through the usual room state push.
- A DECK may carry its own mat: `POST /api/decks` / `PUT /api/decks/{id}` body
  gains `playmat?: string | null` and `GET /api/decks` items + `GET
  /api/decks/{id}` gain `playmat`. When a seat takes that deck (at `room.join`,
  and again on `room.deck.set`) the server copies it onto `Player.playmat`,
  validated exactly like `playmat.set` (bundled id, or a `custom-` file the
  actor owns). A deck without one leaves the seat alone, so the player's global
  preference lands on it as before - and the client suppresses its own
  `playmat.set` while the seated deck has a mat, or every unrelated preference
  change would overwrite it.
- `GET /api/users/{id}/stats` (Bearer) — any player's all-time aggregates,
  same shape as `/api/me/stats`; unknown ids return zeros. Both now also carry
  `salt` + `saltCount`: how salty that player's DECKS have felt to the tables
  they sat at (1-5, `0`/`0` when nothing of theirs has been rated), aggregated
  one-vote-per-rater across every deck they own. Salt rates a deck, never a
  person, and rater identity is never exposed - clients must word it that way
  and should hide it at `saltCount <= 1`, where a duel identifies its rater.
- `GET /api/me/decks/stats` (Bearer) — SELF ONLY. One row per deck you have
  actually played: `{deckId, name, wins, losses, played, lastPlayedAt, salt,
  saltCount, endorsements}`. `endorsements` is endorsements you earned while
  playing that deck (endorsements name a player; `match_players` says which
  deck they had), not endorsements of the deck. Bots excluded. There is no
  other-user equivalent: a deck-by-deck salt breakdown of someone else would
  publish deck names no endpoint otherwise exposes.
- Client -> server `{type: "deckmeta.set", meta}` — seated players push a
  small client-computed public metrics blob for their current deck (colors /
  curve / type counts; the server stores decks as bare card ids and cannot
  derive these). Object-only, clamped to 2KB, cleared on `room.deck.set`.
  Each player in `RoomState` gains `deckMeta` (public to all viewers). The blob
  also carries `cover`: the deck's cover-card id, so the lobby can show every
  seat the deck it is sitting behind. The card LIST stays private - only its
  face and the aggregates are public.
- `library.reveal`'s `room.event` payload has always carried the full `cards`
  array to every viewer INCLUDING spectators; clients now render it as a
  fanned reveal tray (dismiss is viewer-local; reveals are never in
  `room.state`). Taking a card out of a peek window (`card.move` by iid from
  the library) now shrinks the window instead of clearing it, so
  `library.reorder` / `library.bottom` keep working on the rest.

## Card collection addendum (2026-07-29) — pulls, binder, pull feed

Every pack opened anywhere in the app (the boosters page and the floating pack
dock) is recorded against the account. The SERVER owns the collection and the
single notability rule (`server/src/collection.rs::is_notable`): clients report
what they opened and celebrate what comes back, they never judge a card
themselves.

- `POST /api/collection/pulls` (Bearer) — body is a BARE ARRAY, 1..=400 of
  `{scryfallId, name, setCode, rarity, foil?, released?}`. `released` is the
  SET's release date (`YYYY-MM-DD`, Scryfall's `set.released_at`); without it a
  pre-1995 rare cannot be judged notable. `setCode` and `rarity` are lowercased
  server-side so per-set tallies cannot split on casing. Replies
  `{new, notable, total, pulls}` where `new` and `notable` are arrays of
  `{scryfallId, name, setCode, rarity, foil, notable, new}` — `new` is only the
  printings this account had never owned (what to celebrate), `notable` is every
  notable card in the batch, new or repeat (what hit the feed). `total` is
  distinct printings owned after the batch (a foil counts as its own printing),
  `pulls` is lifetime cards pulled. Errors: `no_cards`, `too_many_cards`.
- `GET /api/collection[?set=CODE]` (Bearer) — `{total, pulls, sets, cards, set}`.
  `sets` is ALWAYS every set (`{setCode, owned, pulls, foils}`, owned desc) so a
  set switcher stays populated under a filter; `cards` is filtered by `set`
  (case-insensitive) and ordered `firstPulledAt` desc then name, each
  `{scryfallId, name, setCode, rarity, foil, firstPulledAt (unix ms), pullCount}`.
  A card owned in both finishes appears TWICE with the same `scryfallId` — key
  lists on `scryfallId + foil`.
- `GET /api/collection/feed[?limit=N]` (Bearer, default 50, clamped 1..=200) —
  a BARE ARRAY, newest first, covering the caller AND their accepted friends:
  `{id, userId, username, scryfallId, name, setCode, rarity, foil, ts, mine}`.
  The feed records an EVENT, so cracking the same notable card twice yields two
  rows. Retention is per user: newest 200, nothing older than 30 days.
- Client -> server `{type: "pull.notify", scryfallId, name, setCode, rarity,
  foil?}` — "look what I just cracked". Requires the sender to be in a room as a
  player or a spectator (otherwise `{"type":"error","code":"not_in_room"}`), and
  should only be sent for cards the pulls response flagged `notable`.
- Server -> client `{type: "pull", roomId, fromUserId, username, seat, scryfallId,
  name, setCode, rarity, foil, ts}` — relayed to every player and spectator of
  the room, including the sender. `seat` is null when the sender is spectating.
  The server relays notability rather than re-deriving it: the message carries no
  release date.
- `GET /api/decks` items carry `bracket: {bracket: 2|3|4, gameChangers: string[]}
  | null` — the deck's estimated Commander bracket and the Game Changer cards
  behind it. `null` wherever the bracket system does not apply (Cyberpunk decks,
  any non-Commander format), so a client can tell "no bracket" from "bracket 2"
  and show nothing at all rather than a placeholder. The server derives it
  because it already holds the cards; sending every deck's full card list just so
  the browser could count names would add tens of KB to this payload. Both sides
  read ONE list — `src/data/gamechangers.json`, the official 53-card Scryfall
  `is:gamechanger` sync — matching names case-insensitively including the front
  face of a `A // B` split/double-faced entry. 0 Game Changers = bracket 2, 1-3 =
  3, 4+ = 4; brackets 1 and 5 are social calls a card list cannot make, so the
  estimate never claims them and clients must label it an estimate.

## Bots addendum (v3, 2026-07-30) — AI opponents

Server-resident heuristic opponents. A bot is an ordinary `Player` driven by
the server itself (`server/src/bot.rs`); it acts exclusively through the same
`game.action` pipeline as a human, so every rule in this document applies to
bots unchanged. Bots also TALK: they announce their plays in the room chat
using the ordinary `chat` frame.

### Seating

- `{ "type": "bot.add", "deckCode"?: "FIC-<n>"|"random", "style"?:
  "casual"|"aggro"|"defensive" }` — host only, room not started, MTG tables
  only, at least one free seat. Seats a synthetic player (`userId` `"bot:<id>"`,
  persona username like `"Bramble (AI)"`, `isBot: true` in RoomState players).
  Defaults: `deckCode` random precon, `style` "casual". Errors: `forbidden`
  (non-host), `already_started`, `bad_game`, `room_full`, `bad_deck`.
- `{ "type": "bot.remove", "seat": <n> }` — host only, room not started,
  target seat must hold a bot. Error: `not_a_bot`.
- Bots play the bundled Commander precons only (the server embeds their lists
  plus per-card attributes generated from `src/data/precons.json` by
  `scripts/gen-bot-data.mjs` into `server/src/data/bot_data.json`). A bot seat
  arrives `ready: true` with a sentinel `deckId` (`"bot:FIC-<n>"`), always
  `online`, and with `auto.set`-style untap/draw enabled, so `room.start`'s
  readiness checks hold without special cases.

### Behavior contract

- The scheduler ticks ~every 800 ms; a bot performs at most one action per
  tick (human-like pacing; ~0 idle cost). Bots resume automatically after a
  server restart (the scheduler scans persisted rooms — no extra state).
- Mulligan: keeps 2-5 lands in a 7-card hand (bounds scale with the dealt
  size), mulligans at most three times and never below five cards; London
  keeps bottom the most expensive spells first.
- On its turn: plays one land per turn; casts what its untapped lands can
  afford (tapping lands as payment), commander included (tax-aware);
  creatures/permanents go to the battlefield, instants/sorceries ride the
  stack and self-resolve to the graveyard; never attacks with a creature it
  played that same turn.
- Attacking: picks its defender fresh every combat by threat score (board
  value + resources + a finisher bonus at low life, discounted by untapped
  defense; a runaway leader eats every attack). Per-creature attack classes
  follow the Forge ladder: free swings when the defender has no untapped
  creatures, safe attacks, even trades, all-in only when the race math says
  so. After declaring, the bot announces the attack in chat ("Attacking Matt
  for 12 damage with A, B and C.") and holds combat open ~9 s (1.6 s at an
  all-bot table) so defenders can respond, then ends combat. A bot never
  stalls a turn longer than ~35 s (failsafe: pass).
- Defending: an ordered block pipeline (free blocks, profitable trades, gang
  blocks, chump blocks only when the unblocked total would put it in the
  red). After the combat clears, the bot settles ITS OWN damage from the
  room's last-combat record: unblocked commander damage via `cmd.damage`
  (which also lowers life), the rest via `life.add`, and its dead creatures
  move themselves to the graveyard. It never touches another seat's cards or
  totals - the freeform contract stands.
- Answers its own `cmd.choice` prompts (accept: return to command zone), and
  concedes (with a "GG" in chat) once its life reaches 0, poison reaches 10,
  or any single commander has dealt it 21 - that is what lets a bot match
  actually END via the normal last-player-standing path.
- Table talk: a greeting when seated, keep/mulligan notes, attack
  announcements, block declarations (capped per combat), damage taken, a GG
  on concede, and a handshake on winning. All through the ordinary `chat`
  frame with `from.userId` = the bot id, so clients need nothing special.
- Bots do not count as "online" for room-expiry liveness, never become host,
  write no match-history rows, and `matchResult.players[].isBot` is true for
  them; games without two humans stay unranked.

## Enforced rules addendum (2026-07-30) — Arena-lite tables

Opt-in per room: `settings.enforced` (host toggle, MTG only; ignored for other
games). Freeform stays the default and the coach stays advisory. In an
enforced room the server validates the actions that matter and rejects illegal
ones with `{"type":"error","code":"illegal","message":<human reason>}`
(`must_cast` when a hand card was dragged out without paying).

Card facts come from a server-side oracle cache (`oracle.rs`: memory over
SQLite over lazy Scryfall `/cards/collection` fetches, prefetched at deck
select / bot add / start). Unknown cards (custom art ids, fetch failures) stay
permissive rather than bricking a deck. The client mirrors the same facts from
its own Scryfall cache to glow legal moves (`data-playable`, attack/block
affordances); the server remains the authority.

### What is enforced (v1)

- One land per turn, your own main phases only (`landsThisTurn` is public on
  each player).
- Casting: `{kind: "cast", iid, payment?: [land iids], x?, y?}` pays the real
  colored cost - floating pool first, then auto-chosen lands (or exactly
  `payment`). Permanents enter the battlefield (`enteredTurn` stamped for
  summoning sickness); instants/sorceries ride the stack, their EFFECT still
  performed manually by the caster before stack.resolve. Commanders via
  `cmd.cast` pay cost + tax the same way. Dragging a known non-land out of
  hand is rejected (`must_cast`); the client sends `cast` instead.
- Tapping your own land floats mana into your pool (`card.tap` gains optional
  `mana: "W".."C"` to pick a color on multi-producers); pools empty at every
  phase boundary. Manual untapping is rejected (untap happens at turn start).
- Turn order: only the active player passes/edits phases; `turn.set` and
  `untap.all` are rejected.
- Combat is a locked machine: `combat.begin` → `combat.attack` (validated:
  untapped creature, no summoning sickness unless haste, no defender) →
  `combat.lock` → defender `combat.block` (validated: untapped creature,
  flying needs flying/reach, menace needs 0 or 2+) → `combat.ready` → server
  computes `combat.preview` on the room state (per-attacker damage, deaths,
  life deltas with first strike / double strike / deathtouch / trample /
  lifelink, commander damage) → active player `combat.resolve` applies it
  (deaths to graveyards, life totals, cmdDamage). `combat.end` cancels.
- Wire additions: `Combat` gains `locked`, `blocksReady`, `preview`
  (camelCase `CombatPreview`: `rows[]`, `life{seat: delta}`, `commander[]`).

Bots play enforced rooms through the same validator (oracle-aware casting,
keyword-aware combat math, the lock/ready/resolve flow) and skip their manual
damage settlement there. `bot.add` gains `difficulty: "easy"|"normal"|"hard"`
(scales aggression, casting budget, blocking discipline). Every bot turn
begins with a minimum 500ms "thinking" beat before its first action, whoever
is (or is not) watching - an instant answer reads as a glitch, not an
opponent.

### Triggered abilities (rules pass A, 2026-07-30)

The oracle cache parses each card's rules text into trigger records at fetch
time (never per-card hardcoding): `When ~ enters (the battlefield)`,
`When ~ dies`, `Whenever ~ attacks`, `At the beginning of your upkeep`, and
`At the beginning of your end step`, with a closed set of effects the engine
can apply itself - draw N, gain/lose N life, each opponent loses N, +X/+X
counters on the source, and P/T token stubs. Compound clauses joined by
"and" parse when every part does; anything else (targets, scaling, extra
sentences, intervening "if") is `manual`. Quoted granted abilities and
other-object triggers never fire. Cached oracle rows carry a parse version;
older rows reparse from their stored text (or refetch) on first use.

In an enforced room the matching event queues a prompt instead of
auto-resolving:

- Events: battlefield arrival however it happens (cast, land drop,
  reanimation, stack resolve; a face-down Set stays silent), battlefield ->
  graveyard (incl. enforced-combat deaths), `combat.lock` (per attacker),
  turn start (upkeep), and entering the end phase - `turn.pass` fires unvisited
  end steps exactly once per turn.
- `room.state` gains `pendingTriggers: [{id, owner, seat, sourceIid,
  sourceName, when: "etb"|"dies"|"attacks"|"upkeep"|"endStep", effects[],
  text, auto, deadline}]` (fully public - it is printed card text).
- The controller answers with `{kind: "trigger.answer", id, apply}`:
  `apply: true` on an `auto` trigger has the engine perform the effects
  (logged); on a manual trigger it is an acknowledgment - the text stays the
  table's to perform by hand. `apply: false` dismisses. Unanswered prompts
  lapse after 30s with a log line; a lapse never applies anything.
- Bots answer their own prompts within a tick: auto triggers are applied and
  announced in chat; manual ones are dismissed. A recognized removal/burn
  spell on the stack (oracle `threat`) makes a hard bot respond with an
  instant when it can. A bot action rejected by the validator logs a
  `[rules]` line - the enforced-brawl playtest asserts none ever appear.

### Static, evasion, and cost effects (rules pass B, 2026-07-30)

The oracle cache also parses (versioned rows reparse/refetch on upgrade):
card colors; plain anthems (`(Other) creatures you control get +P/+T` -
one-shot/conditional/subtype variants deliberately unmodeled); cost cuts
(`(<type> )spells you cast cost {N} less to cast`); bare `~ can't be
blocked.`; `protection from <color(s)>`; and the printed ward cost.

Enforcement changes:

- `effective_pt` folds the controller's anthems into every creature's P/T, so
  the combat preview math (damage, deaths, lifelink, trample) sees boosted
  stats.
- Block legality is a full evasion table: flying/reach, fear (artifact or
  black), intimidate (artifact or shared color), shadow (both directions),
  skulk (by effective power), horsemanship, unblockable, protection from the
  blocker's colors. Unknown attackers stay permissive; attacker-imposed
  requirements need the blocker to PROVE it qualifies (same stance v1 took
  for flying). Bots pick blocks through the same table.
- Cost cuts fold into the generic component of `cast`/`cmd.cast` payment
  (colored pips never shrink; floor 0), server-side and in the client's
  affordance mirror.
- Vigilance: declaring an attacker no longer taps it in enforced rooms.
- Ward: an `aim` at an opponent's warded permanent relays `ward: "<cost>"`
  on the aim broadcast, and the deliberate spell-targeting gesture (fromIid
  present) also logs a tax reminder line.

### Replacement and cascade effects (rules pass C, 2026-07-30)

Parsed at fetch time (conditional variants stay unmodeled): `~ enters
tapped`, `~ enters with N <kind> counters on it`, `If ~ would die, exile it
instead`, `Prevent all combat damage that would be dealt to/by ~`, the
cascade keyword, and `discover N`.

- Enters replacements auto-apply on every battlefield arrival (cast, land
  drop, reanimation, stack resolve) before the arrival's ETB prompts fire.
- A dies-to-exile card's death routes to exile (logged as a replacement)
  and fires no dies trigger - both on direct moves and enforced-combat
  deaths.
- Damage-prevention shields fold into the combat preview: a shielded
  creature soaks assignment but takes nothing; a shielded dealer deals
  nothing.
- `{kind: "cascade", n}` (enforced rooms; also the deck menu's "Cascade
  for…"): the server reveals from the top of the caster's library until a
  nonland card with mana value < n, puts the hit on the stack revealed and
  free to cast (resolve it to the battlefield, or decline it anywhere else
  - it is a normal stack card), and bottoms the rest in a random order.
  Unknown cards are set aside with the lands, never a wedge. Casting a
  spell with cascade fires it automatically with n = the spell's mana
  value; `discover N` fires with n = N + 1.
- `token.clone` of an iid on the shared stack copies the SPELL: the copy
  is a token owned by the copier on top of the stack, resolves like any
  stack card, and evaporates via the normal token rule if declined.
- Bots resolve their own stack permanents (cascade hits) to the
  battlefield, instants and sorceries to the graveyard, and answer the ETB
  prompts that follow.

### Discard, scry, mill, spell intent, and loyalty (rules pass D, 2026-07-31)

The trigger parser's closed effect set grows: `discard N card(s) (at
random)`, `each opponent discards N card(s) (at random)`, `scry N`, and
`mill N card(s)`, including "then"/";" chains where every part parses
(anything unknown still makes the whole trigger `manual`). The oracle row
also stores a planeswalker's printed loyalty and a whole-spell intent read
for instants and sorceries: counterspells (`counter target spell`), draw
spells, symmetric/each-opponent discard spells (Hymn, wheels), and scry
spells.

- A planeswalker arriving on the battlefield in an enforced room gets its
  printed loyalty in `loyalty` counters automatically ("enters with N
  loyalty"). Activating abilities stays manual, like all card text.
- When an instant or sorcery RESOLVES off the stack in an enforced room, its
  parsed intent applies engine-side and is narrated: the caster draws
  ("draws 2 cards (Divination)"), scries (below), and each opponent
  discards. Unparsed text stays the caster's to perform, exactly like
  manual triggers.
- Discards: random ones (and bot seats) resolve instantly, named cards in
  the log - "Bob discards 2 cards (Island, Opt) at random to Wheel of
  Fortune in response to Hymn to Tourach" (the "in response to" clause
  appears whenever a spell is still on the stack beneath the resolving
  one). A human choosing gets `room.state.pendingDiscards: [{id, owner,
  seat, n, sourceName, inResponseTo, random, deadline}]` and answers with
  `{kind: "discard.resolve", id, iids}` - exactly `n` distinct in-hand
  iids, or `iids: []` to consent to the engine's choice (highest mana value
  first). An unanswered prompt lapses after 30s into a random discard, so
  an absent player never stalls the table. A manual hand->graveyard
  `card.move` while a spell is on the stack also logs the "in response to"
  clause.
- Scry N: a bot applies a keep-lands-when-short heuristic silently (the log
  says only "scries N"); a human gets the top N as a private peek (the same
  `library.cards` message the peek verb sends, so the viewer opens) - the
  existing reorder/bottom verbs finish the scry. When one spell both draws
  and scries (Preordain, Opt), the engine deliberately draws FIRST and
  scries the new top - a draw would otherwise wipe the peek mid-scry.
- Mill N: top N to the graveyard, every card named in the log.
- `stack.counter` now logs "counters X with Y" when the countering player's
  own spell sits above the countered one on the stack.

### Bot brain (refactor, 2026-07-31)

`server/src/bot.rs` became `server/src/bot/`: `knowledge.rs` (embedded
precon data, card reads, style/tier), `lines.rs` (all table talk),
`decide.rs` (the priority ladder + the bot's own turn), `combat.rs`
(legality, freeform settling, blocks, attacks), `casting.rs`, `upkeep.rs`
(mulligans), with the scheduler and mind types in `mod.rs`. Scheduler
behavior is unchanged (800ms tick, fast-chains, one action per tick).

Behavior upgrades, all through the same public actions a human would send:

- A bot casting a recognized removal/burn spell (`threat`) declares its
  victim with `stack.target` before resolving - the table sees "targets X
  with Y" and the owner settles it (bots already honored spells resolved
  on their permanents).
- A bot holding a parsed counterspell answers a scary opposing spell
  (threat over its board, or mana value >= 5) by casting it, then
  `stack.counter`s the newest opposing spell beneath when it resolves.
- Bot instant-speed responses are no longer random spare instants: only
  counterspells, instant-speed removal, or value spells whose parsed
  intent actually resolves (draw/scry/discard) get cast in response.
- Freeform combat settling reads effective stats (counters, anthems, `*`
  powers) and honors first strike, deathtouch, trample, and lifelink for
  the bot's own creatures and life total.
- Attack planning and threat scoring read oracle facts for cards outside
  the embedded precon data (human decks), instead of scoring them 0.
