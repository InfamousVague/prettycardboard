// Scenario 6: AI vs AI — a full autonomous match between server bots, observed
// as a spectator. A human seats bots, starts, then leaves; the turn advances
// off the vacated seat (leave_room) and the bot scheduler drives the rest.
// Proves the match loop runs end to end without a human: turns advance, boards
// develop, combat deals damage, and it never stalls.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

const OBSERVE_MS = 90_000; // watch up to 90s of autonomous play
const STALL_MS = 20_000; // turn number must advance at least this often

async function main() {
  const t = new Assert('ai-match');
  const seeded = await ensureSeed(['pt_alice']);
  const host = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await host.ensureUser();
  await host.connect();
  host.send({ type: 'room.leave' });
  await sleep(300);

  const mk = await host.api('POST', '/api/rooms', {
    name: 'AI vs AI', seats: 3, persistent: false, format: 'commander',
  });
  const roomId = mk.json.roomId;
  host.joinRoom(roomId, seeded.pt_alice.deckId);
  await host.expectState((s) => s.players.length === 1, 'host seated', 5000);

  // Fill the other two seats with bots.
  host.send({ type: 'bot.add', style: 'aggro' });
  host.send({ type: 'bot.add', style: 'casual' });
  await host.expectState((s) => s.players.filter((p) => p.isBot).length === 2, 'two bots seated', 10_000);

  host.send({ type: 'room.start' });
  await host.expectState((s) => s.started, 'started', 5000);
  host.act({ kind: 'mull.keep', bottomIids: [] });
  // Wait until every bot has resolved its mulligan and turns are live.
  await host.expectState(
    (s) => s.players.filter((p) => p.isBot).every((p) => p.mulligan?.state === 'kept'),
    'both bots kept their hands',
    30_000,
  );

  // Leave: the vacated active seat must advance to a bot, not stall the game.
  const beforeSeat = host.lastState().activeSeat;
  host.send({ type: 'room.leave' });
  await sleep(1500);

  // Re-attach as a spectator to observe the all-bot match.
  const spec = new PlaytestClient('pt_bob', { password: PASSWORD, assert: t });
  await spec.ensureUser();
  await spec.connect();
  spec.send({ type: 'room.leave' });
  await sleep(300);
  spec.send({ type: 'room.spectate', roomId });
  const first = await spec.expectState((s) => s.players.length === 2, 'spectating the 2-bot match', 8000);
  t.ok(first.players.every((p) => p.isBot), 'both remaining seats are bots', '');
  console.log(`  (host was active on seat ${beforeSeat}; observing autonomously...)`);

  // Observe: track turn progress, life totals, board development, and damage.
  const start = spec.messages.length;
  const t0 = Date.now();
  let maxTurn = first.turnNumber ?? 1;
  let lastTurnAt = Date.now();
  let sawDamage = false;
  let sawCombat = false;
  let maxBoard = 0;
  let stalled = false;
  const startingLife = Object.fromEntries(first.players.map((p) => [p.seat, p.life]));

  while (Date.now() - t0 < OBSERVE_MS) {
    await sleep(1500);
    const s = spec.lastState();
    if (!s) continue;
    if ((s.turnNumber ?? 0) > maxTurn) { maxTurn = s.turnNumber; lastTurnAt = Date.now(); }
    for (const p of s.players) {
      maxBoard = Math.max(maxBoard, p.battlefield.length);
      if (p.life < (startingLife[p.seat] ?? 40)) sawDamage = true;
    }
    if (s.combat && s.combat.attackers.length > 0) sawCombat = true;
    if (Date.now() - lastTurnAt > STALL_MS) { stalled = true; break; }
    // A bot dropping to <= 0 is a natural stopping point.
    if (s.players.some((p) => p.life <= 0)) break;
  }

  // Combat log evidence from the bot actors.
  const combatLogs = spec.messages
    .slice(start)
    .filter((m) => m.type === 'log' && /(begins combat|attacks|loses \d+ life)/.test(m.text ?? '')).length;

  const finalState = spec.lastState();
  console.log(`  turns=${maxTurn} maxBoard=${maxBoard} combatLogs=${combatLogs} damage=${sawDamage} lives=${finalState.players.map((p) => p.life).join('/')}`);

  t.ok(!stalled, `match never stalled (turn advanced within ${STALL_MS / 1000}s)`, stalled ? 'STALLED' : '');
  t.ok(maxTurn >= 4, 'match progressed several turns autonomously', `reached turn ${maxTurn}`);
  t.ok(maxBoard >= 3, 'bots developed their boards', `max ${maxBoard} permanents`);
  t.ok(sawCombat || combatLogs > 0, 'combat happened during the AI match', `${combatLogs} combat log lines`);
  t.ok(sawDamage, 'a bot took combat damage (life dropped)', '');

  spec.send({ type: 'room.leave' });
  await deleteRoom(host, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('ai-match crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'ai-match', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
