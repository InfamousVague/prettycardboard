# PrettyCardboard playtest harness

Automated end-to-end playtests for the gameplay engine, driven over the real
REST + WebSocket protocol (see `../PROTOCOL.md`, incl. the Gameplay v2
addendum) against the local dev server at `http://127.0.0.1:8787`
(override with `PC_BASE`).

Nothing here wipes the database. The harness registers four idempotent
throwaway users (`pt_alice`, `pt_bob`, `pt_carol`, `pt_dana`, password
`playtest1`), uploads the four Final Fantasy Commander precons from
`../src/data/precons.json` as their decks, and every scenario creates (and
deletes) its own room.

## Running

```sh
cd playtest
npm install
npm run all        # seed + scenarios 1-3, summary table, exit code = failures
npm run seed       # just create/refresh the pt_* users + precon decks
npm run pod        # scenario 1
npm run duel       # scenario 2
npm run chaos      # scenario 3 (node scenarios/chaos-monkey.js <seed> to reproduce)
npm run restart    # scenario 4 — LOCAL ONLY: kills + relaunches the dev server
```

## What each scenario proves

### 1. `scenarios/commander-pod.js` — 4-player commander pod
- Room create (commander / 4 seats / non-persistent), 4 seats taken with real
  precon decks: 40 life, 99-card library, flagged commander in the command zone.
- `room.start` deals 7 and opens London mulligans: alice keeps at once; bob
  takes the free 3+-player mulligan and bottoms 0; carol mulls twice and must
  bottom exactly 1 (under-bottoming is rejected with `bad_bottom`); dana keeps.
- First-turn auto for the starting seat fires only after the last keep and
  DOES draw (no first-draw skip in 4-player commander).
- Full `turn.pass` rotation: untap + draw for each incoming seat, turnNumber
  increments only on wrap.
- Phase ribbon walk across all 7 phases.
- Commander machinery: `cmd.cast` at tax 0, commander lost to the graveyard →
  owner-only `cmd.choice` (others provably never receive it) → accept returns
  it to the command zone → recast logs tax 2.
- Guided combat: two attackers with different defenders, auto-tap on attack
  declaration, a block pairing, `combat.end` → main2.
- `cmd.damage` with explicit commander attribution (by-seat + by-commander).
- Stack: dana pushes a hand card (revealed to the table), alice counters it
  into dana's graveyard.
- Dice (d20 / 3d6 / coin) and every marker (monarch, initiative, day/night,
  storm).
- Library viewers: peek 3 → private `library.cards`, scry reorder verified by
  re-peek, bottom 1, full search — and the privacy assertion that another
  player NEVER receives `library.cards`.
- Attach + glued move (`card.pos` carries attachment offsets), undo of a tap,
  reveal top 2 to the table.
- Disconnect/reconnect: seat, private hand, and the whole v2 state (turn,
  phase, markers, tax) resume.

### 2. `scenarios/standard-duel.js` — 1v1 standard
- 20 starting life; commander-board card not flagged in standard.
- No free mulligan in 1v1 standard (first mull bottoms 1).
- The STARTING seat skips its first draw; the other player draws on their
  first turn; the starting seat draws normally from turn 2.
- `turn.set` to self = extra turn (turnNumber bumps, auto untap + draw).
- Stack push from the battlefield (not marked revealed) and resolve back.
- 1v1 combat with no `defenderSeat`.
- Concede via `room.leave`: the leaver's player entry and stack cards vanish
  from everyone's state.

### 3. `scenarios/chaos-monkey.js` — randomized action fuzz
3 players, 120 random-but-valid actions sampled with weights across the whole
v2 action space (moves/taps common, markers rare; scry follow-ups and
undo-after-tap run as chained actions). After EVERY action it asserts:
- (a) no desync: each client receives the `room.event` and a forced
  `room.state` resync within 3s;
- (b) card conservation per player: own hand length == `handCount`, and
  hand + library + battlefield + graveyard + exile + command + owned stack
  cards == 100 (tokens excluded; while a `cmd.choice` is pending the loop
  pauses and answers it randomly before counting);
- (c) the server stays alive (no `error` frames, REST answers at the end).

Seeded RNG: `node scenarios/chaos-monkey.js 12345` reproduces a failing run
(the seed is printed at start; an optional second arg overrides the action
count).

### 4. `scenarios/restart-resume.js` — persistence across restart (LOCAL ONLY)
Builds a mid-combat, mid-stack state (turn 2, commander with counters and an
attachment on the battlefield attacking into a declared block, a revealed
spell on the stack, face-down card, markers, poison, commander damage + tax),
waits out the 2s write-behind flush, SIGTERMs the local
`target/debug/prettycardboard-server` process, relaunches it with
`nohup cargo run` in `../server`, waits for 401 on `/api/me`, reconnects all
clients, and asserts the resumed per-viewer states are deep-equal (seq, turn,
phase, stack, combat, markers, tax, counters, attachments, hands, libraries,
life, poison, cmdDamage). Skips with a message when no local server process
is found. The relaunched server is left running afterwards.

Known server quirk found by this scenario: the server's `serde_json` build
lacks the `float_roundtrip` feature, so battlefield x/y floats reloaded from
the persisted `state_json` can drift by 1 ULP across a restart
(`0.41800000000000004` → `0.418`). The deep-equal therefore compares numbers
at 1e-9 tolerance; everything else is exact.

## Notes
- `lib.js` is the protocol client: register-or-login, REST, WS with a
  per-client received-message log, `expectState` / `expectLog` /
  `expectPrivate` / `assertNever` assertion helpers with timeouts, and a
  `requestResync()` trick (re-joining your own seat makes the server broadcast
  fresh per-viewer `room.state`s) used to observe state after actions that do
  not resync on their own.
- Scenario output ends with a `##RESULT## {json}` line that `run-all.js`
  parses for the summary table.
