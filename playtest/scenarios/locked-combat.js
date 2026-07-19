// Scenario: Combat v3 locked declarations (PROTOCOL.md Combat v3 addendum).
// Proves: lock freezes attacker declarations (error `locked`), targeted
// defenders respond with blocks + combat.ready, the server resolves damage
// and deaths itself, every viewer receives combat.results, prevent zeroes a
// combat, combat.end cancels a locked combat without a legacy settle, and a
// bot defender readies through and takes damage exactly once.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

/** Mint a token and return its iid from the room.event payload (no resync). */
async function mintToken(client, { name, power, toughness, x = 0.4, y = 0.5 }) {
  const m = client.mark();
  client.act({ kind: 'token.create', name, power, toughness, x, y });
  const ev = await client.waitFor(
    (msg) => msg.type === 'room.event' && msg.action?.kind === 'token.create' && msg.action?.card?.name === name,
    { since: m, timeoutMs: 5000 },
  );
  if (!ev?.action?.card?.iid) throw new Error(`token ${name} did not mint`);
  return ev.action.card.iid;
}

async function main() {
  const t = new Assert('locked-combat');
  const names = ['pt_alice', 'pt_bob'];
  const seeded = await ensureSeed(names);
  const [alice, bob] = names.map((n) => new PlaytestClient(n, { password: PASSWORD, assert: t }));
  for (const c of [alice, bob]) {
    await c.ensureUser();
    await c.connect();
  }

  const roomRes = await alice.api('POST', '/api/rooms', {
    name: 'pt locked combat',
    seats: 2,
    persistent: false,
    format: 'standard',
  });
  t.ok(roomRes.status === 201, 'room created', `status ${roomRes.status}`);
  const roomId = roomRes.json.roomId;

  let m = alice.mark();
  alice.joinRoom(roomId, seeded.pt_alice.deckId);
  await alice.expectState((s) => s.players.length === 1, 'alice seated', 5000, { since: m });
  m = bob.mark();
  bob.joinRoom(roomId, seeded.pt_bob.deckId);
  await bob.expectState((s) => s.players.length === 2, 'bob seated', 5000, { since: m });

  m = alice.mark();
  alice.send({ type: 'room.start' });
  await alice.expectState((s) => s.started, 'started', 5000, { since: m });
  alice.act({ kind: 'mull.keep', bottomIids: [] });
  bob.act({ kind: 'mull.keep', bottomIids: [] });
  await alice.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept') && s.activeSeat === 0,
    'both kept, alice active',
    5000,
    { since: m },
  );

  // ---- combat 1: block-no-deaths + unblocked damage ------------------------
  const bear = await mintToken(alice, { name: 'PT Bear', power: '4', toughness: '4' });
  const goblin = await mintToken(alice, { name: 'PT Goblin', power: '2', toughness: '2', x: 0.55 });
  const wall = await mintToken(bob, { name: 'PT Wall', power: '1', toughness: '5' });

  m = alice.mark();
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => s.combat != null, 'combat begun', 5000, { since: m });
  alice.act({ kind: 'combat.attack', iid: bear, defenderSeat: 1, power: '4', toughness: '4' });
  alice.act({ kind: 'combat.attack', iid: goblin, defenderSeat: 1, power: '2', toughness: '2' });
  let st = await alice.expectState(
    (s) => s.combat?.attackers?.length === 2 && s.combat.attackers.every((a) => a.power != null),
    'two attackers declared with power/toughness',
    5000,
    { since: m },
  );
  t.ok(st?.combat?.locked !== true, 'combat not locked yet', '');

  m = alice.mark();
  const mBob = bob.mark();
  alice.act({ kind: 'combat.lock' });
  st = await alice.expectState(
    (s) => s.combat?.locked === true && s.phase === 'block',
    'locked: combat.locked true, phase block',
    5000,
    { since: m },
  );
  await bob.expectState((s) => s.combat?.locked === true, 'defender sees the lock', 5000, { since: mBob });
  await alice.expectLog(/locks in 2 attacker/, 'lock log line', { since: m });

  // Re-toggling an attacker after lock must be rejected.
  m = alice.mark();
  alice.act({ kind: 'combat.attack', iid: bear });
  const lockedErr = await alice.waitFor((msg) => msg.type === 'error' && msg.code === 'locked', {
    since: m,
    timeoutMs: 3000,
  });
  t.ok(!!lockedErr, 'combat.attack after lock errors `locked`', '');

  // Bob blocks the bear with the wall, then locks his response in.
  m = bob.mark();
  bob.act({ kind: 'combat.block', blockerIid: wall, attackerIid: bear, power: '1', toughness: '5' });
  await bob.expectState((s) => s.combat?.blocks?.length === 1, 'block declared', 5000, { since: m });

  m = alice.mark();
  const mBob2 = bob.mark();
  bob.act({ kind: 'combat.ready' });

  // Resolution: bear (4/4) fully blocked by wall (1/5), nobody dies; goblin
  // (2/2) unblocked hits bob for 2 (20 -> 18).
  st = await bob.expectState(
    (s) => s.combat == null && s.phase === 'main2' && bob.me(s).life === 18,
    'resolved: combat cleared, phase main2, bob 18 life',
    5000,
    { since: mBob2 },
  );
  t.ok(st && st.players.find((p) => p.seat === 0).battlefield.some((c) => c.iid === bear), 'bear survives (1 < 4)', '');
  t.ok(st && bob.me(st).battlefield.some((c) => c.iid === wall), 'wall survives (4 < 5)', '');

  const resultsA = await alice.waitFor((msg) => msg.type === 'combat.results', { since: m, timeoutMs: 5000 });
  const resultsB = await bob.waitFor((msg) => msg.type === 'combat.results', { since: mBob2, timeoutMs: 5000 });
  t.ok(!!resultsA && !!resultsB, 'combat.results reached both viewers', '');
  if (resultsA) {
    t.ok(resultsA.attackerSeat === 0, 'results: attackerSeat 0', `${resultsA.attackerSeat}`);
    t.ok(resultsA.entries?.length === 2, 'results: 2 entries', `${resultsA.entries?.length}`);
    const bearEntry = resultsA.entries?.find((e) => e.attackerIid === bear);
    const goblinEntry = resultsA.entries?.find((e) => e.attackerIid === goblin);
    t.ok(
      bearEntry && bearEntry.blockers?.length === 1 && bearEntry.blockers[0].died === false && bearEntry.attackerDied === false,
      'results: bear blocked, no deaths',
      JSON.stringify(bearEntry),
    );
    t.ok(
      goblinEntry && goblinEntry.blockers?.length === 0 && goblinEntry.damageToDefender === 2,
      'results: goblin unblocked for 2',
      JSON.stringify(goblinEntry),
    );
    t.ok(resultsA.totalBySeat?.['1'] === 2, 'results: totalBySeat[1] = 2', JSON.stringify(resultsA.totalBySeat));
  }

  // ---- combat 2: blocker dies, then attacker dies --------------------------
  const giant = await mintToken(alice, { name: 'PT Giant', power: '5', toughness: '5', x: 0.7 });
  const squire = await mintToken(bob, { name: 'PT Squire', power: '2', toughness: '2', x: 0.6 });

  m = alice.mark();
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => s.combat != null, 'combat 2 begun (same turn)', 5000, { since: m });
  alice.act({ kind: 'combat.attack', iid: giant, defenderSeat: 1, power: '5', toughness: '5' });
  alice.act({ kind: 'combat.lock' });
  await bob.expectState((s) => s.combat?.locked === true, 'combat 2 locked', 5000, { since: m });
  const mBob3 = bob.mark();
  bob.act({ kind: 'combat.block', blockerIid: squire, attackerIid: giant, power: '2', toughness: '2' });
  await bob.expectState((s) => s.combat?.blocks?.length === 1, 'squire blocks the giant', 5000, { since: mBob3 });
  bob.act({ kind: 'combat.ready' });
  st = await bob.expectState(
    (s) => s.combat == null && !bob.me(s).battlefield.some((c) => c.iid === squire),
    'squire dies (5 >= 2) and ceases (token)',
    5000,
    { since: mBob3 },
  );
  t.ok(st && bob.me(st).life === 18, 'fully blocked: bob still 18', st ? `${bob.me(st).life}` : '');
  t.ok(st && st.players.find((p) => p.seat === 0).battlefield.some((c) => c.iid === giant), 'giant survives (2 < 5)', '');
  const results2 = await bob.waitFor((msg) => msg.type === 'combat.results', { since: mBob3, timeoutMs: 5000 });
  t.ok(results2?.entries?.[0]?.blockers?.[0]?.died === true, 'results: squire marked dead', JSON.stringify(results2?.entries));

  const frail = await mintToken(alice, { name: 'PT Frail', power: '3', toughness: '3', x: 0.25 });
  const ogre = await mintToken(bob, { name: 'PT Ogre', power: '4', toughness: '4', x: 0.75 });
  m = alice.mark();
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => s.combat != null, 'combat 3 begun', 5000, { since: m });
  alice.act({ kind: 'combat.attack', iid: frail, defenderSeat: 1, power: '3', toughness: '3' });
  alice.act({ kind: 'combat.lock' });
  await bob.expectState((s) => s.combat?.locked === true, 'combat 3 locked', 5000, { since: m });
  const mBob4 = bob.mark();
  bob.act({ kind: 'combat.block', blockerIid: ogre, attackerIid: frail, power: '4', toughness: '4' });
  await bob.expectState((s) => s.combat?.blocks?.length === 1, 'ogre blocks the frail', 5000, { since: mBob4 });
  bob.act({ kind: 'combat.ready' });
  st = await alice.expectState(
    (s) => s.combat == null && !alice.me(s).battlefield.some((c) => c.iid === frail),
    'attacker dies (4 >= 3) and ceases',
    5000,
    { since: m },
  );
  t.ok(st && st.players.find((p) => p.seat === 1).battlefield.some((c) => c.iid === ogre), 'ogre survives (3 < 4)', '');
  const results3 = await alice.waitFor((msg) => msg.type === 'combat.results', { since: m, timeoutMs: 5000 });
  t.ok(results3?.entries?.[0]?.attackerDied === true, 'results: frail marked dead', JSON.stringify(results3?.entries));

  // ---- combat 4: prevent all damage ----------------------------------------
  const dragon = await mintToken(alice, { name: 'PT Dragon', power: '6', toughness: '6', x: 0.85 });
  m = alice.mark();
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => s.combat != null, 'combat 4 begun', 5000, { since: m });
  alice.act({ kind: 'combat.attack', iid: dragon, defenderSeat: 1, power: '6', toughness: '6' });
  alice.act({ kind: 'combat.lock' });
  await bob.expectState((s) => s.combat?.locked === true, 'combat 4 locked', 5000, { since: m });
  const mBob5 = bob.mark();
  bob.act({ kind: 'combat.ready', prevent: true });
  st = await bob.expectState(
    (s) => s.combat == null && bob.me(s).life === 18,
    'prevented: no damage, bob still 18',
    5000,
    { since: mBob5 },
  );
  const results4 = await bob.waitFor((msg) => msg.type === 'combat.results', { since: mBob5, timeoutMs: 5000 });
  t.ok(results4?.entries?.[0]?.prevented === true, 'results: entry marked prevented', JSON.stringify(results4?.entries));
  t.ok(
    !results4?.totalBySeat || (results4.totalBySeat['1'] ?? 0) === 0,
    'results: no damage totals under prevent',
    JSON.stringify(results4?.totalBySeat),
  );

  // ---- combat 5: cancel a locked combat ------------------------------------
  const knight = await mintToken(alice, { name: 'PT Knight', power: '3', toughness: '3', x: 0.15 });
  m = alice.mark();
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => s.combat != null, 'combat 5 begun', 5000, { since: m });
  alice.act({ kind: 'combat.attack', iid: knight, defenderSeat: 1, power: '3', toughness: '3' });
  alice.act({ kind: 'combat.lock' });
  await bob.expectState((s) => s.combat?.locked === true, 'combat 5 locked', 5000, { since: m });
  const mCancel = bob.mark();
  alice.act({ kind: 'combat.end' });
  st = await bob.expectState((s) => s.combat == null && bob.me(s).life === 18, 'canceled: no damage', 5000, {
    since: mCancel,
  });
  await bob.assertNever('combat.results', 'no combat.results on cancel', 1500, { since: mCancel });

  // ---- bot defender: readies through, damage applied exactly once ----------
  const botRoomRes = await alice.api('POST', '/api/rooms', {
    name: 'pt locked combat bot',
    seats: 2,
    persistent: false,
    format: 'standard',
  });
  t.ok(botRoomRes.status === 201, 'bot room created', `status ${botRoomRes.status}`);
  const botRoomId = botRoomRes.json.roomId;
  m = alice.mark();
  alice.joinRoom(botRoomId, seeded.pt_alice.deckId);
  await alice.expectState((s) => s.roomId === botRoomId && s.players.length === 1, 'alice seated in bot room', 5000, {
    since: m,
  });
  alice.send({ type: 'bot.add', style: 'casual' });
  st = await alice.expectState((s) => s.players.length === 2 && s.players.some((p) => p.isBot), 'bot seated', 5000, {
    since: m,
  });
  const botSeat = st.players.find((p) => p.isBot).seat;
  alice.send({ type: 'room.start' });
  alice.act({ kind: 'mull.keep', bottomIids: [] });
  st = await alice.expectState(
    (s) => s.started && s.players.every((p) => p.mulligan?.state === 'kept') && s.activeSeat === 0,
    'bot room underway, alice active',
    15000,
    { since: m },
  );
  const botLifeBefore = st.players.find((p) => p.isBot).life;

  const raptor = await mintToken(alice, { name: 'PT Raptor', power: '3', toughness: '3' });
  m = alice.mark();
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => s.combat != null, 'bot combat begun', 5000, { since: m });
  alice.act({ kind: 'combat.attack', iid: raptor, defenderSeat: botSeat, power: '3', toughness: '3' });
  alice.act({ kind: 'combat.lock' });
  await alice.expectState((s) => s.combat?.locked === true, 'bot combat locked', 5000, { since: m });

  const botResults = await alice.waitFor((msg) => msg.type === 'combat.results', { since: m, timeoutMs: 12000 });
  t.ok(!!botResults, 'bot defender readied; combat resolved', '');
  st = await alice.expectState(
    (s) => s.combat == null && s.players.find((p) => p.isBot).life === botLifeBefore - 3,
    `bot took exactly 3 (${botLifeBefore} -> ${botLifeBefore - 3})`,
    8000,
    { since: m },
  );
  // The legacy self-settle path must NOT fire on top of the server resolution.
  await sleep(2600);
  m = alice.mark();
  alice.requestResync();
  st = await alice.expectState((s) => s.roomId === botRoomId, 'post-settle resync', 5000, { since: m });
  t.ok(
    st && st.players.find((p) => p.isBot).life === botLifeBefore - 3,
    'bot life unchanged after bot ticks (no double settle)',
    st ? `${st.players.find((p) => p.isBot).life}` : '',
  );

  // ---- cleanup -------------------------------------------------------------
  await deleteRoom(alice, botRoomId);
  await deleteRoom(alice, roomId);
  await alice.close();
  await bob.close();
  const result = t.finish();
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('locked-combat crashed:', e);
  console.log(`##RESULT## ${JSON.stringify({ name: 'locked-combat', passed: 0, failed: 1, durationMs: 0, crashed: String(e) })}`);
  process.exit(1);
});
