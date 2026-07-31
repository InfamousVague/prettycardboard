// Scenario: table markers and pointing arrows — the shared "look at THIS"
// layer. Three seats plus a spectator prove the split between the two:
//
//   markers (`mark.set` / `mark.clear`) are REAL table state — they live in
//   room.state, reach every player and spectator, carry who placed them,
//   survive a disconnect, toggle off, and follow their card off the board;
//
//   arrows (the `aim` relay) are ephemeral — broadcast to everyone with the
//   pointer's seat attached, never stored, and never resurrected on rejoin.
//
// Everything here rides the real protocol, so a regression in either half
// (a marker that silently stays client-side, an arrow that forgets who sent
// it) fails the run rather than quietly degrading the table talk.
import { PlaytestClient, Assert, connectAll, readyAll, deleteRoom, sleep } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

async function main() {
  const t = new Assert('marks-arrows');
  const seeded = await ensureSeed(['pt_alice', 'pt_bob', 'pt_carol', 'pt_dana']);
  const alice = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  const bob = new PlaytestClient('pt_bob', { password: PASSWORD, assert: t });
  const carol = new PlaytestClient('pt_carol', { password: PASSWORD, assert: t });
  const dana = new PlaytestClient('pt_dana', { password: PASSWORD, assert: t });
  await connectAll([alice, bob, carol, dana]);
  for (const client of [alice, bob, carol, dana]) client.send({ type: 'room.leave' });
  await sleep(300);

  const mk = await alice.api('POST', '/api/rooms', {
    name: 'Marks and arrows', seats: 4, persistent: false, format: 'commander',
  });
  const roomId = mk.json.roomId;
  alice.joinRoom(roomId, seeded.pt_alice.deckId);
  await alice.expectState((s) => s.players.length === 1, 'alice seated', 5000);
  bob.joinRoom(roomId, seeded.pt_bob.deckId);
  carol.joinRoom(roomId, seeded.pt_carol.deckId);
  await alice.expectState((s) => s.players.length === 3, 'three seats taken', 6000);
  // Dana never sits: the spectator's view of the table talk is half the point.
  dana.spectateRoom(roomId);
  await dana.expectState((s) => s.roomId === roomId, 'dana spectating', 5000);

  await readyAll([alice, bob, carol]);
  alice.send({ type: 'room.start' });
  await alice.expectState((s) => s.started, 'started', 6000);
  for (const client of [alice, bob, carol]) client.act({ kind: 'mull.keep', bottomIids: [] });
  await alice.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    'hands kept',
    15000,
  );

  const seatOf = (client) =>
    alice.lastState().players.find((p) => p.userId === client.userId).seat;
  const mine = (client, s = null) =>
    (s ?? client.lastState()).players.find((p) => p.userId === client.userId);
  const marksIn = (state) => state?.marks ?? {};

  // Each of alice and bob puts a real card on the battlefield to mark. The
  // library fetch keeps this deck-agnostic: any precon, any card.
  const plant = async (client, x) => {
    client.act({ kind: 'library.search' });
    const lib = (await client.waitFor((m) => m.type === 'library.cards', { timeoutMs: 6000 })).cards;
    const card = lib[0];
    client.act({ kind: 'card.move', iid: card.iid, to: 'battlefield', x, y: 0.5 });
    await client.expectState(
      (s) => mine(client, s).battlefield.some((c) => c.iid === card.iid),
      `${client.username} planted a card`,
      6000,
    );
    return card;
  };
  const aliceCard = await plant(alice, 0.3);
  const bobCard = await plant(bob, 0.5);

  // ---- 1) A marker is table state: everyone sees it, with attribution.
  let mark = alice.mark();
  alice.act({ kind: 'mark.set', iid: bobCard.iid, mark: 'skull' });
  const seen = await bob.expectState(
    (s) => marksIn(s)[bobCard.iid]?.kind === 'skull',
    "bob sees alice's marker on his own card",
    6000,
  );
  const placed = marksIn(seen)[bobCard.iid];
  t.eq(placed?.by, alice.userId, 'the marker records who placed it');
  t.eq(placed?.seat, seatOf(alice), 'the marker records the placing seat (its colour)');
  t.eq(placed?.username, 'pt_alice', 'the marker carries a display name');
  t.ok((placed?.ts ?? 0) > 0, 'the marker is timestamped', String(placed?.ts));
  await carol.expectState(
    (s) => marksIn(s)[bobCard.iid]?.kind === 'skull',
    'carol sees it too',
    6000,
  );
  await dana.expectState(
    (s) => marksIn(s)[bobCard.iid]?.kind === 'skull',
    'the spectator sees it too',
    6000,
  );
  await alice.expectLog(/marks/, 'placing a marker is logged', { since: mark, timeoutMs: 5000 });

  // ---- 2) Markers stack per card across players, not per player.
  bob.act({ kind: 'mark.set', iid: aliceCard.iid, mark: 'star' });
  const twoUp = await carol.expectState(
    (s) => marksIn(s)[aliceCard.iid]?.kind === 'star' && marksIn(s)[bobCard.iid]?.kind === 'skull',
    'two cards wear two different markers',
    6000,
  );
  t.eq(marksIn(twoUp)[aliceCard.iid]?.seat, seatOf(bob), "bob's marker wears bob's seat");

  // ---- 3) Re-marking the same card replaces the marker in place.
  carol.act({ kind: 'mark.set', iid: bobCard.iid, mark: 'shield' });
  const replaced = await alice.expectState(
    (s) => marksIn(s)[bobCard.iid]?.kind === 'shield',
    'a second player re-marks the same card',
    6000,
  );
  t.eq(marksIn(replaced)[bobCard.iid]?.by, carol.userId, 'the newest marker owns the card');
  t.eq(Object.keys(marksIn(replaced)).length, 2, 'still two marked cards, not three');

  // ---- 4) A marker is lifted with mark: null (the client's toggle).
  mark = carol.mark();
  carol.act({ kind: 'mark.set', iid: bobCard.iid, mark: null });
  await dana.expectState(
    (s) => marksIn(s)[bobCard.iid] == null,
    'lifting a marker reaches the spectator',
    6000,
  );
  await carol.expectLog(/clears the marker/, 'lifting a marker is logged', { since: mark, timeoutMs: 5000 });

  // ---- 5) Markers survive a disconnect: they are state, not a client's memory.
  await bob.close();
  await sleep(400);
  await bob.connect();
  bob.joinRoom(roomId, seeded.pt_bob.deckId);
  await bob.expectState(
    (s) => marksIn(s)[aliceCard.iid]?.kind === 'star',
    'a reconnecting player still sees the markers',
    8000,
  );

  // ---- 6) A late spectator inherits the marked board.
  const eve = new PlaytestClient('pt_dana', { password: PASSWORD, assert: t });
  // (pt_dana already spectates on another socket; a second connection is a
  // second viewer of the same table - exactly the late-joiner case.)
  await eve.ensureUser();
  await eve.connect();
  eve.spectateRoom(roomId);
  await eve.expectState(
    (s) => marksIn(s)[aliceCard.iid]?.kind === 'star',
    'a late viewer inherits the marked board',
    8000,
  );
  await eve.close();

  // ---- 7) A marker follows its card off the battlefield.
  mark = alice.mark();
  alice.act({ kind: 'card.move', iid: aliceCard.iid, to: 'graveyard' });
  await carol.expectState(
    (s) => marksIn(s)[aliceCard.iid] == null,
    'a card leaving the battlefield drops its marker',
    6000,
  );

  // ---- 8) Bad markers are refused, and unknown cards cannot be marked.
  const refuse = async (client, action, label) => {
    const since = client.mark();
    client.act(action);
    const err = await client.waitFor((m) => m.type === 'error', { since, timeoutMs: 4000 });
    t.ok(Boolean(err), label, JSON.stringify(err ?? null));
    return err;
  };
  await refuse(alice, { kind: 'mark.set', iid: 'no-such-card', mark: 'skull' }, 'marking a card that is not on the table is refused');
  await refuse(alice, { kind: 'mark.set', iid: bobCard.iid, mark: 'x'.repeat(40) }, 'an oversized marker kind is refused');
  await refuse(alice, { kind: 'mark.set', iid: bobCard.iid, mark: '' }, 'an empty marker kind is refused');

  // ---- 9) mark.clear sweeps the table.
  alice.act({ kind: 'mark.set', iid: bobCard.iid, mark: 'flame' });
  await alice.expectState((s) => Object.keys(marksIn(s)).length === 1, 'one marker up', 6000);
  mark = bob.mark();
  bob.act({ kind: 'mark.clear' });
  await dana.expectState(
    (s) => Object.keys(marksIn(s)).length === 0,
    'mark.clear sweeps every marker for everyone',
    6000,
  );
  await bob.expectLog(/clears 1 marker/, 'the sweep is logged with a count', { since: mark, timeoutMs: 5000 });
  await refuse(bob, { kind: 'mark.clear' }, 'clearing an already-clean table is refused');

  // ---- 10) Arrows: the aim relay reaches every viewer, with the seat.
  let since = bob.mark();
  const spectatorSince = dana.mark();
  alice.send({ type: 'aim', fromIid: bobCard.iid, toIid: bobCard.iid });
  const arrow = await bob.waitFor((m) => m.type === 'aim', { since, timeoutMs: 5000 });
  t.ok(Boolean(arrow), 'an aim reaches the other players', '');
  t.eq(arrow?.fromUserId, alice.userId, 'the arrow names its sender');
  t.eq(arrow?.fromSeat, seatOf(alice), "the arrow carries the sender's seat (its colour)");
  t.eq(arrow?.username, 'pt_alice', 'the arrow carries a display name');
  const spectatorArrow = await dana.waitFor((m) => m.type === 'aim', { since: spectatorSince, timeoutMs: 5000 });
  t.ok(Boolean(spectatorArrow), 'the spectator sees the arrow too', '');

  // ---- 11) An arrow may point at a PLAYER rather than a card.
  since = carol.mark();
  bob.send({ type: 'aim', fromIid: bobCard.iid, toSeat: seatOf(carol) });
  const atPlayer = await carol.waitFor((m) => m.type === 'aim' && m.toSeat != null, { since, timeoutMs: 5000 });
  t.eq(atPlayer?.toSeat, seatOf(carol), 'an arrow can be aimed at a seat');
  t.eq(atPlayer?.fromSeat, seatOf(bob), 'and still carries its own seat');

  // ---- 12) Arrows are ephemeral: nothing about them lands in room state.
  const settled = await carol.expectState((s) => s.roomId === roomId, 'state settles', 5000);
  t.eq(Object.keys(marksIn(settled)).length, 0, 'pointing never leaves a marker behind');
  t.eq(settled.aim, undefined, 'aims are relayed, never stored in room state');

  for (const client of [alice, bob, carol, dana]) client.send({ type: 'room.leave' });
  await deleteRoom(alice, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('marks-arrows crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'marks-arrows', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
