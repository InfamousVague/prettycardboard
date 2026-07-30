// Scenario: booster draft — does the pack actually go round the table?
//
// Three seats, because two cannot prove direction: in a duel "pass left" and
// "pass right" produce the same rotation. Three makes the alternation visible.
//
// Packs are synthesized here rather than collated, so every physical pack is
// individually identifiable ("P4-c1"). That is what makes rotation provable: we
// can name the pack each seat holds at every step and say exactly which seat it
// should have come from.
//
// Proves:
//  - each seat opens a DIFFERENT pack, dealt in table seat order
//  - after a pass, seat s holds the pack seat s-1 held (round 1: pass left)
//  - round 2 reverses: seat s holds the pack seat s+1 held
//  - a taken card leaves the pack for everyone and lands in one pool only
//  - your pack and pool are private; other seats expose counts only
//  - a stale pick (index/id disagreement) and a double pick are both refused
//  - the game cannot be started mid-draft
//  - building requires a saved deck; the last build flips the draft to done
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

const SEATS = 3;
const ROUNDS = 2;
const PACK_SIZE = 3;

/** Pack `p` as DraftCards; every card is traceable to its pack and slot. */
function makePack(p) {
  return Array.from({ length: PACK_SIZE }, (_, c) => ({
    id: `draft-${p}-${c}`,
    name: `P${p}-c${c}`,
    rarity: c === 0 ? 'rare' : 'common',
    foil: false,
    colors: ['W', 'U', 'B'][c % 3],
    typeLine: 'Creature — Test',
    cn: String(c + 1),
  }));
}

/** Which pack a seat is holding, by the tag its cards carry ("P4"). */
function packTag(seat) {
  if (!seat || !seat.pack || seat.pack.length === 0) return null;
  return seat.pack[0].name.split('-')[0];
}

async function main() {
  const t = new Assert('booster-draft');
  const names = ['pt_alice', 'pt_bob', 'pt_carol'];
  await ensureSeed(names);
  const clients = names.map((n) => new PlaytestClient(n, { password: PASSWORD, assert: t }));
  const [alice, bob] = clients;
  for (const c of clients) {
    await c.ensureUser();
    await c.connect();
  }

  const roomRes = await alice.api('POST', '/api/rooms', {
    name: 'pt booster draft',
    seats: SEATS,
    persistent: false,
    format: 'draft',
  });
  t.ok(roomRes.status === 201, 'room created (draft format, 3 seats)', `status ${roomRes.status} ${JSON.stringify(roomRes.json)}`);
  if (roomRes.status !== 201) return t.finish();
  const roomId = roomRes.json.roomId;

  /** Poll every client's own latest state until they ALL agree. A broadcast
   *  reaches three sockets at three slightly different moments, and reading one
   *  client's state after another client's await is a race that shows up as a
   *  phantom rotation bug. */
  const settle = async (pred, label, timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (clients.every((c) => { const s = c.lastState(); return s && s.draft && pred(s); })) return true;
      if (Date.now() > deadline) {
        t.ok(false, `settle: ${label}`, 'clients never agreed');
        return false;
      }
      await sleep(40);
    }
  };
  /** My seat, from my own state. */
  const mine = (c) => c.lastState().draft.seats.find((x) => x.userId === c.userId);

  // Seat everyone with NO deck: a draft table is the one you arrive at empty.
  for (const c of clients) {
    const m = c.mark();
    c.joinRoom(roomId);
    await c.expectState((s) => s.players.some((p) => p.userId === c.userId), `${c.username} seated`, 5000, { since: m });
  }
  await alice.expectState((s) => s.players.length === SEATS, 'all three seated', 5000);

  // Seat order is what "pass left" means, so pin it down before anything moves.
  const seatOf = new Map(alice.lastState().players.map((p) => [p.userId, p.seat]));
  const bySeat = [...seatOf.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  const clientOf = (userId) => clients.find((c) => c.userId === userId);

  // --- start the draft -----------------------------------------------------
  const packs = Array.from({ length: ROUNDS * SEATS }, (_, p) => makePack(p));
  const m0 = alice.mark();
  alice.send({
    type: 'draft.start',
    set: 'tst',
    setName: 'Playtest',
    rounds: ROUNDS,
    pickSeconds: 0,
    buildSeconds: 0,
    lockDecks: false,
    basics: [],
    packs,
  });
  const st0 = await alice.expectState((s) => s.draft && s.draft.phase === 'picking', 'draft started, phase = picking', 5000, { since: m0 });
  if (!st0) return t.finish();
  await settle((s) => s.draft.phase === 'picking', 'every client sees the draft');
  t.eq(st0.draft.round, 1, 'round 1');
  t.eq(st0.draft.pick, 1, 'pick 1');
  t.eq(st0.draft.seats.length, SEATS, 'three drafters');

  // The deal follows table seat order, and every seat gets its OWN pack.
  const opened = new Map();
  for (const c of clients) {
    const s = mine(c);
    opened.set(c.userId, packTag(s));
    t.eq(s.pack.length, PACK_SIZE, `${c.username} opened a full pack`);
  }
  t.eq(bySeat.map((id) => opened.get(id)), ['P0', 'P1', 'P2'], 'packs dealt in table seat order');

  // --- privacy -------------------------------------------------------------
  {
    const s = alice.lastState().draft.seats.find((x) => x.userId === bob.userId);
    t.ok(s.pack === undefined, "bob's pack is not in alice's state", JSON.stringify(s.pack));
    t.ok(s.pool === undefined, "bob's pool is not in alice's state", JSON.stringify(s.pool));
    t.eq(s.packCount, PACK_SIZE, "alice sees bob's pack COUNT");
  }

  // --- a stale pick is refused --------------------------------------------
  {
    const since = alice.mark();
    alice.send({ type: 'draft.pick', index: 0, id: 'draft-99-9' });
    await alice.assertNever('room.state', 'stale pick does not move the draft', 700, { since });
    t.ok(alice.errorsSince(since).some((e) => e.code === 'bad_pick'), 'index/id disagreement rejected as bad_pick', '');
  }

  // --- pick 1: everyone takes the rare, then the packs rotate --------------
  const taken = new Map();
  for (const c of clients) {
    const card = mine(c).pack[0];
    taken.set(c.userId, card.name);
    c.send({ type: 'draft.pick', index: 0, id: card.id });
  }
  await settle((s) => s.draft.pick === 2, 'pass 1 completes -> pick 2');

  // Round 1 shift is +1: your pack goes to the seat on your left, so the pack
  // you now hold is the one the seat on your RIGHT was holding.
  for (let seat = 0; seat < SEATS; seat += 1) {
    const c = clientOf(bySeat[seat]);
    const s = mine(c);
    const from = (seat - 1 + SEATS) % SEATS;
    t.eq(packTag(s), opened.get(bySeat[from]), `round 1: seat ${seat} received seat ${from}'s pack`);
    t.eq(s.pack.length, PACK_SIZE - 1, `round 1: seat ${seat}'s pack is one card lighter`);
    t.eq(s.pool.length, 1, `round 1: seat ${seat} has one card in the pool`);
    t.eq(s.pool[0].name, taken.get(c.userId), `round 1: seat ${seat} kept the card it took`);
    t.ok(!s.picked, `round 1: seat ${seat} may pick again after the rotation`);
  }
  // Nobody's pick is still sitting in a pack anywhere on the table.
  {
    const wanted = new Set(taken.values());
    const loose = clients.flatMap((c) => mine(c).pack.map((k) => k.name)).filter((n) => wanted.has(n));
    t.eq(loose, [], 'every taken card left the packs for good');
  }

  // --- picking twice in one pass is refused -------------------------------
  {
    const m1 = alice.mark();
    alice.send({ type: 'draft.pick', index: 0, id: mine(alice).pack[0].id });
    await alice.expectState(
      (s) => s.draft && s.draft.seats.find((x) => x.userId === alice.userId).picked,
      'alice picks',
      5000,
      { since: m1 },
    );
    const since = alice.mark();
    alice.send({ type: 'draft.pick', index: 0, id: mine(alice).pack[0].id });
    await alice.assertNever('room.state', 'second pick in the same pass changes nothing', 700, { since });
    t.ok(alice.errorsSince(since).some((e) => e.code === 'bad_pick'), 'double pick rejected', '');
  }

  // --- the game cannot start mid-draft ------------------------------------
  {
    const since = alice.mark();
    alice.send({ type: 'room.start' });
    await sleep(600);
    t.ok(alice.errorsSince(since).some((e) => e.code === 'draft_running'), 'room.start refused while drafting', '');
    t.ok(!alice.lastState().started, 'the table did not start');
  }

  /** One pass: everyone still holding cards takes the first one. */
  const drainPass = async () => {
    const before = alice.lastState().draft;
    const key = `${before.round}:${before.pick}:${before.phase}`;
    let sent = 0;
    for (const c of clients) {
      const s = mine(c);
      if (s.picked || s.pack.length === 0) continue;
      c.send({ type: 'draft.pick', index: 0, id: s.pack[0].id });
      sent += 1;
    }
    if (sent === 0) return false;
    return settle((s) => `${s.draft.round}:${s.draft.pick}:${s.draft.phase}` !== key, `pass after ${key}`);
  };

  // --- finish round 1, then watch round 2 reverse --------------------------
  for (let guard = 0; guard < 6 && alice.lastState().draft.round === 1; guard += 1) {
    if (!(await drainPass())) break;
  }
  await settle((s) => s.draft.round === 2, 'round 1 exhausted -> round 2');
  t.eq(alice.lastState().draft.pick, 1, 'round 2 opens on pick 1');

  const opened2 = new Map();
  for (const c of clients) {
    const s = mine(c);
    opened2.set(c.userId, packTag(s));
    t.eq(s.pack.length, PACK_SIZE, `${c.username} opened a full second pack`);
    t.eq(s.pool.length, PACK_SIZE, `${c.username} finished round 1 with ${PACK_SIZE} cards`);
  }
  t.eq(bySeat.map((id) => opened2.get(id)), ['P3', 'P4', 'P5'], 'round 2 packs dealt in seat order');

  // Round 2 shift is n-1: the other way round the table.
  for (const c of clients) c.send({ type: 'draft.pick', index: 0, id: mine(c).pack[0].id });
  await settle((s) => s.draft.round === 2 && s.draft.pick === 2, 'round 2 pass completes');
  for (let seat = 0; seat < SEATS; seat += 1) {
    const c = clientOf(bySeat[seat]);
    const from = (seat + 1) % SEATS;
    t.eq(packTag(mine(c)), opened2.get(bySeat[from]), `round 2: seat ${seat} received seat ${from}'s pack (direction reversed)`);
  }

  // --- drain to the building phase ----------------------------------------
  for (let guard = 0; guard < 12 && alice.lastState().draft.phase === 'picking'; guard += 1) {
    if (!(await drainPass())) break;
  }
  await settle((s) => s.draft.phase === 'building', 'all packs exhausted -> building');
  for (const c of clients) {
    const s = mine(c);
    t.eq(s.pool.length, ROUNDS * PACK_SIZE, `${c.username} drafted ${ROUNDS * PACK_SIZE} cards`);
    t.eq(new Set(s.pool.map((k) => k.name)).size, s.pool.length, `${c.username}'s pool has no card twice`);
  }
  {
    const all = clients.flatMap((c) => mine(c).pool.map((k) => k.name));
    t.eq(new Set(all).size, all.length, 'no card was drafted by two seats');
    t.eq(all.length, ROUNDS * SEATS * PACK_SIZE, 'every card in every pack ended up in exactly one pool');
  }

  // --- building ------------------------------------------------------------
  {
    const since = alice.mark();
    alice.send({ type: 'draft.built' });
    await sleep(500);
    t.ok(alice.errorsSince(since).some((e) => e.code === 'deck_required'), 'cannot finish building without a saved deck', '');
  }
  for (const c of clients) {
    const cards = mine(c).pool.map((k) => ({ scryfallId: k.id, name: k.name, quantity: 1, board: 'main' }));
    const res = await c.api('POST', '/api/decks', { name: `${c.username} draft`, format: 'draft', cards, game: 'mtg' });
    t.ok(res.status === 201, `${c.username} saved a deck from the pool`, `status ${res.status}`);
    c.send({ type: 'room.deck.set', deckId: res.json.id });
    await c.expectState((s) => c.me(s).deckId === res.json.id, `${c.username}'s drafted deck is seated`, 5000);
    c.send({ type: 'draft.built' });
  }
  const done = await alice.expectState((s) => s.draft && s.draft.phase === 'done', 'every deck built -> draft done', 5000);
  t.ok(done && done.draft.seats.every((s) => s.built), 'every seat reports built');

  await deleteRoom(alice, roomId);
  for (const c of clients) await c.close();
  return t.finish();
}

main().then((r) => process.exit(r.failed > 0 ? 1 : 0));
