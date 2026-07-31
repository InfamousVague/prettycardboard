// Scenario: scripted planeswalker audit — a KNOWN deck (30 Mountain + 10
// Chandra, Torch of Defiance) against a bot at an enforced table, proving the
// planeswalker lifecycle the bot precons can never exercise: none of the four
// bundled FF Commander decks contains a single planeswalker, so a bot-vs-bot
// pod cannot test loyalty at all.
//
// Covers: cast at sorcery speed with auto-tap, loyalty counters up and down,
// loyalty persisting across a turn cycle (auto-untap must not wipe counters),
// and the walker leaving for the graveyard at zero.
//
// HARNESS NOTE: battlefield->graveyard and counter changes are PUBLIC moves,
// which deliberately do not force a room.state resync (the client applies the
// room.event optimistically). Every authoritative read here therefore calls
// requestResync() first and waits with a since-cursor — without that the test
// reads pre-action state and reports false failures.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(HERE, '..', 'logs');
const CHANDRA = process.env.PW_CARD ?? '40cb22c8-cb03-45c9-bb0e-b8cabdcc43cd';
const MOUNTAIN = 'c49d378e-9549-4320-b3c6-1aeb216d1e98';

async function main() {
  const t = new Assert('planeswalker-audit');
  const me = new PlaytestClient('pw_tester', { password: 'playtest1', assert: t });
  await me.ensureUser();
  await me.connect();
  me.send({ type: 'room.leave' });
  await sleep(400);

  const deck = await me.api('POST', '/api/decks', {
    name: `PW Audit ${Date.now()}`,
    format: 'freeform',
    cards: [
      { scryfallId: MOUNTAIN, name: 'Mountain', quantity: 30, board: 'main' },
      { scryfallId: CHANDRA, name: 'Chandra, Torch of Defiance', quantity: 10, board: 'main' },
    ],
  });
  const mk = await me.api('POST', '/api/rooms', {
    name: 'planeswalker audit', seats: 2, persistent: false, format: 'freeform',
  });
  const roomId = mk.json.roomId;
  const state = () =>
    [...me.messages].reverse().find((m) => m.type === 'room.state' && m.state.roomId === roomId)?.state;
  const mine = () => state()?.players.find((p) => !p.isBot);
  /** Authoritative read: force a snapshot, then take the one that follows. */
  const fresh = async (since) => {
    me.requestResync();
    const msg = await me.waitFor((m) => m.type === 'room.state' && m.state.roomId === roomId, { since, timeoutMs: 8000 });
    return msg?.state.players.find((p) => !p.isBot);
  };

  me.joinRoom(roomId, deck.json.id);
  await me.waitFor((m) => m.type === 'room.state' && m.state.roomId === roomId, { timeoutMs: 6000 });
  me.send({ type: 'room.settings', settings: { ...(state().settings ?? {}), enforced: true } });
  await me.waitFor(
    (m) => m.type === 'room.state' && m.state.roomId === roomId && m.state.settings?.enforced,
    { timeoutMs: 5000 },
  );
  me.send({ type: 'bot.add', style: 'defensive', difficulty: 'easy' });
  await me.waitFor(
    (m) => m.type === 'room.state' && m.state.roomId === roomId && m.state.players.some((p) => p.isBot),
    { timeoutMs: 9000 },
  );
  me.setReady(true);
  await sleep(6000); // oracle prefetch
  me.send({ type: 'room.start' });
  await me.waitFor((m) => m.type === 'room.state' && m.state.roomId === roomId && m.state.started, { timeoutMs: 6000 });
  me.act({ kind: 'mull.keep', bottomIids: [] });
  await me.waitFor(
    (m) => m.type === 'room.state' && m.state.roomId === roomId && m.state.players.every((p) => p.mulligan?.state === 'kept'),
    { timeoutMs: 20000 },
  );

  const mySeat = mine().seat;
  // Answer any bot combat so turns keep cycling.
  const guard = setInterval(() => {
    const s = state();
    if (s?.combat?.locked && s.activeSeat !== mySeat && !(s.combat.ready ?? []).includes(mySeat)) {
      me.act({ kind: 'combat.ready' });
    }
  }, 1500);

  // Ramp to four lands (Chandra costs {2}{R}{R}).
  for (let i = 0; i < 8; i++) {
    const p = mine();
    if (state().activeSeat === mySeat && (p.landsThisTurn ?? 0) === 0) {
      const land = p.hand.find((c) => c.name === 'Mountain');
      if (land) {
        me.act({ kind: 'card.move', iid: land.iid, to: 'battlefield', x: 0.08 + i * 0.06, y: 0.75 });
        await sleep(700);
      }
    }
    if (mine().battlefield.filter((c) => c.name === 'Mountain').length >= 4) break;
    const cursor = me.mark();
    me.act({ kind: 'turn.pass' });
    await me.waitFor(
      (m) =>
        m.type === 'room.state' && m.state.roomId === roomId && m.state.activeSeat === mySeat &&
        (m.state.players.find((x) => !x.isBot).landsThisTurn ?? 0) === 0,
      { since: cursor, timeoutMs: 90000 },
    );
    await sleep(400);
  }
  t.ok(mine().battlefield.filter((c) => c.name === 'Mountain').length >= 4, 'ramped to four lands', '');

  // 1) Cast the planeswalker (auto-tap pays {2}{R}{R}).
  const ch = mine().hand.find((c) => c.name.startsWith('Chandra'));
  t.ok(Boolean(ch), 'planeswalker in hand', '');
  let cursor = me.mark();
  me.act({ kind: 'cast', iid: ch.iid, x: 0.5, y: 0.45 });
  const landed = await me.waitFor(
    (m) =>
      m.type === 'room.state' && m.state.roomId === roomId &&
      m.state.players.find((p) => !p.isBot).battlefield.some((c) => c.iid === ch.iid),
    { since: cursor, timeoutMs: 8000 },
  );
  t.ok(Boolean(landed), 'planeswalker cast onto the battlefield (auto-tap)', '');

  // 2) Loyalty: enters at 4, +1 ability, -3 ability.
  let expected = 0;
  for (const [delta, label] of [[4, 'enters with 4'], [1, '+1 ability'], [-3, '-3 ability']]) {
    expected += delta;
    cursor = me.mark();
    me.act({ kind: 'card.counter', iid: ch.iid, counter: 'loyalty', delta });
    await sleep(500);
    const p = await fresh(cursor);
    const pw = p?.battlefield.find((c) => c.iid === ch.iid);
    t.ok(pw?.counters?.loyalty === expected, `loyalty after ${label} = ${expected}`, JSON.stringify(pw?.counters));
  }

  // 3) Loyalty survives a full turn cycle (auto-untap must not wipe counters).
  cursor = me.mark();
  me.act({ kind: 'turn.pass' });
  await me.waitFor(
    (m) =>
      m.type === 'room.state' && m.state.roomId === roomId && m.state.activeSeat === mySeat &&
      (m.state.players.find((x) => !x.isBot).landsThisTurn ?? 0) === 0,
    { since: cursor, timeoutMs: 90000 },
  );
  const afterTurn = await fresh(me.mark());
  const pwAfter = afterTurn?.battlefield.find((c) => c.iid === ch.iid);
  t.ok(pwAfter?.counters?.loyalty === expected, 'loyalty survives the turn cycle', JSON.stringify(pwAfter?.counters));
  t.ok(pwAfter?.tapped !== true, 'planeswalker not tapped by auto-untap', '');

  // 4) Zero loyalty -> graveyard.
  cursor = me.mark();
  me.act({ kind: 'card.counter', iid: ch.iid, counter: 'loyalty', delta: -expected });
  await sleep(400);
  me.act({ kind: 'card.move', iid: ch.iid, to: 'graveyard' });
  await sleep(800);
  const dead = await fresh(cursor);
  t.ok(dead?.graveyard.some((c) => c.iid === ch.iid), 'planeswalker at zero loyalty goes to the graveyard', '');
  t.ok(!dead?.battlefield.some((c) => c.iid === ch.iid), 'planeswalker left the battlefield', '');

  const errors = me.messages.filter((m) => m.type === 'error');
  t.ok(errors.length === 0, 'no rejected actions', JSON.stringify(errors.slice(0, 3)));

  // Transcript for the human record.
  mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const lines = me.messages
    .filter((m) => m.type === 'log' && (!m.roomId || m.roomId === roomId))
    .map((m) => `[${new Date(m.ts).toLocaleTimeString()}] ${m.text}`);
  writeFileSync(
    join(LOG_DIR, `planeswalker-${stamp}.txt`),
    ['# Scripted planeswalker audit', 'deck: 30 Mountain + 10 Chandra, Torch of Defiance', '', ...lines].join('\n'),
  );

  clearInterval(guard);
  me.send({ type: 'room.leave' });
  await deleteRoom(me, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('planeswalker-audit crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'planeswalker-audit', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
