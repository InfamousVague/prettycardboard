// Scenario: scry, mill, spell intent, and planeswalker loyalty (rules pass
// D). A solo seat goldfishes:
//   - Preordain / Opt: a resolving spell's parsed intent draws for the caster
//     and opens the scry as a private peek (the deliberate order is draw
//     first, then scry the new top - see PROTOCOL.md),
//   - Undead Butler: an ETB mill trigger naming every milled card,
//   - Chandra, Torch of Defiance: a planeswalker arriving on the battlefield
//     gets her printed loyalty in counters automatically.
//
// Confirmed Scryfall oracle texts (2026-07-31):
//   Preordain     {U}     sorcery "Scry 2, then draw a card."
//   Opt           {U}     instant "Scry 1. / Draw a card."
//   Undead Butler {1}{B}          "When this creature enters, mill three cards." (+ manual dies)
//   Chandra, Torch of Defiance {2}{R}{R} planeswalker, loyalty 4
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

const CARDS = {
  preordain: { id: 'dd29a0e5-c1de-4e8a-8866-715e9f9cde1f', name: 'Preordain' },
  opt: { id: 'bbc99a51-1501-4525-a3cc-f48249b64bed', name: 'Opt' },
  alarm: { id: '6c7c8527-55f6-494d-b4f7-c427a5735053', name: 'Raise the Alarm' },
  revitalize: { id: '3a9fb75e-c8e5-417b-83d4-5105af9c66c1', name: 'Revitalize' },
  plains: { id: '7b7c408b-8660-4db5-9a16-5003c11b4ac1', name: 'Plains' },
  butler: { id: '2c9b8582-8887-4652-82e2-f9b11ee21545', name: 'Undead Butler' },
  chandra: { id: '40cb22c8-cb03-45c9-bb0e-b8cabdcc43cd', name: 'Chandra, Torch of Defiance' },
  island: { id: 'c6aa89a8-3584-4906-b9a9-41ef2f021f8e', name: 'Island' },
  swamp: { id: '4031e5e4-e573-4130-8d20-4a606edef0a0', name: 'Swamp' },
  mountain: { id: 'c49d378e-9549-4320-b3c6-1aeb216d1e98', name: 'Mountain' },
};

async function main() {
  const t = new Assert('enforced-scry-mill');
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await me.ensureUser();

  const payload = {
    name: 'PT Scry Mill Lab',
    format: 'standard',
    cards: [
      ...[CARDS.preordain, CARDS.opt, CARDS.butler, CARDS.chandra, CARDS.alarm, CARDS.revitalize]
        .map((c) => ({ scryfallId: c.id, name: c.name, quantity: 1, board: 'main' })),
      { scryfallId: CARDS.island.id, name: 'Island', quantity: 15, board: 'main' },
      { scryfallId: CARDS.swamp.id, name: 'Swamp', quantity: 15, board: 'main' },
      { scryfallId: CARDS.mountain.id, name: 'Mountain', quantity: 14, board: 'main' },
      { scryfallId: CARDS.plains.id, name: 'Plains', quantity: 10, board: 'main' },
    ],
  };
  const list = await me.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === payload.name);
  const deckRes = existing
    ? await me.api('PUT', `/api/decks/${existing.id}`, payload)
    : await me.api('POST', '/api/decks', payload);
  const deckId = existing ? existing.id : deckRes.json.id;
  t.ok([200, 201].includes(deckRes.status), 'scry-mill deck uploaded', `status ${deckRes.status}`);

  await me.connect();
  me.send({ type: 'room.leave' });
  await sleep(300);
  const mk = await me.api('POST', '/api/rooms', {
    name: 'Scry mill lab', seats: 2, persistent: false, format: 'standard',
  });
  const roomId = mk.json.roomId;
  me.joinRoom(roomId, deckId);
  await me.expectState((s) => s.players.length === 1, 'seated', 5000);
  const st = me.lastState().settings ?? {};
  me.send({ type: 'room.settings', settings: { ...st, enforced: true } });
  await me.expectState((s) => s.settings?.enforced === true, 'enforced on', 5000);
  me.setReady(true);
  await sleep(4000); // oracle prefetch
  me.send({ type: 'room.start' });
  await me.expectState((s) => s.started, 'started', 5000);
  me.act({ kind: 'mull.keep', bottomIids: [] });
  await me.expectState((s) => s.players[0].mulligan?.state === 'kept', 'hand kept', 10000);

  const myself = () => me.lastState().players[0];

  // ---- Setup: bottom the hand, fetch spells + mana.
  for (const c of [...myself().hand]) {
    me.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
  }
  await me.expectState((s) => s.players[0].handCount === 0, 'opening hand bottomed', 6000);
  me.act({ kind: 'library.search' });
  const libMsg = await me.waitFor((m) => m.type === 'library.cards', { timeoutMs: 5000 });
  t.ok(libMsg, 'library search returned cards', '');
  const used = new Set();
  const fetchTo = async (name, zone, x = 0.3, y = 0.6) => {
    const card = libMsg.cards.find((c) => c.name === name && !used.has(c.iid));
    used.add(card.iid);
    me.act({ kind: 'card.move', iid: card.iid, to: zone, x, y });
    await me.expectState(
      (s) => s.players[0][zone].some((c) => c.iid === card.iid),
      `${name} fetched to ${zone}`,
      5000,
    );
    return card.iid;
  };
  await fetchTo('Preordain', 'hand');
  await fetchTo('Raise the Alarm', 'hand');
  await fetchTo('Revitalize', 'hand');
  await fetchTo('Opt', 'hand');
  await fetchTo('Undead Butler', 'hand');
  await fetchTo('Chandra, Torch of Defiance', 'hand');
  for (let i = 0; i < 2; i++) await fetchTo('Island', 'battlefield', 0.06 + i * 0.06, 0.8);
  for (let i = 0; i < 4; i++) await fetchTo('Plains', 'battlefield', 0.48 + i * 0.05, 0.8);
  for (let i = 0; i < 2; i++) await fetchTo('Swamp', 'battlefield', 0.2 + i * 0.06, 0.8);
  for (let i = 0; i < 4; i++) await fetchTo('Mountain', 'battlefield', 0.34 + i * 0.06, 0.8);

  const inHand = (name) => myself().hand.find((c) => c.name === name);
  // Cast from hand, await THIS spell on the stack (since guards against
  // matching an older cast in message history), then resolve it. Solo seat:
  // everyone else has vacuously passed, so the top may resolve at once.
  const castAndResolve = async (name, to, x, y) => {
    const since = me.mark();
    me.act({ kind: 'cast', iid: inHand(name).iid, x: 0.5, y: 0.5 });
    const st = await me.expectState(
      (s) => (s.stack ?? []).some((c) => c.name === name),
      `${name} on the stack`,
      6000,
      { since },
    );
    me.act({ kind: 'stack.resolve', iid: st.stack.find((c) => c.name === name).iid, to, x, y });
  };

  // ---- 1) Preordain: intent applies on resolution - draw 1, then a
  // 2-card scry peek delivered as the private library.cards message (the
  // same one the peek verb sends, so the client's viewer opens).
  let hand = myself().handCount;
  let mark = me.mark();
  await castAndResolve('Preordain', 'graveyard');
  const peek2 = await me.waitFor(
    (m) => m.type === 'library.cards' && m.cards.length === 2,
    { since: mark, timeoutMs: 6000 },
  );
  t.ok(peek2, 'scry 2 delivered the top two cards privately', '');
  await me.expectState(
    // cast (-1) then the intent draw (+1): net unchanged.
    (s) => s.players[0].handCount === hand,
    'drew a card off Preordain',
    6000,
    { since: mark },
  );
  await me.expectLog(/pt_alice draws a card \(Preordain\)/, 'intent draw narrated', {
    since: mark, timeoutMs: 5000,
  });
  await me.expectLog(/pt_alice scries 2 \(Preordain\)/, 'scry narrated', {
    since: mark, timeoutMs: 5000,
  });

  // ---- 2) Finish the scry with the existing library verbs: bottom one of
  // the peeked cards.
  mark = me.mark();
  me.act({ kind: 'library.bottom', iids: [peek2.cards[0].iid] });
  await me.expectLog(/pt_alice puts 1 card on the bottom of their library/, 'scry bottom worked', {
    since: mark, timeoutMs: 5000,
  });

  // ---- 3) Opt (instant, "Scry 1. / Draw a card.") through the same lane.
  hand = myself().handCount;
  mark = me.mark();
  await castAndResolve('Opt', 'graveyard');
  const peek1 = await me.waitFor(
    (m) => m.type === 'library.cards' && m.cards.length === 1,
    { since: mark, timeoutMs: 6000 },
  );
  t.ok(peek1, 'scry 1 delivered the top card privately', '');
  await me.expectState(
    (s) => s.players[0].handCount === hand,
    'Opt drew its card',
    6000,
    { since: mark },
  );

  // ---- 3b) Raise the Alarm: a token SPELL builds its tokens on resolution.
  mark = me.mark();
  await castAndResolve('Raise the Alarm', 'graveyard');
  await me.expectState(
    (s) => s.players[0].battlefield.filter(
      (c) => c.isToken && c.name === 'Soldier' && c.power === '1',
    ).length === 2,
    'two 1/1 Soldier tokens created by the spell',
    6000,
    { since: mark },
  );
  await me.expectLog(/pt_alice creates 2 1\/1 Soldier tokens \(Raise the Alarm\)/, 'token spell narrated', {
    since: mark, timeoutMs: 5000,
  });

  // ---- 3c) Revitalize: lifegain + draw, both from parsed clauses.
  const lifeBefore = myself().life;
  hand = myself().handCount;
  mark = me.mark();
  await castAndResolve('Revitalize', 'graveyard');
  await me.expectState(
    (s) => s.players[0].life === lifeBefore + 3 && s.players[0].handCount === hand,
    'Revitalize gained 3 and drew (net hand unchanged)',
    6000,
    { since: mark },
  );

  // ---- 4) Undead Butler: ETB mill trigger names all three cards.
  const gy = myself().graveyard.length;
  mark = me.mark();
  // Permanents cast in an enforced room land on the battlefield directly.
  me.act({ kind: 'cast', iid: inHand('Undead Butler').iid, x: 0.6, y: 0.55 });
  await me.expectState(
    (s) => s.players[0].battlefield.some((c) => c.name === 'Undead Butler'),
    'Butler cast to the battlefield',
    6000,
    { since: mark },
  );
  const trig = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === 'Undead Butler' && p.when === 'etb'),
    'Butler ETB trigger fired',
    6000,
  );
  const prompt = trig.pendingTriggers.find((p) => p.sourceName === 'Undead Butler' && p.when === 'etb');
  t.eq(prompt.effects, [{ kind: 'mill', n: 3 }], 'parsed as mill 3');
  me.act({ kind: 'trigger.answer', id: prompt.id, apply: true });
  await me.expectState(
    // Butler resolving to the battlefield left the graveyard alone; the
    // mill adds exactly three.
    (s) => s.players[0].graveyard.length === gy + 3,
    'milled three cards',
    6000,
    { since: mark },
  );
  await me.expectLog(/pt_alice mills 3 cards \(.+, .+, .+\) \(Undead Butler\)/, 'milled cards named', {
    since: mark, timeoutMs: 5000,
  });

  // ---- 5) Chandra: a planeswalker arrival banks her printed loyalty.
  mark = me.mark();
  me.act({ kind: 'cast', iid: inHand('Chandra, Torch of Defiance').iid, x: 0.7, y: 0.55 });
  await me.expectState(
    (s) => s.players[0].battlefield.some(
      (c) => c.name === 'Chandra, Torch of Defiance' && (c.counters?.loyalty ?? 0) === 4,
    ),
    'Chandra entered with 4 loyalty counters',
    6000,
    { since: mark },
  );
  await me.expectLog(/Chandra, Torch of Defiance enters with 4 loyalty/, 'loyalty narrated', {
    since: mark, timeoutMs: 5000,
  });

  me.send({ type: 'room.leave' });
  await deleteRoom(me, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('enforced-scry-mill crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'enforced-scry-mill', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
