// Scenario: sealed deck — does everyone get their whole allocation at once?
//
// Sealed is the booster draft with the passing taken out, and it reuses the
// same server structure (rooms::Draft, `mode: "sealed"`). That reuse is exactly
// what needs proving: the risk is not that sealed is wrong on its own, it is
// that sealed accidentally runs a piece of the DRAFT machinery — deals one pack
// per round, opens a picking phase, or starts a pick clock nobody can answer.
//
// Packs are synthesized here rather than collated, so every physical pack is
// individually identifiable ("P4-c1") and a pool can be traced back to the
// exact packs it should have been built from.
//
// Proves:
//  - a sealed table opens directly in `building`; there is no picking phase
//  - every seat's pool is `rounds` WHOLE packs, and no pack is dealt twice
//  - nothing is left in hand: `pack` is empty and `packCount` is 0
//  - the pick clock is forced off, because there are no picks to time
//  - `draft.pick` is refused outright (not_picking)
//  - your pool is private; other seats expose a count only
//  - the game cannot be started until every seat has built
//  - building requires a saved deck; the last build flips the pool to done
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

const SEATS = 2;
const ROUNDS = 3;
const PACK_SIZE = 4;

/** Pack `p` as DraftCards; every card is traceable to its pack and slot. */
function makePack(p) {
  return Array.from({ length: PACK_SIZE }, (_, c) => ({
    id: `sealed-${p}-${c}`,
    name: `P${p}-c${c}`,
    rarity: c === 0 ? 'rare' : 'common',
    foil: false,
    colors: ['W', 'U', 'B'][c % 3],
    typeLine: 'Creature — Test',
    cn: String(c + 1),
  }));
}

/** The distinct pack tags ("P4") a pool was built out of, sorted. */
function packTags(pool) {
  return [...new Set(pool.map((card) => card.name.split('-')[0]))].sort();
}

async function main() {
  const t = new Assert('sealed');
  const names = ['pt_alice', 'pt_bob'];
  await ensureSeed(names);
  const clients = names.map((n) => new PlaytestClient(n, { password: PASSWORD, assert: t }));
  const [alice, bob] = clients;
  for (const c of clients) {
    await c.ensureUser();
    await c.connect();
  }

  const roomRes = await alice.api('POST', '/api/rooms', {
    name: 'pt sealed',
    seats: SEATS,
    persistent: false,
    format: 'draft',
  });
  t.ok(roomRes.status === 201, 'room created (draft format, 2 seats)', `status ${roomRes.status} ${JSON.stringify(roomRes.json)}`);
  if (roomRes.status !== 201) return t.finish();
  const roomId = roomRes.json.roomId;

  /** Poll every client's own latest state until they ALL agree — reading one
   *  client's state after another client's await is a race. */
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

  // Seat everyone with NO deck: a limited table is the one you arrive at empty.
  for (const c of clients) {
    const m = c.mark();
    c.joinRoom(roomId);
    await c.expectState((s) => s.players.some((p) => p.userId === c.userId), `${c.username} seated`, 5000, { since: m });
  }
  await alice.expectState((s) => s.players.length === SEATS, 'both seated', 5000);

  // --- open the pools ------------------------------------------------------
  const packs = Array.from({ length: ROUNDS * SEATS }, (_, p) => makePack(p));
  const m0 = alice.mark();
  alice.send({
    type: 'draft.start',
    set: 'tst',
    setName: 'Playtest',
    mode: 'sealed',
    rounds: ROUNDS,
    // Deliberately non-zero: the server must force it off for sealed rather
    // than leave a pick clock ticking on a phase that has no picks.
    pickSeconds: 60,
    buildSeconds: 0,
    lockDecks: false,
    basics: [],
    packs,
  });
  const st0 = await alice.expectState((s) => s.draft && s.draft.phase === 'building', 'sealed opens straight into building', 5000, { since: m0 });
  if (!st0) return t.finish();
  await settle((s) => s.draft.phase === 'building', 'every client sees the pool');
  t.eq(st0.draft.mode, 'sealed', 'mode is sealed');
  t.eq(st0.draft.rounds, ROUNDS, `${ROUNDS} packs each`);
  t.eq(st0.draft.pickSeconds, 0, 'pick clock forced off — nothing to time');
  t.eq(st0.draft.seats.length, SEATS, 'both seats have a pool');

  // Never a picking phase at all: it is not that we passed through one quickly,
  // it is that the very first state the table ever saw was `building`.
  t.ok(
    !alice.messages.some((msg) => msg.type === 'room.state' && msg.state?.draft?.phase === 'picking'),
    'no picking phase was ever broadcast',
    'a picking state reached the table',
  );

  // --- the deal ------------------------------------------------------------
  const dealt = new Map();
  for (const c of clients) {
    const s = mine(c);
    t.eq(s.pool.length, ROUNDS * PACK_SIZE, `${c.username} opened ${ROUNDS * PACK_SIZE} cards`);
    t.eq(s.pack.length, 0, `${c.username} holds nothing — sealed passes nothing`);
    t.eq(s.packCount, 0, `${c.username}'s packCount is 0`);
    const tags = packTags(s.pool);
    t.eq(tags.length, ROUNDS, `${c.username}'s pool is ${ROUNDS} whole packs`);
    for (const tag of tags) {
      const whole = s.pool.filter((card) => card.name.startsWith(`${tag}-`));
      t.eq(whole.length, PACK_SIZE, `${c.username} got all of ${tag}, not a slice of it`);
    }
    dealt.set(c.userId, tags);
  }
  {
    const all = clients.flatMap((c) => dealt.get(c.userId));
    t.eq(new Set(all).size, all.length, 'no pack was dealt to two seats');
    t.eq(all.length, ROUNDS * SEATS, 'every pack uploaded ended up in exactly one pool');
    const cards = clients.flatMap((c) => mine(c).pool.map((k) => k.name));
    t.eq(new Set(cards).size, cards.length, 'no card appears in two pools');
  }

  // --- privacy -------------------------------------------------------------
  {
    const s = alice.lastState().draft.seats.find((x) => x.userId === bob.userId);
    t.ok(s.pool === undefined, "bob's pool is not in alice's state", JSON.stringify(s.pool));
    t.eq(s.poolCount, ROUNDS * PACK_SIZE, "alice sees bob's pool COUNT");
  }

  // --- there is nothing to pick -------------------------------------------
  {
    const since = alice.mark();
    alice.send({ type: 'draft.pick', index: 0, id: mine(alice).pool[0].id });
    await sleep(400);
    t.ok(alice.errorsSince(since).some((e) => e.code === 'not_picking'), 'draft.pick is refused in sealed', JSON.stringify(alice.errorsSince(since)));
  }

  // --- the game waits for the decks ---------------------------------------
  {
    const since = alice.mark();
    alice.send({ type: 'room.start' });
    await sleep(400);
    t.ok(alice.errorsSince(since).some((e) => e.code === 'draft_running'), 'the game cannot start mid-build', JSON.stringify(alice.errorsSince(since)));
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
    const res = await c.api('POST', '/api/decks', { name: `${c.username} sealed`, format: 'draft', cards, game: 'mtg' });
    t.ok(res.status === 201, `${c.username} saved a deck from the pool`, `status ${res.status}`);
    c.send({ type: 'room.deck.set', deckId: res.json.id });
    await c.expectState((s) => c.me(s).deckId === res.json.id, `${c.username}'s sealed deck is seated`, 5000);
    c.send({ type: 'draft.built' });
  }
  const done = await alice.expectState((s) => s.draft && s.draft.phase === 'done', 'every deck built -> sealed done', 5000);
  t.ok(done && done.draft.seats.every((s) => s.built), 'every seat reports built');

  await deleteRoom(alice, roomId);
  for (const c of clients) await c.close();
  return t.finish();
}

main().then((r) => process.exit(r.failed > 0 ? 1 : 0));
