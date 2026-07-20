// Scenario: manual guided combat (PROTOCOL.md Gameplay v2 "Guided combat").
// Combat is now a lightweight, unenforced, inform-only overlay: the server
// records who attacks whom and which creatures block which attackers, but it
// NEVER resolves damage or kills anything. Players read the overlay, then adjust
// life (life.add) and move dead creatures (card.move) BY HAND. There is no
// lock/ready/prevent, no auto-resolution, and no combat.results message.
//
// Proves: combat.begin opens the overlay and taps declared attackers; attackers
// and blocks carry client-declared power/toughness; unblocked damage is applied
// by hand via life.add; toggling an attacker off drops its block pairings;
// "dead" creatures are removed by hand (tokens cease); combat.end clears the
// overlay to main2 without touching life; combat also clears on turn change;
// and no combat.results frame is ever emitted.
import { PlaytestClient, Assert, deleteRoom } from '../lib.js';
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
    name: 'pt manual combat',
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
  await bob.expectState((s) => bob.me(s).life === 20, 'standard: bob starts at 20 life', 5000);

  // ---- combat 1: two attackers, one blocked, one unblocked (manual damage) ----
  const bear = await mintToken(alice, { name: 'PT Bear', power: '4', toughness: '4' });
  const goblin = await mintToken(alice, { name: 'PT Goblin', power: '2', toughness: '2', x: 0.55 });
  const wall = await mintToken(bob, { name: 'PT Wall', power: '1', toughness: '5' });

  m = alice.mark();
  const mBob = bob.mark();
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => s.combat != null && s.phase === 'attack', 'combat begun: overlay open, phase attack', 5000, { since: m });
  await alice.expectLog(/pt_alice begins combat/, 'combat.begin logged', { since: m });

  alice.act({ kind: 'combat.attack', iid: bear, defenderSeat: 1, power: '4', toughness: '4' });
  await alice.expectLog(/PT Bear attacks pt_bob, tapped/, 'attacker auto-taps and names its defender', { since: m });
  alice.act({ kind: 'combat.attack', iid: goblin, defenderSeat: 1, power: '2', toughness: '2' });

  let st = await bob.expectState(
    (s) =>
      s.combat?.attackers?.length === 2 &&
      s.combat.attackers.every((a) => a.defenderSeat === 1 && a.power != null && a.toughness != null) &&
      s.players.find((p) => p.seat === 0).battlefield.filter((c) => c.iid === bear || c.iid === goblin).every((c) => c.tapped),
    'defender sees 2 attackers w/ power/toughness + defenderSeat; both tapped',
    5000,
    { since: mBob },
  );
  const bearAtk = st?.combat.attackers.find((a) => a.iid === bear);
  t.ok(bearAtk && bearAtk.power === '4' && bearAtk.toughness === '4', 'bear attacker carries declared 4/4', JSON.stringify(bearAtk));

  // Bob blocks the bear with the wall; goblin is left unblocked.
  m = bob.mark();
  bob.act({ kind: 'combat.block', blockerIid: wall, attackerIid: bear, power: '1', toughness: '5' });
  await bob.expectLog(/PT Wall blocks PT Bear/, 'block pairing logged', { since: m });
  st = await bob.expectState(
    (s) => s.combat?.blocks?.length === 1 && s.combat.blocks[0].blockerIid === wall && s.combat.blocks[0].attackerIid === bear,
    'block recorded in the overlay',
    5000,
    { since: m },
  );
  const blk = st?.combat.blocks[0];
  t.ok(blk && blk.power === '1' && blk.toughness === '5', 'block carries the blocker declared 1/5', JSON.stringify(blk));

  // Server never resolves: the goblin (2 power) is unblocked, so bob takes 2 BY HAND.
  m = bob.mark();
  bob.act({ kind: 'life.add', delta: -2 });
  await bob.expectLog(/pt_bob loses 2 life \(18\)/, 'unblocked damage applied by hand via life.add', { since: m });
  bob.requestResync(); // life.add is log-only; pull a fresh state to read life + creatures
  st = await bob.expectState((s) => bob.me(s).life === 18, 'bob at 18 after taking the unblocked 2', 5000, { since: m });
  // Nothing died: the server touched no creatures during the whole overlay.
  t.ok(st.players.find((p) => p.seat === 0).battlefield.some((c) => c.iid === bear), 'bear still on battlefield (no auto-resolution)', '');
  t.ok(bob.me(st).battlefield.some((c) => c.iid === wall), 'wall still on battlefield (no auto-resolution)', '');

  m = alice.mark();
  const mBobEnd = bob.mark();
  alice.act({ kind: 'combat.end' });
  await alice.expectState((s) => s.combat == null && s.phase === 'main2', 'combat.end: overlay cleared, phase main2', 5000, { since: m });
  await bob.expectState((s) => s.combat == null && bob.me(s).life === 18, 'combat.end leaves life untouched', 5000, { since: mBobEnd });
  await bob.assertNever('combat.results', 'no combat.results frame exists in the manual model', 1200, { since: mBobEnd });

  // ---- combat 2: toggling an attacker off drops its block pairings -----------
  const giant = await mintToken(alice, { name: 'PT Giant', power: '5', toughness: '5', x: 0.7 });
  const squire = await mintToken(bob, { name: 'PT Squire', power: '2', toughness: '2', x: 0.6 });

  m = alice.mark();
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => s.combat != null && s.phase === 'attack', 'combat 2 begun (same turn)', 5000, { since: m });
  alice.act({ kind: 'combat.attack', iid: giant, defenderSeat: 1, power: '5', toughness: '5' });
  await alice.expectState((s) => s.combat?.attackers?.length === 1, 'giant declared as the lone attacker', 5000, { since: m });

  m = bob.mark();
  bob.act({ kind: 'combat.block', blockerIid: squire, attackerIid: giant, power: '2', toughness: '2' });
  await bob.expectState((s) => s.combat?.blocks?.length === 1, 'squire blocks the giant', 5000, { since: m });

  // Toggle the giant back off — the server drops the giant AND the block on it.
  m = alice.mark();
  alice.act({ kind: 'combat.attack', iid: giant });
  await alice.expectLog(/PT Giant no longer attacks/, 'toggling the attacker off is logged', { since: m });
  await alice.expectState(
    (s) => s.combat?.attackers?.length === 0 && s.combat?.blocks?.length === 0,
    'attacker removed AND its block pairing cleared with it',
    5000,
    { since: m },
  );
  alice.act({ kind: 'combat.end' });
  await alice.expectState((s) => s.combat == null && s.phase === 'main2', 'combat 2 ended', 5000, { since: m });

  // ---- combat 3: a "dead" creature is removed by hand (token ceases) ---------
  const frail = await mintToken(alice, { name: 'PT Frail', power: '3', toughness: '3', x: 0.25 });
  const ogre = await mintToken(bob, { name: 'PT Ogre', power: '4', toughness: '4', x: 0.75 });

  m = alice.mark();
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => s.combat != null, 'combat 3 begun', 5000, { since: m });
  alice.act({ kind: 'combat.attack', iid: frail, defenderSeat: 1, power: '3', toughness: '3' });
  m = bob.mark();
  bob.act({ kind: 'combat.block', blockerIid: ogre, attackerIid: frail, power: '4', toughness: '4' });
  await bob.expectState((s) => s.combat?.blocks?.length === 1, 'ogre (4/4) blocks the frail (3/3)', 5000, { since: m });

  // The frail (3 toughness) took 4 and "dies" — but the server won't remove it,
  // so alice sends it to the graveyard by hand; being a token, it ceases.
  m = alice.mark();
  alice.act({ kind: 'card.move', iid: frail, to: 'graveyard' });
  await alice.expectLog(/pt_alice's PT Frail token ceases to exist/, 'dead attacker removed by hand; token evaporates', { since: m });
  alice.requestResync(); // a battlefield token cease broadcasts an event, not a state
  st = await alice.expectState((s) => !alice.me(s).battlefield.some((c) => c.iid === frail), 'frail gone from the battlefield', 5000, { since: m });
  t.ok(st.players.find((p) => p.seat === 1).battlefield.some((c) => c.iid === ogre), 'ogre survives (untouched by the server)', '');
  alice.act({ kind: 'combat.end' });
  await alice.expectState((s) => s.combat == null, 'combat 3 ended', 5000, { since: m });

  // ---- combat 4: combat clears automatically on a turn change ----------------
  const knight = await mintToken(alice, { name: 'PT Knight', power: '3', toughness: '3', x: 0.15 });
  m = alice.mark();
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => s.combat != null, 'combat 4 begun', 5000, { since: m });
  alice.act({ kind: 'combat.attack', iid: knight, defenderSeat: 1, power: '3', toughness: '3' });
  await alice.expectState((s) => s.combat?.attackers?.length === 1, 'knight declared', 5000, { since: m });

  const mBobPass = bob.mark();
  alice.act({ kind: 'turn.pass' });
  await bob.expectState(
    (s) => s.combat == null && s.activeSeat === 1 && bob.me(s).life === 18,
    'turn.pass clears the overlay automatically; life untouched',
    5000,
    { since: mBobPass },
  );
  await bob.assertNever('combat.results', 'still no combat.results on the mid-combat turn change', 1200, { since: mBobPass });

  // ---- cleanup -------------------------------------------------------------
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
