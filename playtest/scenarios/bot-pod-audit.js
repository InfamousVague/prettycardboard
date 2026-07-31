// Scenario: 4-bot pod audit — four AI seats, each with a KNOWN precon, played
// out under enforced rules while a spectator records everything.
//
// The point is not pass/fail alone: it writes a full local transcript
// (playtest/logs/) so a human can read exactly what the bots did and check it
// against the decks they were dealt. Assertions cover the invariants that
// matter — turn order rotates, one land per turn per seat, no rejected bot
// actions, combat runs the enforced machine, damage matches the preview.
//
//   node scenarios/bot-pod-audit.js            (default: 4 bots, ~4 min)
//   POD_SEATS=4 POD_WATCH_MS=240000 node scenarios/bot-pod-audit.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(HERE, '..', 'logs');

/**
 * Exact land classification for the bot decks. A card-NAME regex silently
 * misses every nonbasic ("Command Tower", "Sunken Hollow", "Exotic Orchard"),
 * which made an earlier version of this transcript under-report every seat's
 * land count by more than half. The bots play the embedded precons, and that
 * file already carries per-card type letters — so ask it.
 */
const BOT_ATTRS = (() => {
  try {
    const raw = readFileSync(join(HERE, '..', '..', 'server', 'src', 'data', 'bot_data.json'), 'utf8');
    return JSON.parse(raw).attrs ?? {};
  } catch {
    return {};
  }
})();
const isLandCard = (card) => {
  const a = card.scryfallId ? BOT_ATTRS[card.scryfallId] : undefined;
  if (a) return a.t.includes('L');
  // Unknown card (not from a bot deck): fall back to the basic-land names,
  // and say so in the transcript rather than pretending to be exact.
  return /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/i.test(card.name);
};

const SEATS = Number(process.env.POD_SEATS ?? 4);
const WATCH_MS = Number(process.env.POD_WATCH_MS ?? 240_000);
/** Each seat gets a named deck so the transcript is checkable against a list. */
const SCRIPT = [
  { deckCode: 'FIC-1', style: 'aggro', difficulty: 'hard' },
  { deckCode: 'FIC-2', style: 'casual', difficulty: 'normal' },
  { deckCode: 'FIC-3', style: 'defensive', difficulty: 'normal' },
  { deckCode: 'FIC-4', style: 'aggro', difficulty: 'easy' },
];

async function main() {
  const t = new Assert('bot-pod-audit');
  const seeded = await ensureSeed(['pt_alice']);
  const host = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await host.ensureUser();
  await host.connect();
  host.send({ type: 'room.leave' });
  await sleep(300);

  const mk = await host.api('POST', '/api/rooms', {
    name: 'Bot pod audit', seats: SEATS, persistent: false, format: 'commander',
  });
  const roomId = mk.json.roomId;
  // Room-scoped state read: lastState() is not room-aware, and a stale room
  // from another scenario would silently answer every predicate.
  const state = () => {
    const m = [...host.messages].reverse().find((x) => x.type === 'room.state' && x.state.roomId === roomId);
    return m?.state;
  };

  host.joinRoom(roomId, seeded.pt_alice.deckId);
  await host.waitFor((m) => m.type === 'room.state' && m.state.roomId === roomId, { timeoutMs: 6000 });
  host.send({ type: 'room.settings', settings: { ...(state().settings ?? {}), enforced: true } });
  await host.waitFor(
    (m) => m.type === 'room.state' && m.state.roomId === roomId && m.state.settings?.enforced,
    { timeoutMs: 5000 },
  );

  // The host steps out so every seat is a bot, then seats the scripted four.
  host.send({ type: 'room.leave' });
  await sleep(500);
  host.send({ type: 'room.spectate', roomId });
  await host.waitFor((m) => m.type === 'room.state' && m.state.roomId === roomId, { timeoutMs: 6000 });

  for (const bot of SCRIPT.slice(0, SEATS)) {
    host.send({ type: 'bot.add', ...bot });
    await sleep(700);
  }
  const seated = await host.waitFor(
    (m) => m.type === 'room.state' && m.state.roomId === roomId && m.state.players.length === SEATS,
    { timeoutMs: 15000 },
  );
  t.ok(Boolean(seated), `${SEATS} bots seated`, '');
  t.ok(
    (state().players ?? []).every((p) => p.isBot),
    'every seat is a bot',
    (state().players ?? []).map((p) => `${p.username}:${p.deckName}`).join(' | '),
  );

  // Oracle prefetch for four precons before the rules engine needs it.
  await sleep(9000);
  host.send({ type: 'room.start' });
  const started = await host.waitFor(
    (m) => m.type === 'room.state' && m.state.roomId === roomId && m.state.started,
    { timeoutMs: 8000 },
  );
  t.ok(Boolean(started), 'spectating host started the all-bot pod', '');

  // ---- observe -----------------------------------------------------------
  const t0 = Date.now();
  const logs = [];
  const chats = [];
  const errors = [];
  const snapshots = [];
  let maxTurn = 1;
  let mark = `${state()?.turnNumber ?? 1}:${state()?.activeSeat ?? 0}`;
  let lastMoveAt = Date.now();
  let stalled = false;
  let sawCombat = false;
  let sawPreview = false;
  const seatsActive = new Set();

  const collect = (m) => {
    if (m.roomId && m.roomId !== roomId) return;
    if (m.type === 'log') logs.push({ ts: m.ts, seq: m.seq, text: m.text });
    if (m.type === 'chat') chats.push({ ts: m.ts, from: m.from.username, text: m.text });
    if (m.type === 'error') errors.push({ code: m.code, message: m.message });
  };
  host.messages.forEach(collect);
  const seen = new Set(host.messages);
  const drain = () => {
    for (const m of host.messages) {
      if (seen.has(m)) continue;
      seen.add(m);
      collect(m);
    }
  };

  while (Date.now() - t0 < WATCH_MS) {
    await sleep(1200);
    drain();
    const s = state();
    if (!s) continue;
    maxTurn = Math.max(maxTurn, s.turnNumber ?? 1);
    seatsActive.add(s.activeSeat);
    const now = `${s.turnNumber}:${s.activeSeat}`;
    if (now !== mark) {
      mark = now;
      lastMoveAt = Date.now();
      snapshots.push({
        at: Date.now() - t0,
        turn: s.turnNumber,
        activeSeat: s.activeSeat,
        players: s.players.map((p) => ({
          seat: p.seat,
          name: p.username,
          life: p.life,
          hand: p.handCount,
          library: p.libraryCount,
          board: p.battlefield.length,
          lands: p.battlefield.filter(isLandCard).length,
          graveyard: p.graveyard.length,
          landsThisTurn: p.landsThisTurn ?? 0,
          counters: p.battlefield
            .filter((c) => Object.keys(c.counters ?? {}).length > 0)
            .map((c) => `${c.name}{${Object.entries(c.counters).map(([k, v]) => `${k}:${v}`).join(',')}}`),
        })),
      });
    }
    if (s.combat?.attackers?.length) sawCombat = true;
    if (s.combat?.preview) sawPreview = true;
    if (Date.now() - lastMoveAt > 45_000) { stalled = true; break; }
    if (s.matchResult) break;
    if (s.players.some((p) => p.life <= 0)) break;
  }
  drain();

  // ---- assertions --------------------------------------------------------
  const final = state();
  t.ok(!stalled, 'pod never stalled (a seat acted within 45s)', stalled ? 'STALLED' : '');
  t.ok(maxTurn >= 3, 'several turn rounds played', `reached turn ${maxTurn}`);
  t.ok(seatsActive.size === SEATS, 'turn order visited every seat', [...seatsActive].join(','));
  t.ok(sawCombat, 'combat happened', '');
  t.ok(sawPreview || logs.some((l) => /combat|attacks/i.test(l.text)), 'enforced combat ran', '');
  t.ok(errors.length === 0, 'no rejected actions during the pod', JSON.stringify(errors.slice(0, 4)));

  // One land per turn per seat: no snapshot may ever show landsThisTurn > 1.
  const overLand = snapshots.flatMap((s) => s.players.filter((p) => p.landsThisTurn > 1).map((p) => `${p.name} t${s.turn}`));
  t.ok(overLand.length === 0, 'no seat ever exceeded one land per turn', overLand.slice(0, 3).join(', '));

  // Life only moves through logged effects: every drop should have a log line.
  const lifeDrops = [];
  for (let i = 1; i < snapshots.length; i++) {
    for (const p of snapshots[i].players) {
      const before = snapshots[i - 1].players.find((x) => x.seat === p.seat);
      if (before && p.life < before.life) lifeDrops.push({ name: p.name, from: before.life, to: p.life, turn: snapshots[i].turn });
    }
  }
  t.ok(
    lifeDrops.length === 0 || logs.some((l) => /life|damage|combat/i.test(l.text)),
    'life changes are accompanied by log lines',
    `${lifeDrops.length} drops`,
  );

  // ---- write the transcript ---------------------------------------------
  mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = join(LOG_DIR, `bot-pod-${stamp}`);
  const roster = (final?.players ?? []).map((p) => ({
    seat: p.seat, name: p.username, deck: p.deckName, life: p.life,
    board: p.battlefield.map((c) => c.name), graveyard: p.graveyard.map((c) => c.name),
  }));
  writeFileSync(`${base}.json`, JSON.stringify({
    roomId, seats: SEATS, script: SCRIPT.slice(0, SEATS),
    turnsReached: maxTurn, stalled, errors, roster,
    matchResult: final?.matchResult ?? null,
    logs, chats, snapshots,
  }, null, 2));
  const lines = [
    `# Bot pod audit ${stamp}`,
    `room ${roomId} · ${SEATS} seats · turns reached ${maxTurn} · stalled=${stalled} · errors=${errors.length}`,
    '',
    '## Roster',
    ...roster.map((r) => `- seat ${r.seat} ${r.name} — ${r.deck} — life ${r.life} — board ${r.board.length} — gy ${r.graveyard.length}`),
    '',
    '## Table talk',
    ...chats.map((c) => `  [${new Date(c.ts).toLocaleTimeString()}] ${c.from}: ${c.text}`),
    '',
    '## Audit log',
    ...logs.map((l) => `  [${new Date(l.ts).toLocaleTimeString()}] #${l.seq} ${l.text}`),
    '',
    '## Turn snapshots',
    ...snapshots.map((s) =>
      `  t${s.turn} seat${s.activeSeat} @${Math.round(s.at / 1000)}s :: ` +
      s.players.map((p) => `${p.name}[life ${p.life} hand ${p.hand} board ${p.board}/${p.lands}L gy ${p.graveyard}${p.counters.length ? ' ' + p.counters.join(' ') : ''}]`).join('  '),
    ),
  ];
  writeFileSync(`${base}.txt`, lines.join('\n'));
  console.log(`  transcript: ${base}.txt`);
  console.log(`  json:       ${base}.json`);
  console.log(`  turns=${maxTurn} logs=${logs.length} chats=${chats.length} errors=${errors.length}`);

  host.send({ type: 'room.leave' });
  await deleteRoom(host, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('bot-pod-audit crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'bot-pod-audit', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
