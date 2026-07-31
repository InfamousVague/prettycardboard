// Scenario: engine-applied discards (rules roadmap pass D). Two humans on an
// enforced table walk every discard lane:
//   - a spell's parsed intent ("Each opponent discards two cards") creating a
//     pendingDiscards prompt the opponent answers with chosen cards,
//   - answering with [] to consent to the engine's highest-mana-value choice,
//   - "at random" spells (Hymn to Tourach) resolving instantly with the
//     picked cards named in the log,
//   - a compound self trigger (Bazaar Trademage: draw two, then discard
//     three) applied by the engine,
//   - and the freeform "in response to" narration on a manual hand ->
//     graveyard discard while a spell rides the stack.
//
// Determinism: same recipe as enforced-triggers - bottom the opening hand,
// fetch every test card out of the library before anything draws.
//
// Confirmed Scryfall oracle texts (2026-07-31):
//   Unnerve          {3}{B} sorcery  "Each opponent discards two cards."
//   Hymn to Tourach  {B}{B} sorcery  "Target player discards two cards at random."
//   Burglar Rat      {1}{B}          "When this creature enters, each opponent discards a card."
//   Bazaar Trademage {2}{U}          "Flying / When this creature enters, draw two cards, then discard three cards."
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

const CARDS = {
  unnerve: { id: '915c3d41-8de6-4289-b1dd-b8fac248df08', name: 'Unnerve' },
  hymn: { id: '3faa8c5e-9e1b-4cee-b322-a033bf33dcbc', name: 'Hymn to Tourach' },
  rat: { id: 'de1c8758-ce3d-49cf-8173-c0eb46f5e7bc', name: 'Burglar Rat' },
  trademage: { id: '9d75faf7-fc27-4fc2-9e80-e35232c42542', name: 'Bazaar Trademage' },
  swamp: { id: '4031e5e4-e573-4130-8d20-4a606edef0a0', name: 'Swamp' },
  island: { id: 'c6aa89a8-3584-4906-b9a9-41ef2f021f8e', name: 'Island' },
};

async function upsertDeck(client, payload) {
  const list = await client.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === payload.name);
  const res = existing
    ? await client.api('PUT', `/api/decks/${existing.id}`, payload)
    : await client.api('POST', '/api/decks', payload);
  return existing ? existing.id : res.json.id;
}

async function main() {
  const t = new Assert('enforced-discard');
  const alice = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  const carol = new PlaytestClient('pt_carol', { password: PASSWORD, assert: t });
  await alice.ensureUser();
  await carol.ensureUser();

  const aliceDeck = await upsertDeck(alice, {
    name: 'PT Discard Lab',
    format: 'standard',
    cards: [
      ...[CARDS.unnerve, CARDS.hymn, CARDS.rat, CARDS.trademage]
        .map((c) => ({ scryfallId: c.id, name: c.name, quantity: 1, board: 'main' })),
      { scryfallId: CARDS.swamp.id, name: 'Swamp', quantity: 28, board: 'main' },
      { scryfallId: CARDS.island.id, name: 'Island', quantity: 28, board: 'main' },
    ],
  });
  const carolDeck = await upsertDeck(carol, {
    name: 'PT Discard Fodder',
    format: 'standard',
    cards: [{ scryfallId: CARDS.swamp.id, name: 'Swamp', quantity: 60, board: 'main' }],
  });

  await alice.connect();
  await carol.connect();
  alice.send({ type: 'room.leave' });
  carol.send({ type: 'room.leave' });
  await sleep(300);

  const mk = await alice.api('POST', '/api/rooms', {
    name: 'Discard lab', seats: 2, persistent: false, format: 'standard',
  });
  const roomId = mk.json.roomId;
  alice.joinRoom(roomId, aliceDeck);
  await alice.expectState((s) => s.players.length === 1, 'alice seated', 5000);
  const st = alice.lastState().settings ?? {};
  alice.send({ type: 'room.settings', settings: { ...st, enforced: true } });
  await alice.expectState((s) => s.settings?.enforced === true, 'enforced on', 5000);
  carol.joinRoom(roomId, carolDeck);
  await alice.expectState((s) => s.players.length === 2, 'carol seated', 5000);
  alice.setReady(true);
  carol.setReady(true);
  await sleep(4000); // oracle prefetch: one Scryfall batch
  alice.send({ type: 'room.start' });
  await alice.expectState((s) => s.started, 'started', 8000);
  alice.act({ kind: 'mull.keep', bottomIids: [] });
  carol.act({ kind: 'mull.keep', bottomIids: [] });
  await alice.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    'both hands kept',
    10000,
  );

  const my = (client) => client.me(client.lastState());
  const prompts = (client) => client.lastState().pendingDiscards ?? [];

  // ---- Setup: alice bottoms her hand and fetches the four test cards, plus
  // seven untapped lands for mana. Library fetches are not land drops.
  for (const c of [...my(alice).hand]) {
    alice.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
  }
  await alice.expectState((s) => alice.me(s).handCount === 0, 'alice hand bottomed', 6000);
  alice.act({ kind: 'library.search' });
  const libMsg = await alice.waitFor((m) => m.type === 'library.cards', { timeoutMs: 5000 });
  t.ok(libMsg, 'library search returned cards', '');
  const used = new Set();
  const fetchTo = async (name, zone, x = 0.3, y = 0.6) => {
    const card = libMsg.cards.find((c) => c.name === name && !used.has(c.iid));
    used.add(card.iid);
    alice.act({ kind: 'card.move', iid: card.iid, to: zone, x, y });
    await alice.expectState(
      (s) => alice.me(s)[zone].some((c) => c.iid === card.iid),
      `${name} fetched to ${zone}`,
      5000,
    );
    return card.iid;
  };
  await fetchTo('Unnerve', 'hand');
  await fetchTo('Hymn to Tourach', 'hand');
  await fetchTo('Burglar Rat', 'hand');
  await fetchTo('Bazaar Trademage', 'hand');
  // Five Swamps: even if a naive payment taps Swamps for generic, a black
  // pip always stays reachable for the second black spell of the turn.
  for (let i = 0; i < 5; i++) await fetchTo('Swamp', 'battlefield', 0.06 + i * 0.06, 0.8);
  for (let i = 0; i < 3; i++) await fetchTo('Island', 'battlefield', 0.38 + i * 0.06, 0.8);

  const inHand = (client, name) => my(client)[ 'hand' ].find((c) => c.name === name);

  // ---- 1) Unnerve: cast, and while it rides the stack carol's MANUAL
  // discard narrates "in response to Unnerve".
  let carolHand = my(carol).handCount;
  let mark = carol.mark();
  alice.act({ kind: 'cast', iid: inHand(alice, 'Unnerve').iid, x: 0.5, y: 0.5 });
  await carol.expectState((s) => (s.stack ?? []).some((c) => c.name === 'Unnerve'), 'Unnerve on the stack', 6000, { since: mark });
  const fodder = my(carol).hand[0];
  carol.act({ kind: 'card.move', iid: fodder.iid, to: 'graveyard' });
  await carol.expectLog(
    /pt_carol discards .* in response to Unnerve/,
    'manual discard narrated in response to the stack',
    { since: mark, timeoutMs: 5000 },
  );
  carolHand -= 1;

  // ---- 2) Unnerve resolves: carol (a human) gets a pendingDiscards prompt
  // and answers it with two chosen cards, named in the log.
  mark = carol.mark();
  const aliceMark = alice.mark();
  carol.act({ kind: 'stack.pass' });
  const unnerveSt = await alice.expectState(
    (s) => (s.stackPassed ?? []).length === 1,
    'carol passed',
    5000,
    { since: aliceMark },
  );
  alice.act({ kind: 'stack.resolve', iid: unnerveSt.stack.find((c) => c.name === 'Unnerve').iid, to: 'graveyard' });
  const promptState = await carol.expectState(
    (s) => (s.pendingDiscards ?? []).some((p) => p.sourceName === 'Unnerve'),
    'Unnerve created a discard prompt for carol',
    6000,
    { since: mark },
  );
  const prompt = promptState.pendingDiscards.find((p) => p.sourceName === 'Unnerve');
  t.eq(prompt.n, 2, 'prompt owes two cards');
  t.eq(prompt.owner, carol.userId, 'prompt belongs to carol');
  await carol.expectLog(/pt_carol must discard 2 cards \(Unnerve\)/, 'owed discard logged', {
    since: mark, timeoutMs: 5000,
  });
  const picks = my(carol).hand.slice(0, 2).map((c) => c.iid);
  carol.act({ kind: 'discard.resolve', id: prompt.id, iids: picks });
  await carol.expectState(
    (s) => carol.me(s).handCount === carolHand - 2 && (s.pendingDiscards ?? []).length === 0,
    'carol discarded her two chosen cards, prompt cleared',
    6000,
    { since: mark },
  );
  await carol.expectLog(
    /pt_carol discards 2 cards \(Swamp, Swamp\) to Unnerve/,
    'chosen discards named in the log',
    { since: mark, timeoutMs: 5000 },
  );
  carolHand -= 2;

  // ---- 3) Burglar Rat's ETB trigger: alice applies, carol answers the owed
  // card with [] - consenting to the engine's choice.
  mark = carol.mark();
  alice.act({ kind: 'cast', iid: inHand(alice, 'Burglar Rat').iid, x: 0.55, y: 0.55 });
  // A creature cast in an enforced room lands on the battlefield directly.
  await alice.expectState(
    (s) => alice.me(s).battlefield.some((c) => c.name === 'Burglar Rat'),
    'Rat cast to the battlefield',
    6000,
    { since: mark },
  );
  const ratTrigger = await alice.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === 'Burglar Rat'),
    'Rat ETB trigger fired',
    6000,
  );
  const ratPrompt = ratTrigger.pendingTriggers.find((p) => p.sourceName === 'Burglar Rat');
  t.eq(ratPrompt.effects, [{ kind: 'eachOpponentDiscards', n: 1, random: false }], 'parsed as each-opponent-discards');
  alice.act({ kind: 'trigger.answer', id: ratPrompt.id, apply: true });
  const owed = await carol.expectState(
    (s) => (s.pendingDiscards ?? []).some((p) => p.sourceName === 'Burglar Rat'),
    'Rat trigger created a discard prompt for carol',
    6000,
    { since: mark },
  );
  carol.act({
    kind: 'discard.resolve',
    id: owed.pendingDiscards.find((p) => p.sourceName === 'Burglar Rat').id,
    iids: [],
  });
  await carol.expectState(
    (s) => carol.me(s).handCount === carolHand - 1 && (s.pendingDiscards ?? []).length === 0,
    'engine chose the discard for carol',
    6000,
    { since: mark },
  );
  await carol.expectLog(/pt_carol discards Swamp to Burglar Rat/, 'engine choice named', {
    since: mark, timeoutMs: 5000,
  });
  carolHand -= 1;

  // ---- 4) New turn for fresh mana, then Hymn to Tourach: "at random"
  // resolves instantly - no prompt, cards named.
  // Wait on the TURN NUMBER, cursored: activeSeat alone would match stale
  // turn-1 frames from history, and the following sorcery cast would race
  // carol's still-in-flight turn.pass.
  // turnNumber counts full ROUNDS (it bumps when the rotation wraps to the
  // lowest seat), so carol's turn is still round 1 and alice's next is 2.
  // Cursors are per-client message indexes: carol's wait needs CAROL's mark.
  const turnMark = alice.mark();
  const carolTurnMark = carol.mark();
  alice.act({ kind: 'turn.pass' });
  await carol.expectState(
    (s) => s.activeSeat === carol.me(s).seat,
    "carol's turn",
    6000,
    { since: carolTurnMark },
  );
  carol.act({ kind: 'turn.pass' });
  await alice.expectState(
    (s) => s.turnNumber === 2 && s.activeSeat === alice.me(s).seat,
    'back to alice',
    6000,
    { since: turnMark },
  );
  carolHand += 1; // carol's own turn auto-drew her a card
  mark = carol.mark();
  alice.act({ kind: 'cast', iid: inHand(alice, 'Hymn to Tourach').iid, x: 0.5, y: 0.5 });
  const hymnMark = alice.mark();
  const hymnSt = await carol.expectState(
    (s) => (s.stack ?? []).some((c) => c.name.includes('Hymn')),
    'Hymn on the stack',
    6000,
    { since: mark },
  );
  carol.act({ kind: 'stack.pass' });
  await alice.expectState((s) => (s.stackPassed ?? []).length === 1, 'carol passed the Hymn', 5000, { since: hymnMark });
  alice.act({ kind: 'stack.resolve', iid: hymnSt.stack.find((c) => c.name.includes('Hymn')).iid, to: 'graveyard' });
  await carol.expectState(
    (s) => carol.me(s).handCount === carolHand - 2,
    'random discard resolved instantly',
    6000,
    { since: mark },
  );
  t.eq(prompts(carol).length, 0, 'no prompt for an at-random discard');
  await carol.expectLog(
    /pt_carol discards 2 cards \(Swamp, Swamp\) at random to Hymn to Tourach/,
    'random discards named in the log',
    { since: mark, timeoutMs: 5000 },
  );
  carolHand -= 2;

  // ---- 5) Bazaar Trademage: a compound self trigger (draw 2, then discard
  // 3) the engine applies whole - the caster's own hand pays.
  mark = alice.mark();
  const aliceHand = my(alice).handCount;
  alice.act({ kind: 'cast', iid: inHand(alice, 'Bazaar Trademage').iid, x: 0.65, y: 0.55 });
  await alice.expectState(
    (s) => alice.me(s).battlefield.some((c) => c.name === 'Bazaar Trademage'),
    'Trademage cast to the battlefield',
    6000,
    { since: mark },
  );
  const tmTrigger = await alice.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === 'Bazaar Trademage'),
    'Trademage ETB trigger fired',
    6000,
  );
  const tmPrompt = tmTrigger.pendingTriggers.find((p) => p.sourceName === 'Bazaar Trademage');
  t.eq(
    tmPrompt.effects,
    [{ kind: 'draw', n: 2 }, { kind: 'discard', n: 3, random: false }],
    'compound draw-then-discard parsed',
  );
  alice.act({ kind: 'trigger.answer', id: tmPrompt.id, apply: true });
  await alice.expectState(
    // cast (-1), draw 2, discard 3: net -2 from the pre-cast count.
    (s) => alice.me(s).handCount === aliceHand - 2,
    'drew 2 then discarded 3 (engine choice)',
    6000,
    { since: mark },
  );
  await alice.expectLog(/pt_alice draws 2 cards \(Bazaar Trademage\)/, 'draw narrated', {
    since: mark, timeoutMs: 5000,
  });
  await alice.expectLog(/pt_alice discards 3 cards \(.+\) to Bazaar Trademage/, 'self discard narrated', {
    since: mark, timeoutMs: 5000,
  });

  alice.send({ type: 'room.leave' });
  carol.send({ type: 'room.leave' });
  await deleteRoom(alice, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('enforced-discard crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'enforced-discard', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
