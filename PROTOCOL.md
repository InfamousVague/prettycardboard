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

Guided combat (unenforced bookkeeping):
- `{kind: "combat.begin"}` — phase -> "attack", empty combat block created.
- `{kind: "combat.attack", iid, defenderSeat?}` — toggle a creature as
  attacker (auto-taps it unless already tapped), optional defender.
- `{kind: "combat.block", blockerIid, attackerIid}` — toggle a block pairing.
- `{kind: "combat.end"}` — clears combat, phase -> "main2".

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

## Bots addendum (v2.1) — AI opponents

Server-resident heuristic opponents. A bot is an ordinary `Player` driven by the
server itself; it acts exclusively through the same `game.action` pipeline as a
human, so every rule in this document applies to bots unchanged.

### Seating

- `{ "type": "bot.add", "deckCode"?: "FIC-<n>"|"random", "style"?: "casual"|"aggro"|"defensive" }`
  — host only, room not started, at least one free seat. Seats a synthetic
  player (`userId` `"bot:<id>"`, persona username, `isBot: true` in RoomState
  players). Defaults: `deckCode` random precon, `style` "casual". Errors:
  `forbidden` (non-host), `already_started`, `room_full`, `bad_deck`.
- `{ "type": "bot.remove", "seat": <n> }` — host only, room not started,
  target seat must hold a bot. Error: `not_a_bot`.
- Bots play the four bundled FF Commander precons only (the server embeds
  their lists + per-card attributes generated from `src/data/precons.json`
  by `scripts/gen-bot-data.mjs` into `server/src/data/bot_data.json`).

### Behavior contract

- The scheduler ticks ~every 800 ms; a bot performs at most one action per
  tick (human-like pacing; ~0 idle cost). Bots resume automatically after a
  server restart (the scheduler scans persisted rooms — no extra state).
- Mulligan: keeps any hand with 2–5 lands; otherwise takes at most one
  mulligan, then keeps (bottoming the owed count, highest mana values first).
- On its turn: plays one land per turn; casts what its untapped lands can
  afford (tapping lands as payment), commander included (tax-aware);
  creatures/permanents go to the battlefield, instants/sorceries ride the
  stack and self-resolve to the graveyard next tick; attacks per style
  (aggro: everything; casual: attackers whose power beats the defender's
  best untapped blocker or when clearly ahead; defensive: only safe swings);
  ends combat, then passes the turn. A bot never stalls a turn longer than
  ~25 s (failsafe: pass).
- Defending: declares blocks (largest blocker onto largest attacker first,
  style-weighted), and after the attacker ends combat the bot applies the
  unblocked damage to its own life total (plus commander damage bookkeeping
  when the attacker is a commander).
- Answers its own `cmd.choice` prompts (accept: return to command zone).
- Bots do not chat, do not count as "online" for room-expiry liveness, and
  are removed with the room. Spectator/friend/presence surfaces ignore them.

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

  `deck` is null for deckless seats (bots play embedded precons, no deckId).
  `myEndorsed`/`mySalt` are the caller's own submissions for this match.
- Seats record `deckId` + a `deckName` snapshot at join time, so results
  survive later deck renames/deletes. Stats treat bots per synthetic
  `bot:*` id (effectively per-room; their all-time numbers are decorative).

## Combat v3 addendum — locked declarations & resolved results

Guided combat grows a full declare → lock → respond → resolve loop. The old
instant flow (attack, end combat, bots self-settling) remains valid for
un-locked combats; everything below activates only when the attacker LOCKS.

### CombatState additions
`locked: bool` (default false), `ready: [seat]` (defenders done responding),
`prevent: [seat]` (defenders who prevented all combat damage this combat,
e.g. a fog instant). Attacker entries gain `power?/toughness?` (strings,
EFFECTIVE values supplied by the declaring client, counters included);
blocks gain `power?/toughness?` likewise.

### Actions
- `combat.attack` — now also carries `power?`, `toughness?`.
- `combat.lock {}` — active seat only, needs >= 1 attacker; sets locked,
  phase "block"; log "X locks in N attackers". After lock, attackers cannot
  be re-toggled (error `locked`).
- `combat.block` — now also carries `power?`, `toughness?`. Only valid while
  locked (pre-lock blocks stay allowed for the legacy flow).
- `combat.ready { prevent?: bool }` — a TARGETED defender marks themselves
  done (prevent=true when they played a damage-prevention effect: they and
  their blockers take and deal no combat damage). Recorded in `ready` (and
  `prevent`). When every targeted human/bot defender is ready, the server
  RESOLVES immediately.
- `combat.end` before resolution cancels the combat outright (locked or
  not): no damage, no deaths, banner clears. A canceled locked combat does
  NOT stash a legacy settle record.

### Resolution (server-side, on last ready)
For each attacker, in declaration order:
- Defender in `prevent`: no damage either way, no deaths for that pairing.
- Unblocked: defender loses `power` life (server applies `life.add`-style,
  with commander damage bookkeeping when the attacker `isCommander`).
- Blocked: blockers absorb in declared order — a blocker dies when the
  attacker's remaining power >= its toughness (power spends as it kills);
  the attacker dies when the blockers' summed power >= its toughness.
  Tokens that die cease to exist; real cards go to their graveyard.
Missing power/toughness resolve as 0 (no damage / no death suggestion).
Then combat clears, phase becomes "main2", and every viewer receives
`{"type": "combat.results", "attackerSeat", "entries": [{attackerIid, name,
defenderSeat, prevented, blockers: [{iid, name, died}], attackerDied,
damageToDefender}], "totalBySeat": {seat: damage}}` plus log lines. The
results are freeform SUGGESTIONS made real: undo (10s) reverts the whole
resolution, and the pile browsers let players correct edge cases
(indestructible, regeneration) manually.
Resolved locked combats do NOT create a legacy `last_combat` record (bots
must not settle twice).

### Bots
- As targeted defenders of a locked combat: declare their blocks (now with
  attrs-derived power/toughness), then `combat.ready` within a few ticks.
- As attackers: unchanged legacy flow (bots never lock).
