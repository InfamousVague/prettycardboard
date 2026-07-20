# Testing (the playtest harness)

`playtest/` is a Node harness that speaks the **real** protocol over WebSocket
against a running server. There is no mock: a scenario registers users, joins
rooms, sends actions, and asserts on the resulting `room.state` / events / log —
exactly what a client does. This is the integration test suite. Keep it green.

## Running

```sh
cd server && cargo run          # a server must be running first
cd playtest
node run-all.js                 # the standard suite
```

`run-all.js` runs, in order: `seed`, `commander-pod`, `standard-duel`,
`chaos-monkey`, `locked-combat`, and prints a summary table (exit code reflects
failures). `restart-resume` is intentionally excluded (it kills and relaunches
the server) — run it with `npm run restart`. The AI match is a dev-feature test —
run it with `npm run aimatch`.

Point the harness at a non-default server (e.g. a scratch instance) with the
`PC_BASE` env var:

```sh
PC_PORT=8798 PC_DATA_DIR=/tmp/pc-scratch cargo run              # scratch server
PC_BASE=http://127.0.0.1:8798 node run-all.js                  # test against it
```

Running a scratch server on its own port + data dir keeps test users and rooms
out of your dev database.

## What each scenario covers

| Scenario | Focus |
|----------|-------|
| `seed` | Creates the idempotent `pt_*` users + decks the others reuse. |
| `commander-pod` | A 3–4 player Commander pod: zones, tax, command zone, mulligans. |
| `standard-duel` | A 2-player game: turns, phases, the stack, life. |
| `chaos-monkey` | High-volume random-ish actions; shakes out state desyncs. |
| `locked-combat` | Combat v3: declare → lock → block → resolve, damage and deaths across two viewers. |
| `restart-resume` | Server restart mid-game; rooms and seats resume from SQLite. |
| `ai-match` | A full autonomous bot-vs-bot match runs to completion (dev AI feature). |

## Writing a scenario

Use `PlaytestClient` and `Assert` from `lib.js`, and `ensureSeed` from `seed.js`.
The client mirrors the real one: `connect()`, `joinRoom()`, `act()`, plus
`await`-able expectations that poll the socket.

```js
import { PlaytestClient, Assert } from './lib.js';
import { ensureSeed, PASSWORD } from './seed.js';

const t = new Assert('my-scenario');
const seeded = await ensureSeed(['pt_alice']);
const alice = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
await alice.ensureUser();
await alice.connect();

const room = await alice.api('POST', '/api/rooms', { name: 'demo', seats: 2, format: 'commander' });
alice.joinRoom(room.json.roomId, seeded.pt_alice.deckId);
await alice.expectState((s) => s.players.length === 1, 'alice seated');

alice.act({ kind: 'mull.keep', bottomIids: [] });
// ... drive the game, assert with t.ok(...) / expectState / expectLog ...

const result = t.finish();          // prints ##RESULT## for run-all.js to collect
process.exit(result.failed ? 1 : 0);
```

Key `PlaytestClient` methods:

- `api(method, path, body)` — REST call with auth.
- `connect()` / `joinRoom(id, deckId)` / `act(action)` / `send(msg)`.
- `mark()` — returns the current message index; pass as `{ since }` to scope an
  expectation to messages that arrive *after* now.
- `expectState(pred, label, timeoutMs, { since })` — resolve when a `room.state`
  matches; the workhorse.
- `expectLog(regex, …)`, `expectEvent(pred, …)`, `expectPrivate(type, …)`,
  `waitFor(pred, …)` — the other event kinds.
- `assertNever(type, label, windowMs, …)` — assert a message does *not* arrive.
- `lastState()` / `me(state)` — the latest snapshot and your seat within it.

Two gotchas:

- **Always `process.exit`.** An open WebSocket keeps Node alive; piped output
  buffers, so a forgotten exit looks like a hang.
- **v1 actions (`life.add`, `token.create`) don't resync** — assert them via
  `expectEvent` / `expectLog`, not `expectState`.

Register a new scenario in `run-all.js` (and add a `package.json` script) if it
should be part of the standard suite.
