// Scenario (self-contained): the undo/redo timeline survives a server AND
// database restart. Spawns its OWN scratch release server on PC_PORT + a fresh
// PC_DATA_DIR, builds a 2-player commander game, plays several undoable moves,
// waits for the write-behind flush, hard-kills the server, relaunches it against
// the SAME data dir, reconnects, and asserts undo walks back through moves made
// BEFORE the restart (and redo walks forward again). If the timeline were still
// live-only, every undo would fail with "nothing to undo".
//
// Run it with a scratch base/port/dir so it never touches the dev DB:
//   PC_PORT=8799 PC_BASE=http://127.0.0.1:8799 PC_DATA_DIR=/tmp/pc-timeline \
//     node scenarios/timeline-persist.js
import { spawn } from 'node:child_process';
import { openSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PlaytestClient, Assert, sleep, deleteRoom, BASE } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(HERE, '..', '..', 'server');
const BINARY = join(SERVER_DIR, 'target', 'release', 'prettycardboard-server');
const LOG = join(HERE, '..', 'timeline-relaunch.log');
const PORT = process.env.PC_PORT || '8799';
const DATA_DIR = process.env.PC_DATA_DIR || '/tmp/pc-timeline';

async function serverUp() {
  try {
    return (await fetch(`${BASE}/api/me`)).status === 401;
  } catch {
    return false;
  }
}

function launch() {
  const fd = openSync(LOG, 'a');
  const child = spawn(BINARY, [], {
    cwd: SERVER_DIR,
    detached: true,
    stdio: ['ignore', fd, fd],
    env: { ...process.env, PC_PORT: PORT, PC_DATA_DIR: DATA_DIR },
  });
  child.unref();
  return child;
}

async function waitUp(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await serverUp()) return true;
    await sleep(200);
  }
  return false;
}

async function waitDown(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await serverUp())) return true;
    await sleep(150);
  }
  return false;
}

const bfIids = (client, state) => (client.me(state)?.battlefield ?? []).map((c) => c.iid);

async function main() {
  const t = new Assert('timeline-persist');

  if (await serverUp()) {
    console.log(`SKIP: something is already listening on ${BASE}; use a free PC_PORT/PC_BASE.`);
    console.log(`##RESULT## ${JSON.stringify({ name: 'timeline-persist', passed: 0, failed: 0, durationMs: 0, skipped: true })}`);
    process.exit(0);
  }

  // Fresh DB so old rooms/history never confuse the assertions.
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

  console.log(`launching scratch server: ${BINARY} (PC_PORT=${PORT}, PC_DATA_DIR=${DATA_DIR})`);
  launch();
  const booted = await waitUp(20000);
  t.ok(booted, 'scratch server booted');
  if (!booted) {
    console.log(`server never came up; see ${LOG}`);
    const r = t.finish();
    process.exit(r.failed ? 1 : 0);
  }

  // --- seat a 2-player commander game -------------------------------------
  const names = ['pt_alice', 'pt_bob'];
  const seeded = await ensureSeed(names);
  const clients = names.map((n) => new PlaytestClient(n, { password: PASSWORD, assert: t }));
  const [alice, bob] = clients;
  for (const c of clients) {
    await c.ensureUser();
    await c.connect();
  }

  const roomRes = await alice.api('POST', '/api/rooms', {
    name: 'pt timeline table',
    seats: 2,
    persistent: false,
    format: 'commander',
  });
  t.ok(roomRes.status === 201, 'room created', `status ${roomRes.status}`);
  const roomId = roomRes.json.roomId;
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    const m = c.mark();
    c.joinRoom(roomId, seeded[c.username].deckId);
    await c.expectState((s) => s.players.length === i + 1, `${c.username} seated`, 5000, { since: m });
  }
  let m = alice.mark();
  alice.send({ type: 'room.start' });
  await alice.expectState((s) => s.started, 'game started', 5000, { since: m });
  for (const c of clients) {
    const mm = c.mark();
    c.act({ kind: 'mull.keep', bottomIids: [] });
    await c.expectState((s) => c.me(s).mulligan?.state === 'kept', `${c.username} kept`, 5000, { since: mm });
  }

  // --- three undoable moves: deploy three of alice's hand cards ------------
  const step = async (client, action, pred, label) => {
    const mm = client.mark();
    client.act(action);
    await client.expectState(pred, label, 5000, { since: mm });
  };

  const played = [];
  for (let i = 0; i < 3; i++) {
    const st = alice.lastState();
    const iid = alice.me(st).hand[0].iid; // hand[0] shifts as cards leave
    played.push(iid);
    await step(
      alice,
      { kind: 'card.move', iid, to: 'battlefield', x: 0.2 + i * 0.2, y: 0.5 },
      (s) => alice.me(s).battlefield.some((c) => c.iid === iid),
      `deployed card ${i + 1}`,
    );
  }
  // Battlefield now holds exactly the three played cards, in order.
  const fullField = bfIids(alice, alice.lastState());
  t.eq(fullField, played, 'all three cards on the battlefield before restart');

  // --- let the write-behind flush persist the timeline, then hard-restart --
  console.log('waiting 3s for the write-behind flush of history to SQLite...');
  await sleep(3000);

  // Kill every scratch-binary process (our detached child + any strays).
  try {
    const { execSync } = await import('node:child_process');
    execSync(`pkill -f '${BINARY}'`);
  } catch {}
  const down = await waitDown(10000);
  t.ok(down, 'scratch server went down');

  console.log('relaunching scratch server against the SAME data dir (DB restart)...');
  launch();
  const back = await waitUp(20000);
  t.ok(back, 'scratch server relaunched');
  if (!back) {
    const r = t.finish();
    process.exit(r.failed ? 1 : 0);
  }

  // --- reconnect and verify undo reaches back across the restart ----------
  for (const c of clients) {
    const mm = c.mark();
    await c.connect();
    await c.waitFor((x) => x.type === 'room.state' && x.state.roomId === roomId, { since: mm, timeoutMs: 8000 });
  }
  // Sanity: the restored board still has all three cards.
  alice.requestResync();
  await alice.expectState((s) => bfIids(alice, s).length === 3, 'board restored with 3 cards after restart', 5000);

  // Undo three times: each should peel one card back off the battlefield.
  // This is the crux - a live-only timeline would reject the very first undo.
  const expectAfterUndo = [played.slice(0, 2), played.slice(0, 1), []];
  for (let i = 0; i < 3; i++) {
    const mm = alice.mark();
    alice.act({ kind: 'undo' });
    const want = expectAfterUndo[i];
    await alice.expectState(
      (s) => JSON.stringify(bfIids(alice, s)) === JSON.stringify(want),
      `undo ${i + 1} across restart -> board ${JSON.stringify(want)}`,
      5000,
      { since: mm },
    );
  }

  // Redo three times: the redo tail must have persisted too.
  const expectAfterRedo = [played.slice(0, 1), played.slice(0, 2), played.slice(0, 3)];
  for (let i = 0; i < 3; i++) {
    const mm = alice.mark();
    alice.act({ kind: 'redo' });
    const want = expectAfterRedo[i];
    await alice.expectState(
      (s) => JSON.stringify(bfIids(alice, s)) === JSON.stringify(want),
      `redo ${i + 1} across restart -> board ${JSON.stringify(want)}`,
      5000,
      { since: mm },
    );
  }

  // --- teardown -----------------------------------------------------------
  await deleteRoom(alice, roomId);
  for (const c of clients) await c.close();
  try {
    const { execSync } = await import('node:child_process');
    execSync(`pkill -f '${BINARY}'`);
  } catch {}

  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((e) => {
  console.error('timeline-persist crashed:', e);
  try {
    import('node:child_process').then(({ execSync }) => {
      try { execSync(`pkill -f '${BINARY}'`); } catch {}
    });
  } catch {}
  console.log(`##RESULT## ${JSON.stringify({ name: 'timeline-persist', passed: 0, failed: 1, durationMs: 0, crashed: String(e) })}`);
  process.exit(1);
});
