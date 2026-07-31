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
npm run all        # seed + standard scenarios, summary table, exit code = failures
npm run seed       # just create/refresh the pt_* users + precon decks
npm run lobby      # readiness, deck privacy, targeted ping, and public mana
npm run pod        # scenario 1
npm run duel       # scenario 2
npm run chaos      # scenario 3 (node scenarios/chaos-monkey.js <seed> to reproduce)
npm run draft      # scenario 5 — booster draft pass-and-pick
npm run restart    # scenario 4 — LOCAL ONLY: kills + relaunches the dev server
npm run enforced   # enforced rules: validator + bot combat machine (vs a bot)
npm run triggers   # enforced pass A: triggered-ability prompts, solo goldfish
npm run statics    # enforced pass B: evasion matrix, anthem, cost cut, ward
npm run cascade    # enforced pass C: replacements, cascade, stack copies
npm run brawl      # enforced fuzz: all four FF precons bot-vs-bot, ~110s
```

## What each scenario proves

### `scenarios/lobby-mana.js` — pregame and shared table aids
- Readiness and online state are public; deck ids remain private to their owner.
- Deck changes and disconnects clear readiness; start requires every seat
  online, decked, and ready, and only the host may deal.
- Spectators cannot ready, switch decks, start, or send game actions.
- Targeted pings carry sender/recipient identity, stay private from spectators, and are rate-limited.
- Floating mana reaches every player and spectator through `room.event`, is
  recovered in `room.state`, and only the pool's owner can mutate it.

Gameplay scenarios call `readyAll(clients)` after seating and before
`room.start`, matching the same authoritative lobby gate as the real client.

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

### 5. `scenarios/booster-draft.js` — booster draft pass-and-pick
3 seats join a `draft` room with **no deck** (the point of drafting), and the
host deals 6 synthesized packs whose cards are named `P{pack}-c{card}`, so the
identity of a pack is readable from any card in it. That is what makes the
rotation provable rather than plausible:
- Packs are dealt in table seat order, and each seat sees only its own `pack`
  and `pool` — another seat's cards are absent from the payload, not merely
  hidden, though `packCount` is public.
- **Round 1 passes left**: seat 0 receives seat 2's pack, seat 1 receives seat
  0's, seat 2 receives seat 1's. **Round 2 passes right**: the same three
  assertions with the direction reversed.
- A pack arriving after a pass is exactly one card lighter, and the card that
  left it is the one now in the taker's pool.
- Picking again in the same pass changes nothing; an `index`/`id` disagreement
  is refused as `bad_pick`; a stale pick does not move the draft.
- `room.start` is refused with `draft_running` until every deck is built.
- Conservation: across both rounds no card appears twice in a pool, no card
  reaches two pools, and every card of every pack ends in exactly one pool.
- `draft.built` without a saved deck is refused (`deck_required`); saving a
  deck from the pool seats it automatically, and the last build flips the
  draft to `done`.

### `scenarios/marks-arrows.js` — the shared "look at this" layer
Three seats plus a spectator, proving the split between the two halves:
- **Markers** (`mark.set` / `mark.clear`) are real table state: they reach
  every player and the spectator, carry who placed them (id, seat, name,
  timestamp), replace in place when someone re-marks a card, lift with
  `mark: null`, survive a disconnect/reconnect, are inherited by a late
  viewer, and are dropped automatically when their card leaves the
  battlefield. Bad input is refused (unknown card, empty/oversized kind,
  clearing an already-clean table).
- **Arrows** (the `aim` relay) are ephemeral: broadcast to every player and
  spectator with the sender's seat attached, aimable at a card or a seat,
  and provably absent from `room.state` afterwards.

### Enforced-mode scenarios (rules roadmap passes A-C)

All four run in `npm run all` after the freeform scenarios:

- **`enforced-duel.js`** — the Arena-lite validator against a hard bot:
  must-cast rejections, land-drop limits, structural guards, and the full
  lock/block/ready/preview/resolve combat machine with server-applied damage.
- **`enforced-triggers.js`** (pass A) — a solo goldfish with a purpose-built
  deck exercising every parsed trigger pattern: ETB (draw, compound
  draw-and-lose, drain, a land's ETB on the real land drop), dies (token
  stub), attacks (life + self counter on combat.lock), upkeep (auto and
  manual), end step - including apply/decline/acknowledge answers and
  once-per-turn end-step semantics across phase.set and turn.pass.
- **`enforced-statics.js`** (pass B) — two seats: the evasion matrix
  (unblockable / fear / shadow / skulk / protection rejections and their
  legal counterparts), vigilance's no-tap, the anthem folded into the
  combat preview's math, a {2} artifact cast off one land through a cost
  cut, and the ward tax relayed on the aim gesture.
- **`enforced-cascade.js`** (pass C) — enters-tapped and
  enters-with-counters replacements coexisting with ETB prompts,
  dies-to-exile, the manual "cascade for N" verb and the automatic cascade
  keyword firing (hit rides the stack free to cast, rest bottoms), a stack
  spell token-copied and both copies resolving, and Fog Bank's two-way
  damage prevention in the preview.
- **`enforced-brawl.js`** (fuzz) — all four FF precons play bot-vs-bot at
  one enforced table for ~100s while a spectator asserts zero `[rules]`
  rejection logs, no error frames, per-seat card conservation, answered
  trigger prompts, and forward progress. Deterministic scenarios use real
  Scryfall cards whose oracle text is pinned in comments; the trick that
  makes them reproducible is bottoming the opening hand and fetching every
  singleton test card out of the library before anything can draw it.

## Notes
- `lib.js` is the protocol client: register-or-login, REST, WS with a
  per-client received-message log, `expectState` / `expectLog` /
  `expectPrivate` / `assertNever` assertion helpers with timeouts, and a
  `requestResync()` trick (re-joining your own seat makes the server broadcast
  fresh per-viewer `room.state`s) used to observe state after actions that do
  not resync on their own.
- Scenario output ends with a `##RESULT## {json}` line that `run-all.js`
  parses for the summary table.
