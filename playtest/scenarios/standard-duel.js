// Scenario 2: 1v1 standard duel (20 life). Proves: the starting seat skips
// its first draw while the other player draws on their first turn; no free
// mulligan in 1v1 standard; turn.set extra turns; stack push from the
// battlefield; 1v1 combat without defenderSeat; concede via room.leave wipes
// the leaver's cards everywhere.
import { PlaytestClient, Assert, deleteRoom } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

async function main() {
  const t = new Assert('standard-duel');
  const names = ['pt_alice', 'pt_bob'];
  const seeded = await ensureSeed(names);
  const [alice, bob] = names.map((n) => new PlaytestClient(n, { password: PASSWORD, assert: t }));
  for (const c of [alice, bob]) {
    await c.ensureUser();
    await c.connect();
  }

  const roomRes = await alice.api('POST', '/api/rooms', {
    name: 'pt standard duel',
    seats: 2,
    persistent: false,
    format: 'standard',
  });
  t.ok(roomRes.status === 201, 'room created (standard, 2 seats)', `status ${roomRes.status}`);
  const roomId = roomRes.json.roomId;

  let m = alice.mark();
  alice.joinRoom(roomId, seeded.pt_alice.deckId);
  let st = await alice.expectState((s) => s.players.length === 1, 'alice seated', 5000, { since: m });
  t.ok(st && alice.me(st).life === 20, 'standard room: 20 starting life', st ? `${alice.me(st).life}` : '');
  t.ok(st && !alice.me(st).command[0]?.isCommander, 'commander-board card NOT flagged isCommander in standard', '');
  m = bob.mark();
  bob.joinRoom(roomId, seeded.pt_bob.deckId);
  await bob.expectState((s) => s.players.length === 2, 'bob seated', 5000, { since: m });

  // --- start + mulligans (no free first in 1v1 standard) --------------------
  m = alice.mark();
  alice.send({ type: 'room.start' });
  st = await alice.expectState(
    (s) => s.started && s.players.every((p) => p.handCount === 7 && p.mulligan?.state === 'deciding'),
    'started: 7-card hands, mulligan decisions open',
    5000,
    { since: m },
  );

  // alice keeps first (auto-turn waits for ALL seats to keep)
  m = alice.mark();
  alice.act({ kind: 'mull.keep', bottomIids: [] });
  await alice.expectLog(/pt_alice keeps at 7/, 'alice keeps at 7', { since: m });

  // bob mulls once -> NOT free in standard, must bottom 1
  m = bob.mark();
  bob.act({ kind: 'mull.take' });
  await bob.expectLog(/pt_bob mulligans to 7(?! \(free\))/, 'bob\'s first mulligan is NOT free in 1v1 standard', { since: m });
  st = await bob.expectState((s) => bob.me(s).mulligan?.taken === 1, 'bob mulligan.taken = 1', 5000, { since: m });
  const bottomIid = bob.me(st).hand[0].iid;
  m = alice.mark();
  const mBob = bob.mark();
  bob.act({ kind: 'mull.keep', bottomIids: [bottomIid] });
  await bob.expectLog(/pt_bob keeps at 6/, 'bob bottoms 1, keeps at 6', { since: mBob });

  // --- all kept -> starting seat's first turn: DRAW IS SKIPPED ----------------
  await alice.expectLog(/pt_alice untaps \(first draw skipped\)/, 'starting seat skips its first draw (standard)', { since: m });
  st = await alice.expectState(
    (s) => alice.me(s).handCount === 7 && alice.me(s).libraryCount === 92,
    'alice hand still 7 (no draw), library 92',
    5000,
    { since: m },
  );

  // alice passes: bob (non-starting seat) DOES draw on his first turn
  m = alice.mark();
  alice.act({ kind: 'turn.pass' });
  await alice.expectLog(/pt_bob untaps and draws a card/, 'other player draws on his first turn', { since: m });
  st = await alice.expectState(
    (s) => s.activeSeat === 1 && s.players.find((p) => p.seat === 1).handCount === 7,
    'bob active, hand 7 (kept 6 + drew 1)',
    5000,
    { since: m },
  );

  // bob passes back: wrap -> turn 2, and NOW alice draws (skip was turn-1 only)
  m = bob.mark();
  bob.act({ kind: 'turn.pass' });
  await bob.expectLog(/pt_bob passes the turn to pt_alice \(turn 2\)/, 'wrap to turn 2', { since: m });
  await bob.expectLog(/pt_alice untaps and draws a card/, 'starting seat draws normally on turn 2', { since: m });
  st = await alice.expectState(
    (s) => s.turnNumber === 2 && s.activeSeat === 0 && alice.me(s).handCount === 8,
    'turn 2: alice hand 8',
    5000,
    { since: m },
  );

  // --- turn.set extra turn to self ---------------------------------------------
  m = alice.mark();
  alice.act({ kind: 'turn.set', seat: 0 });
  await alice.expectLog(/pt_alice hands the turn to pt_alice \(turn 3\)/, 'extra turn: turn.set to self increments turnNumber', { since: m });
  st = await alice.expectState(
    (s) => s.turnNumber === 3 && s.activeSeat === 0 && alice.me(s).handCount === 9,
    'extra turn: alice active again, drew again (hand 9)',
    5000,
    { since: m },
  );

  // --- stack push from battlefield ------------------------------------------------
  const permIid = alice.me(st).hand[0].iid;
  m = alice.mark();
  alice.act({ kind: 'card.move', iid: permIid, to: 'battlefield', x: 0.4, y: 0.5 });
  await alice.expectState((s) => alice.me(s).battlefield.some((c) => c.iid === permIid), 'permanent deployed', 5000, { since: m });
  m = bob.mark();
  alice.act({ kind: 'stack.push', iid: permIid });
  st = await bob.expectState(
    (s) => s.stack.length === 1 && s.stack[0].iid === permIid && !s.stack[0].revealed,
    'battlefield card on stack (public source: not marked revealed)',
    5000,
    { since: m },
  );
  m = alice.mark();
  alice.act({ kind: 'stack.resolve', iid: permIid, to: 'battlefield', x: 0.45, y: 0.5 });
  await alice.expectLog(/pt_alice resolves /, 'stack resolve logged', { since: m });
  st = await alice.expectState(
    (s) => s.stack.length === 0 && alice.me(s).battlefield.some((c) => c.iid === permIid),
    'resolved back to the battlefield',
    5000,
    { since: m },
  );

  // --- 1v1 combat: no defenderSeat needed --------------------------------------------
  m = alice.mark();
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => s.combat && s.phase === 'attack', 'combat begun', 5000, { since: m });
  m = alice.mark();
  const mBobAtk = bob.mark();
  alice.act({ kind: 'combat.attack', iid: permIid });
  await alice.expectLog(/ attacks, tapped/, 'attack declared without defenderSeat, auto-tapped', { since: m });
  st = await bob.expectState(
    (s) => s.combat?.attackers.length === 1 && s.combat.attackers[0].iid === permIid && s.combat.attackers[0].defenderSeat === undefined,
    'attacker registered with no defenderSeat',
    5000,
    { since: mBobAtk },
  );
  m = alice.mark();
  alice.act({ kind: 'combat.end' });
  await alice.expectState((s) => s.combat === null && s.phase === 'main2', 'combat ended', 5000, { since: m });

  // --- concede via room.leave: leaver's cards vanish everywhere -------------------------
  // Put a bob card on the shared stack first, to prove shared-zone cleanup too.
  st = bob.lastState();
  const bobStackIid = bob.me(st).hand[0].iid;
  m = bob.mark();
  bob.act({ kind: 'stack.push', iid: bobStackIid });
  await bob.expectState((s) => s.stack.some((e) => e.iid === bobStackIid), 'bob leaves a card on the stack', 5000, { since: m });

  m = alice.mark();
  bob.send({ type: 'room.leave' });
  await alice.expectLog(/pt_bob leaves the room/, 'concede logged', { since: m });
  st = await alice.expectState(
    (s) => s.players.length === 1 && s.players[0].userId === alice.userId && s.stack.every((e) => e.owner !== bob.userId),
    'leaver gone: no bob player entry, no bob cards on stack',
    5000,
    { since: m },
  );
  t.ok(st && !JSON.stringify(st).includes(bobStackIid), 'no trace of bob\'s stack card anywhere in state', '');

  await deleteRoom(alice, roomId);
  await alice.close();
  await bob.close();

  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((e) => {
  console.error('standard-duel crashed:', e);
  console.log(`##RESULT## ${JSON.stringify({ name: 'standard-duel', passed: 0, failed: 1, durationMs: 0, crashed: String(e) })}`);
  process.exit(1);
});
