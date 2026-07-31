// Scenario: enforced bot-vs-bot fuzz (rules roadmap testing contract). All
// four Final Fantasy precons play each other at one enforced commander table
// with a spectating host, and the run asserts the engine never lets a bot
// wedge or cheat:
//   - zero "[rules]" log lines (a rejected bot action is an engine bug);
//   - no error frames reach the spectator;
//   - per-seat card conservation (tokens excluded) holds steady;
//   - trigger prompts aimed at bots are always answered, never left to lapse;
//   - the game actually progresses (turns advance).
// Timeboxed: the table plays for a window, then the room is torn down.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

const WINDOW_MS = 100_000;
const POLL_MS = 1500;

async function main() {
  const t = new Assert('enforced-brawl');
  const host = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await host.ensureUser();
  await host.connect();
  host.send({ type: 'room.leave' });
  await sleep(300);

  const mk = await host.api('POST', '/api/rooms', {
    name: 'Enforced brawl', seats: 4, persistent: false, format: 'commander',
  });
  const roomId = mk.json.roomId;
  // Spectating host: the four seats belong to the four precons.
  host.spectateRoom(roomId);
  await host.expectState((s) => s.roomId === roomId, 'spectating the table', 5000);
  const st = host.lastState().settings ?? {};
  host.send({ type: 'room.settings', settings: { ...st, enforced: true } });
  await host.expectState((s) => s.settings?.enforced === true, 'enforced on', 5000);

  const BOTS = [
    { deckCode: 'FIC-1', style: 'aggro', difficulty: 'hard' },
    { deckCode: 'FIC-2', style: 'casual', difficulty: 'normal' },
    { deckCode: 'FIC-3', style: 'defensive', difficulty: 'hard' },
    { deckCode: 'FIC-4', style: 'casual', difficulty: 'normal' },
  ];
  for (const bot of BOTS) host.send({ type: 'bot.add', ...bot });
  await host.expectState(
    (s) => s.players.filter((p) => p.isBot).length === 4,
    'all four FF precons seated as bots',
    10000,
  );

  // Oracle prefetch across four precons (a few Scryfall batches).
  await sleep(10000);
  const preStart = host.mark();
  host.send({ type: 'room.start' });
  await host.expectState((s) => s.started, 'all-bot table started by spectator host', 8000);
  await host.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    'every bot settled its mulligan',
    30000,
  );

  // Baseline: per-seat total cards across every visible zone (tokens out).
  const seatTotal = (p, state) => {
    const zone = (cards) => (cards ?? []).filter((c) => !c.isToken).length;
    const stackOwned = (state.stack ?? []).filter((c) => c.ownerSeat === p.seat && !c.isToken).length;
    return (
      (p.handCount ?? 0) + (p.libraryCount ?? 0) + zone(p.battlefield) + zone(p.graveyard) +
      zone(p.exile) + zone(p.command) + stackOwned
    );
  };
  let state = host.lastState();
  const baseline = new Map(state.players.map((p) => [p.seat, seatTotal(p, state)]));
  for (const [seat, total] of baseline) {
    t.ok(total >= 98, `seat ${seat} baseline sane`, `${total} cards`);
  }

  // Watch the brawl.
  const firstSeen = new Map(); // trigger id -> first-seen ms
  const shortStreak = new Map(); // seat -> consecutive short polls
  let promptsSeen = 0;
  let conservationOk = true;
  let promptWedged = false;
  const startTurn = state.turnNumber ?? 1;
  let maxTurn = startTurn;
  const t0 = Date.now();
  while (Date.now() - t0 < WINDOW_MS) {
    await sleep(POLL_MS);
    state = host.lastState();
    if (!state?.started) break;
    maxTurn = Math.max(maxTurn, state.turnNumber ?? 1);
    if (state.matchResult) break;

    // Trigger prompts: bots must answer within a few seconds.
    const now = Date.now();
    const pending = state.pendingTriggers ?? [];
    for (const p of pending) {
      if (!firstSeen.has(p.id)) {
        firstSeen.set(p.id, now);
        promptsSeen += 1;
      } else if (now - firstSeen.get(p.id) > 12_000) {
        promptWedged = true;
      }
    }

    // Conservation, with a transient allowance for the moment a commander
    // sits inside a pending cmd.choice (bots answer within a tick).
    for (const p of state.players) {
      const want = baseline.get(p.seat);
      const got = seatTotal(p, state);
      if (got === want) {
        shortStreak.set(p.seat, 0);
      } else {
        const streak = (shortStreak.get(p.seat) ?? 0) + 1;
        shortStreak.set(p.seat, streak);
        if (streak >= 3) {
          conservationOk = false;
          console.log(`  conservation drift: seat ${p.seat} has ${got}, want ${want}`);
        }
      }
    }
  }

  const illegal = host.messages.filter(
    (m) => m.type === 'log' && /\[rules\]/.test(m.text ?? ''),
  );
  t.eq(illegal.length, 0, 'zero illegal-state ([rules]) log lines');
  if (illegal.length) for (const m of illegal.slice(0, 5)) console.log(`  ${m.text}`);
  const errors = host.errorsSince(preStart);
  t.eq(errors.length, 0, 'no error frames reached the spectator');
  t.ok(conservationOk, 'per-seat card conservation held', '');
  t.ok(!promptWedged, 'no trigger prompt sat unanswered past 12s', '');
  t.ok(
    maxTurn > startTurn || state?.matchResult != null,
    'the game progressed (turns advanced or a result landed)',
    `turn ${startTurn} -> ${maxTurn}`,
  );
  // Not a hard gate (a draw-light window can legitimately fire few triggers),
  // but the count is worth surfacing in the run output.
  console.log(`  trigger prompts observed: ${promptsSeen}`);
  const trigLogs = host.messages.filter(
    (m) => m.type === 'log' && /^Trigger: /.test(m.text ?? ''),
  ).length;
  console.log(`  trigger fire logs: ${trigLogs}`);

  host.send({ type: 'room.leave' });
  await deleteRoom(host, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('enforced-brawl crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'enforced-brawl', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
