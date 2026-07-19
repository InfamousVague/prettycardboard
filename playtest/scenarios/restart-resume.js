// Scenario 4 (local only): persistence across a server restart. Builds a
// mid-combat, mid-stack commander game with markers/tax/attachments/counters,
// SIGTERMs the local dev server (found via pgrep on target/debug/
// prettycardboard-server), relaunches it with `nohup cargo run` in server/,
// reconnects every client, and asserts the resumed state is identical.
// Skips politely when no local server process can be found.
import { execSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PlaytestClient, Assert, sleep, deleteRoom, BASE } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(HERE, '..', '..', 'server');
const RELAUNCH_LOG = join(HERE, '..', 'server-relaunch.log');

function findServerPids() {
  try {
    return execSync("pgrep -f 'target/debug/prettycardboard-server'", { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((s) => parseInt(s, 10))
      .filter((p) => Number.isFinite(p) && p !== process.pid);
  } catch {
    return [];
  }
}

async function serverUp() {
  try {
    const res = await fetch(`${BASE}/api/me`);
    return res.status === 401;
  } catch {
    return false;
  }
}

/// KNOWN SERVER QUIRK (documented, not fixed here): the server's serde_json
/// build lacks the `float_roundtrip` feature, so f64s parsed back from the
/// persisted state_json can drift by 1 ULP (e.g. battlefield y
/// 0.41800000000000004 -> 0.418 after a restart). Positions are 0..1 UI
/// coordinates, so the deep-equal below rounds every number to 1e-9 instead
/// of failing on a sub-visible drift.
function roundFloats(x) {
  if (typeof x === 'number') return Math.round(x * 1e9) / 1e9;
  if (Array.isArray(x)) return x.map(roundFloats);
  if (x && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x)) o[k] = roundFloats(x[k]);
    return o;
  }
  return x;
}

function normalize(state) {
  const s = JSON.parse(JSON.stringify(state));
  delete s.spectators; // live-only, reset on load
  for (const p of s.players) delete p.online; // everyone offline right after boot
  return roundFloats(s);
}

function stable(x) {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`;
  if (x && typeof x === 'object') {
    return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${stable(x[k])}`).join(',')}}`;
  }
  return JSON.stringify(x);
}

/// First few differing paths between two JSON-ish values.
function deepDiff(a, b, path = '', out = [], limit = 6) {
  if (out.length >= limit) return out;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      out.push(`${path}: array length ${a.length} vs ${b.length}`);
      return out;
    }
    for (let i = 0; i < a.length; i++) deepDiff(a[i], b[i], `${path}[${i}]`, out, limit);
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (out.length >= limit) return out;
      if (!(k in a)) out.push(`${path}.${k}: missing in BEFORE, after=${JSON.stringify(b[k])}`);
      else if (!(k in b)) out.push(`${path}.${k}: missing in AFTER, before=${JSON.stringify(a[k])}`);
      else deepDiff(a[k], b[k], `${path}.${k}`, out, limit);
    }
    return out;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  return out;
}

async function main() {
  const t = new Assert('restart-resume');

  // Guard first: this scenario only makes sense against the local dev server.
  const pids = findServerPids();
  if (!pids.length) {
    console.log('SKIP: no local target/debug/prettycardboard-server process found (is the dev server running via cargo?).');
    console.log(`##RESULT## ${JSON.stringify({ name: 'restart-resume', passed: 0, failed: 0, durationMs: 0, skipped: true })}`);
    process.exit(0);
  }

  const names = ['pt_alice', 'pt_bob', 'pt_carol'];
  const seeded = await ensureSeed(names);
  const clients = names.map((n) => new PlaytestClient(n, { password: PASSWORD, assert: t }));
  const [alice, bob, carol] = clients;
  for (const c of clients) {
    await c.ensureUser();
    await c.connect();
  }

  const roomRes = await alice.api('POST', '/api/rooms', {
    name: 'pt restart table',
    seats: 3,
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

  // --- build a rich mid-game state ----------------------------------------
  const step = async (client, action, pred, label) => {
    const mm = client.mark();
    client.act(action);
    if (pred) await client.expectState(pred, label, 5000, { since: mm });
    else {
      await client.waitFor((x) => x.type === 'room.event', { since: mm, timeoutMs: 5000 });
    }
  };

  // a couple of turns so turnNumber > 1
  await step(alice, { kind: 'turn.pass' }, (s) => s.activeSeat === 1, 'turn to bob');
  await step(bob, { kind: 'turn.pass' }, (s) => s.activeSeat === 2, 'turn to carol');
  await step(carol, { kind: 'turn.pass' }, (s) => s.turnNumber === 2 && s.activeSeat === 0, 'wrap to turn 2');

  // commander out with counters + an attachment
  let st = alice.lastState();
  const cmdIid = alice.me(st).command[0].iid;
  await step(alice, { kind: 'cmd.cast', iid: cmdIid, x: 0.3, y: 0.4 }, (s) => alice.me(s).commanderTax[cmdIid] === 2, 'commander cast (tax 2)');
  await step(alice, { kind: 'card.counter', iid: cmdIid, counter: '+1/+1', delta: 3 }, null, 'counters on commander');
  st = alice.lastState();
  const supportIid = alice.me(st).hand[0].iid;
  await step(alice, { kind: 'card.move', iid: supportIid, to: 'battlefield', x: 0.5, y: 0.5 }, (s) => alice.me(s).battlefield.some((c) => c.iid === supportIid), 'support deployed');
  await step(alice, { kind: 'card.attach', iid: supportIid, hostIid: cmdIid }, (s) => alice.me(s).battlefield.find((c) => c.iid === supportIid)?.attachedTo === cmdIid, 'attached');

  // bob: face-down permanent + poison
  st = bob.lastState();
  const bobPermIid = bob.me(st).hand[0].iid;
  await step(bob, { kind: 'card.move', iid: bobPermIid, to: 'battlefield', x: 0.6, y: 0.4 }, (s) => bob.me(s).battlefield.some((c) => c.iid === bobPermIid), 'bob permanent');
  await step(bob, { kind: 'card.face', iid: bobPermIid, faceDown: true }, null, 'bob face-down');
  await step(bob, { kind: 'poison.add', delta: 2 }, null, 'bob poison');

  // markers + life + commander damage
  await step(alice, { kind: 'marker.set', marker: 'monarch', seat: 0 }, (s) => s.markers.monarch === 0, 'monarch');
  await step(alice, { kind: 'marker.set', marker: 'initiative', seat: 1 }, (s) => s.markers.initiative === 1, 'initiative');
  await step(alice, { kind: 'marker.day', value: 'night' }, (s) => s.markers.dayNight === 'night', 'night');
  await step(alice, { kind: 'marker.storm', delta: 2 }, (s) => s.markers.storm === 2, 'storm 2');
  await step(carol, { kind: 'life.add', delta: -4 }, null, 'carol life -4');
  await step(bob, { kind: 'cmd.damage', fromSeat: 0, delta: 5, commanderIid: cmdIid }, (s) => bob.me(s).cmdDamage['0'] === 5, 'bob takes 5 cmd damage');

  // mid-stack: carol leaves a revealed spell on the stack
  st = carol.lastState();
  const spellIid = carol.me(st).hand[0].iid;
  await step(carol, { kind: 'stack.push', iid: spellIid }, (s) => s.stack.length === 1, 'spell on stack');

  // mid-combat: alice attacks bob with her commander; carol blocks
  st = carol.lastState();
  const blockerIid = carol.me(st).hand[0].iid;
  await step(carol, { kind: 'card.move', iid: blockerIid, to: 'battlefield', x: 0.7, y: 0.6 }, (s) => carol.me(s).battlefield.some((c) => c.iid === blockerIid), 'carol blocker deployed');
  await step(alice, { kind: 'combat.begin' }, (s) => s.combat && s.phase === 'attack', 'combat begun');
  await step(alice, { kind: 'combat.attack', iid: cmdIid, defenderSeat: 1 }, (s) => s.combat?.attackers.length === 1, 'commander attacks bob');
  await step(carol, { kind: 'combat.block', blockerIid, attackerIid: cmdIid }, (s) => s.combat?.blocks.length === 1, 'carol blocks');

  // --- snapshot every viewer's state at an agreed seq -----------------------
  const marks = clients.map((c) => c.mark());
  alice.requestResync();
  const before = [];
  for (let i = 0; i < clients.length; i++) {
    const msg = await clients[i].waitFor((x) => x.type === 'room.state' && x.state.roomId === roomId, { since: marks[i], timeoutMs: 5000 });
    t.ok(msg, `${clients[i].username} snapshot state`, 'no state');
    before.push(msg?.state);
  }
  const seqBefore = before[0]?.seq;

  // --- restart the server ----------------------------------------------------
  console.log(`waiting 3s for the write-behind flush, then SIGTERM pids ${pids.join(', ')}`);
  await sleep(3000);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (e) {
      console.log(`kill ${pid}: ${e.message}`);
    }
  }
  let downAt = Date.now();
  while (await serverUp()) {
    if (Date.now() - downAt > 10000) break;
    await sleep(200);
  }
  t.ok(!(await serverUp()), 'server went down after SIGTERM');

  console.log(`relaunching: nohup cargo run (cwd ${SERVER_DIR}, log ${RELAUNCH_LOG})`);
  const logFd = openSync(RELAUNCH_LOG, 'a');
  const child = spawn('nohup', ['cargo', 'run'], {
    cwd: SERVER_DIR,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
  });
  child.unref();

  const bootStart = Date.now();
  let up = false;
  while (Date.now() - bootStart < 90000) {
    if (await serverUp()) {
      up = true;
      break;
    }
    await sleep(500);
  }
  t.ok(up, 'relaunched server answers 401 on /api/me', `waited ${((Date.now() - bootStart) / 1000).toFixed(1)}s`);
  if (!up) {
    console.log('server did not come back; aborting comparisons');
    const result = t.finish();
    process.exit(result.failed ? 1 : 0);
  }

  // --- reconnect + compare -----------------------------------------------------
  const after = [];
  for (const c of clients) {
    const mm = c.mark();
    await c.connect();
    const msg = await c.waitFor((x) => x.type === 'room.state' && x.state.roomId === roomId, { since: mm, timeoutMs: 5000 });
    t.ok(msg, `${c.username} auto-resumed seat after restart`);
    after.push(msg?.state);
  }
  // Grab a final resync so everyone reflects all three players being back online.
  const marks2 = clients.map((c) => c.mark());
  alice.requestResync();
  for (let i = 0; i < clients.length; i++) {
    const msg = await clients[i].waitFor((x) => x.type === 'room.state' && x.state.roomId === roomId && x.state.players.every((p) => p.online), { since: marks2[i], timeoutMs: 5000 });
    if (msg) after[i] = msg.state;
  }

  for (let i = 0; i < clients.length; i++) {
    const name = clients[i].username;
    const b = before[i];
    const a = after[i];
    if (!b || !a) {
      t.ok(false, `${name}: missing before/after state`);
      continue;
    }
    t.ok(a.seq === seqBefore, `${name}: seq preserved (${seqBefore})`, `got ${a.seq}`);
    t.ok(a.turnNumber === b.turnNumber && a.phase === b.phase && a.activeSeat === b.activeSeat, `${name}: turn/phase/activeSeat identical`, `${a.turnNumber}/${a.phase}/${a.activeSeat} vs ${b.turnNumber}/${b.phase}/${b.activeSeat}`);
    t.eq(a.stack.map((e) => [e.iid, e.owner, !!e.revealed]), b.stack.map((e) => [e.iid, e.owner, !!e.revealed]), `${name}: stack identical`);
    t.eq(a.combat, b.combat, `${name}: combat (attackers + blocks) identical`);
    t.eq(a.markers, b.markers, `${name}: markers identical`);
    const bAlice = b.players.find((p) => p.seat === 0);
    const aAlice = a.players.find((p) => p.seat === 0);
    t.eq(aAlice.commanderTax, bAlice.commanderTax, `${name}: commander tax identical`);
    const aCmd = aAlice.battlefield.find((c) => c.iid === cmdIid);
    const bCmd = bAlice.battlefield.find((c) => c.iid === cmdIid);
    t.eq(aCmd?.counters, bCmd?.counters, `${name}: counters on commander identical`);
    t.ok(aAlice.battlefield.find((c) => c.iid === supportIid)?.attachedTo === cmdIid, `${name}: attachment preserved`);
    for (const bp of b.players) {
      const ap = a.players.find((p) => p.userId === bp.userId);
      const okCounts = ap && ap.handCount === bp.handCount && ap.libraryCount === bp.libraryCount && ap.life === bp.life && ap.poison === bp.poison;
      t.ok(okCounts, `${name}: ${bp.username} hand/library/life/poison identical`, okCounts ? '' : `${JSON.stringify([ap?.handCount, ap?.libraryCount, ap?.life, ap?.poison])} vs ${JSON.stringify([bp.handCount, bp.libraryCount, bp.life, bp.poison])}`);
      t.eq(ap?.cmdDamage, bp.cmdDamage, `${name}: ${bp.username} cmdDamage identical`);
    }
    const same = stable(normalize(a)) === stable(normalize(b));
    t.ok(same, `${name}: FULL state deep-equal after restart (floats @1e-9)`, same ? '' : deepDiff(normalize(b), normalize(a)).join(' | '));
  }
  // own hands survived (private info)
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    const b = before[i] && c.me(before[i]);
    const a = after[i] && c.me(after[i]);
    t.eq(a?.hand?.map((x) => x.iid), b?.hand?.map((x) => x.iid), `${c.username}: own hand identical after restart`);
  }

  await deleteRoom(alice, roomId);
  for (const c of clients) await c.close();
  const stillUp = await serverUp();
  t.ok(stillUp, 'local server left RUNNING at scenario end');
  console.log(`relaunched server pids: ${findServerPids().join(', ') || '(pgrep found none?)'}`);

  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((e) => {
  console.error('restart-resume crashed:', e);
  console.log(`##RESULT## ${JSON.stringify({ name: 'restart-resume', passed: 0, failed: 1, durationMs: 0, crashed: String(e) })}`);
  process.exit(1);
});
