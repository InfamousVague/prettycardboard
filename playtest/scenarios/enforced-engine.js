// Scenario: rules pass E - the engine-depth batch, end to end on the real
// protocol. Two humans on an enforced table walk:
//   1. Mana rocks paying real costs (Sol Ring taps for Mind Stone).
//   2. State-based actions: -1/-1 counters kill a 2/2; a player at negative
//      life is flagged loudly (and unflagged on recovery).
//   3. Targeting legality: hexproof / shroud / protection rejections, and a
//      ward {1} that gets PAID (a land taps) when the aim lands.
//   4. Planeswalker loyalty activation: +N with a queued ability prompt,
//      once-per-turn and loyalty-floor rejections, and death at 0 loyalty.
//   5. Saboteur triggers: Scroll Thief connects and the engine offers the
//      draw.
//   6. The end-step response window: an instant cast INSIDE the window
//      resolves before the turn completes on the responder's pass.
//
// Confirmed Scryfall oracle texts (2026-07-31):
//   Sol Ring {1}             "{T}: Add {C}{C}."
//   Mind Stone {2}           "{T}: Add {C}. / {1},{T},Sac: Draw a card."
//   Grizzly Bears {1}{G}     vanilla 2/2
//   Slippery Bogle {G/U}     hexproof
//   Argothian Enchantress    shroud
//   White Knight {W}{W}      first strike, protection from black
//   Doom Blade {1}{B}        "Destroy target nonblack creature." (black)
//   Scroll Thief {2}{U}      "Whenever this creature deals combat damage to
//                             a player, draw a card."
//   Armored Armadillo {W}    0/4 ward {1}
//   Chandra, Torch of Defiance {2}{R}{R}  loyalty 4; +1/+1/-3/-7
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

const CARDS = {
  solring: { id: '91fdb56b-54d5-4272-8319-505ff987fe9b', name: 'Sol Ring' },
  mindstone: { id: 'ad881aa0-decc-447b-8c8a-983546a9a55a', name: 'Mind Stone' },
  bears: { id: '409f9b88-f03e-40b6-9883-68c14c37c0de', name: 'Grizzly Bears' },
  bogle: { id: 'c4e4bbea-7e3f-4de0-bb01-dfd67f21c254', name: 'Slippery Bogle' },
  enchantress: { id: 'b99ff81f-08d9-4b4a-a879-de5e5e402802', name: 'Argothian Enchantress' },
  knight: { id: '660f69ef-c04f-4f53-80e6-8190549ab12a', name: 'White Knight' },
  doomblade: { id: '5dcd0c4e-4047-47a2-8969-c62616d457c2', name: 'Doom Blade' },
  thief: { id: 'a7caae7e-9b88-4428-b9e3-86cb8c84bd65', name: 'Scroll Thief' },
  armadillo: { id: '263232df-69b8-4205-93ad-c724fe57ec11', name: 'Armored Armadillo' },
  chandra: { id: '40cb22c8-cb03-45c9-bb0e-b8cabdcc43cd', name: 'Chandra, Torch of Defiance' },
  opt: { id: 'bbc99a51-1501-4525-a3cc-f48249b64bed', name: 'Opt' },
  plains: { id: '7b7c408b-8660-4db5-9a16-5003c11b4ac1', name: 'Plains' },
  swamp: { id: '4031e5e4-e573-4130-8d20-4a606edef0a0', name: 'Swamp' },
  mountain: { id: 'c49d378e-9549-4320-b3c6-1aeb216d1e98', name: 'Mountain' },
  island: { id: 'c6aa89a8-3584-4906-b9a9-41ef2f021f8e', name: 'Island' },
};

async function upsertDeck(client, name, cards) {
  const list = await client.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === name);
  const payload = { name, format: 'standard', cards };
  const res = existing
    ? await client.api('PUT', `/api/decks/${existing.id}`, payload)
    : await client.api('POST', '/api/decks', payload);
  return existing ? existing.id : res.json.id;
}

const one = (c) => ({ scryfallId: c.id, name: c.name, quantity: 1, board: 'main' });

async function main() {
  const t = new Assert('enforced-engine');
  const alice = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  const carol = new PlaytestClient('pt_carol', { password: PASSWORD, assert: t });
  await alice.ensureUser();
  await carol.ensureUser();

  const aliceDeck = await upsertDeck(alice, 'PT Engine Lab A', [
    one(CARDS.solring), one(CARDS.mindstone), one(CARDS.bears), one(CARDS.doomblade),
    one(CARDS.thief), one(CARDS.chandra),
    { scryfallId: CARDS.plains.id, name: 'Plains', quantity: 18, board: 'main' },
    { scryfallId: CARDS.swamp.id, name: 'Swamp', quantity: 18, board: 'main' },
    { scryfallId: CARDS.mountain.id, name: 'Mountain', quantity: 18, board: 'main' },
  ]);
  const carolDeck = await upsertDeck(carol, 'PT Engine Lab C', [
    one(CARDS.bogle), one(CARDS.enchantress), one(CARDS.knight), one(CARDS.armadillo),
    one(CARDS.opt),
    { scryfallId: CARDS.island.id, name: 'Island', quantity: 55, board: 'main' },
  ]);

  await alice.connect();
  await carol.connect();
  alice.send({ type: 'room.leave' });
  carol.send({ type: 'room.leave' });
  await sleep(300);
  const mk = await alice.api('POST', '/api/rooms', {
    name: 'Engine lab', seats: 2, persistent: false, format: 'standard',
  });
  const roomId = mk.json.roomId;
  alice.joinRoom(roomId, aliceDeck);
  await alice.expectState((s) => s.players.length === 1, 'alice seated', 5000);
  alice.send({ type: 'room.settings', settings: { ...(alice.lastState().settings ?? {}), enforced: true } });
  await alice.expectState((s) => s.settings?.enforced === true, 'enforced on', 5000);
  carol.joinRoom(roomId, carolDeck);
  await alice.expectState((s) => s.players.length === 2, 'carol seated', 5000);
  alice.setReady(true);
  carol.setReady(true);
  await sleep(4000); // oracle prefetch
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
  const seatOf = (client) => my(client).seat;

  // ---- Setup: both players bottom hands and fetch their labs.
  const bottomAndFetch = async (client, wants) => {
    for (const c of [...my(client).hand]) {
      client.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
    }
    await client.expectState((s) => client.me(s).handCount === 0, 'hand bottomed', 6000);
    client.act({ kind: 'library.search' });
    const libMsg = await client.waitFor((m) => m.type === 'library.cards', { timeoutMs: 5000 });
    const used = new Set();
    const out = {};
    for (const [name, zone, x, y] of wants) {
      const card = libMsg.cards.find((c) => c.name === name && !used.has(c.iid));
      used.add(card.iid);
      client.act({ kind: 'card.move', iid: card.iid, to: zone, x, y });
      await client.expectState(
        (s) => client.me(s)[zone].some((c) => c.iid === card.iid),
        `${name} fetched to ${zone}`,
        5000,
      );
      out[`${name}#${Object.keys(out).filter((k) => k.startsWith(name)).length}`] = card.iid;
      out[name] = card.iid;
    }
    return out;
  };

  const ai = await bottomAndFetch(alice, [
    ['Sol Ring', 'hand', 0, 0],
    ['Mind Stone', 'hand', 0, 0],
    ['Doom Blade', 'hand', 0, 0],
    ['Chandra, Torch of Defiance', 'hand', 0, 0],
    ['Grizzly Bears', 'battlefield', 0.6, 0.55],
    ['Scroll Thief', 'battlefield', 0.7, 0.55],
    ['Plains', 'battlefield', 0.06, 0.8],
    ['Plains', 'battlefield', 0.12, 0.8],
    ['Swamp', 'battlefield', 0.18, 0.8],
    ['Mountain', 'battlefield', 0.24, 0.8],
    ['Mountain', 'battlefield', 0.3, 0.8],
    ['Plains', 'battlefield', 0.36, 0.8],
  ]);
  const ci = await bottomAndFetch(carol, [
    ['Opt', 'hand', 0, 0],
    ['Slippery Bogle', 'battlefield', 0.55, 0.55],
    ['Argothian Enchantress', 'battlefield', 0.63, 0.55],
    ['White Knight', 'battlefield', 0.71, 0.55],
    ['Armored Armadillo', 'battlefield', 0.79, 0.55],
    ['Island', 'battlefield', 0.06, 0.8],
    ['Island', 'battlefield', 0.12, 0.8],
  ]);

  // ---- 1) Mana rocks pay: Sol Ring resolves, then Mind Stone is cast with
  // an EXPLICIT payment naming the Ring - the solver must accept a nonland
  // source, and the Ring must come out tapped.
  let mark = alice.mark();
  alice.act({ kind: 'cast', iid: ai['Sol Ring'], x: 0.45, y: 0.55 });
  await alice.expectState(
    (s) => alice.me(s).battlefield.some((c) => c.name === 'Sol Ring'),
    'Sol Ring cast',
    6000,
    { since: mark },
  );
  const bf = () => my(alice).battlefield;
  const ringIid = bf().find((c) => c.name === 'Sol Ring').iid;
  const payLand = bf().find((c) => c.name === 'Plains' && !c.tapped).iid;
  mark = alice.mark();
  alice.act({ kind: 'cast', iid: ai['Mind Stone'], payment: [ringIid, payLand], x: 0.5, y: 0.55 });
  await alice.expectState(
    (s) => alice.me(s).battlefield.some((c) => c.name === 'Mind Stone'),
    'Mind Stone cast with the Ring named in the payment',
    6000,
    { since: mark },
  );
  t.eq(
    bf().find((c) => c.iid === ringIid)?.tapped,
    true,
    'Sol Ring tapped to pay (rocks are mana sources)',
  );
  // Fresh mana for the rest of the turn: untap everything by hand.
  for (const c of bf().filter((c) => c.tapped)) {
    alice.act({ kind: 'card.tap', iid: c.iid, tapped: false });
  }
  await alice.expectState(
    (s) => alice.me(s).battlefield.every((c) => !c.tapped),
    'board untapped for the next acts',
    6000,
  );
  // Floating mana from those taps would pre-pay later casts and muddy the
  // asserts: clear the pool.
  alice.act({ kind: 'mana.clear' });
  await sleep(400);

  // ---- 2) State-based actions: two -1/-1 counters fell the 2/2 Bears.
  mark = alice.mark();
  alice.act({ kind: 'card.counter', iid: ai['Grizzly Bears'], counter: '-1/-1', delta: 2 });
  await alice.expectState(
    (s) => alice.me(s).graveyard.some((c) => c.name === 'Grizzly Bears'),
    'zero-toughness Bears died to the sweep',
    6000,
    { since: mark },
  );
  await alice.expectLog(/Grizzly Bears dies/, 'the death is narrated', { since: mark, timeoutMs: 5000 });

  // Loss flagging: carol drops to negative life, loudly; recovery unflags.
  mark = carol.mark();
  carol.act({ kind: 'life.add', delta: -25 });
  await carol.expectLog(
    /pt_carol is at -5 life - the match awaits their concession/,
    'loss state flagged once',
    { since: mark, timeoutMs: 5000 },
  );
  carol.act({ kind: 'life.add', delta: 25 });
  await sleep(400);
  carol.requestResync();
  await carol.expectState((s) => carol.me(s).life === 20, 'life restored', 5000, { since: mark });

  // ---- 3) Targeting legality on Doom Blade (a black spell).
  mark = alice.mark();
  alice.act({ kind: 'cast', iid: ai['Doom Blade'], x: 0.5, y: 0.5 });
  await alice.expectState(
    (s) => (s.stack ?? []).some((c) => c.name === 'Doom Blade'),
    'Doom Blade on the stack',
    6000,
    { since: mark },
  );
  const bladeIid = alice.lastState().stack.find((c) => c.name === 'Doom Blade').iid;
  const expectReject = async (targetIid, label) => {
    const since = alice.mark();
    alice.act({ kind: 'stack.target', iid: bladeIid, targetIid });
    const err = await alice.waitFor((m) => m.type === 'error', { since, timeoutMs: 4000 });
    t.ok(err?.code === 'illegal', label, JSON.stringify(err));
  };
  await expectReject(ci['Slippery Bogle'], 'hexproof refuses an opposing spell');
  await expectReject(ci['Argothian Enchantress'], 'shroud refuses everyone');
  await expectReject(ci['White Knight'], 'protection from black refuses Doom Blade');
  // Ward {1} is a REAL payment now: the aim lands and a land taps for it.
  mark = alice.mark();
  alice.act({ kind: 'stack.target', iid: bladeIid, targetIid: ci['Armored Armadillo'] });
  await alice.expectLog(
    /pt_alice targets Armored Armadillo with Doom Blade, paying ward \{1\}/,
    'ward paid on targeting',
    { since: mark, timeoutMs: 5000 },
  );
  t.ok(
    my(alice).battlefield.some((c) => ['Plains', 'Swamp', 'Mountain'].includes(c.name) && c.tapped),
    'a land tapped for the ward',
    '',
  );
  // Clear the stack (carol passes, alice resolves; the armadillo's fate is
  // the freeform owner's business).
  mark = alice.mark();
  carol.act({ kind: 'stack.pass' });
  await alice.expectState((s) => (s.stackPassed ?? []).length === 1, 'carol passed the Blade', 5000, { since: mark });
  alice.act({ kind: 'stack.resolve', iid: bladeIid, to: 'graveyard' });
  await alice.expectState((s) => (s.stack ?? []).length === 0, 'Blade resolved', 5000, { since: mark });

  // ---- 4a) The end-step window: carol casts Opt INSIDE alice's window.
  mark = alice.mark();
  const cw = carol.mark();
  alice.act({ kind: 'turn.pass' });
  await carol.expectState((s) => s.endWindow != null, 'end window open', 5000, { since: cw });
  const carolHand = my(carol).handCount;
  carol.act({ kind: 'cast', iid: ci['Opt'], x: 0.5, y: 0.5 });
  await carol.expectState(
    (s) => (s.stack ?? []).some((c) => c.name === 'Opt'),
    'Opt cast inside the window',
    6000,
    { since: cw },
  );
  alice.act({ kind: 'stack.pass' });
  await carol.expectState(
    (s) => (s.stackPassed ?? []).includes(seatOf(alice)),
    'alice passed on Opt',
    5000,
    { since: cw },
  );
  carol.act({ kind: 'stack.resolve', iid: carol.lastState().stack.find((c) => c.name === 'Opt').iid, to: 'graveyard' });
  await carol.expectState(
    // cast (-1) then the intent draw (+1): net unchanged.
    (s) => carol.me(s).handCount === carolHand,
    'Opt drew inside the window',
    6000,
    { since: cw },
  );
  // Now the window closes on carol's pass and the turn moves to her.
  carol.act({ kind: 'stack.pass' });
  await carol.expectState(
    (s) => s.activeSeat === seatOf(carol),
    "the pass closed alice's turn",
    6000,
    { since: cw },
  );
  // Carol's turn: hand it straight back (alice answers her window).
  const aw = alice.mark();
  carol.act({ kind: 'turn.pass' });
  await alice.expectState((s) => s.endWindow != null, "carol's end window", 5000, { since: aw });
  alice.act({ kind: 'stack.pass' });
  await alice.expectState(
    (s) => s.turnNumber === 2 && s.activeSeat === seatOf(alice),
    "alice's second turn",
    6000,
    { since: aw },
  );

  // ---- 4b) Chandra: cast, +1 with a queued MANUAL prompt, the once-per-turn
  // and loyalty-floor rejections.
  mark = alice.mark();
  alice.act({ kind: 'cast', iid: ai['Chandra, Torch of Defiance'], x: 0.45, y: 0.45 });
  await alice.expectState(
    (s) => alice.me(s).battlefield.some(
      (c) => c.name === 'Chandra, Torch of Defiance' && (c.counters?.loyalty ?? 0) === 4,
    ),
    'Chandra entered with 4 loyalty',
    6000,
    { since: mark },
  );
  const chandraIid = my(alice).battlefield.find((c) => c.name === 'Chandra, Torch of Defiance').iid;
  mark = alice.mark();
  alice.act({ kind: 'loyalty.activate', iid: chandraIid, index: 0 });
  const actState = await alice.expectState(
    (s) =>
      alice.me(s).battlefield.find((c) => c.iid === chandraIid)?.counters?.loyalty === 5 &&
      (s.pendingTriggers ?? []).some((p) => p.sourceName === 'Chandra, Torch of Defiance'),
    '+1 banked loyalty and queued the ability prompt',
    6000,
    { since: mark },
  );
  const abilityPrompt = actState.pendingTriggers.find(
    (p) => p.sourceName === 'Chandra, Torch of Defiance',
  );
  t.eq(abilityPrompt.auto, false, 'the exile-and-cast ability is manual (acknowledged, not applied)');
  alice.act({ kind: 'trigger.answer', id: abilityPrompt.id, apply: true });
  await alice.expectState((s) => (s.pendingTriggers ?? []).length === 0, 'prompt acknowledged', 5000, { since: mark });
  // Second activation this turn: rejected.
  let since2 = alice.mark();
  alice.act({ kind: 'loyalty.activate', iid: chandraIid, index: 1 });
  let err = await alice.waitFor((m) => m.type === 'error', { since: since2, timeoutMs: 4000 });
  t.ok(err?.code === 'illegal', 'second activation in a turn rejected', JSON.stringify(err));
  // -7 with 5 loyalty: rejected by the floor.
  since2 = alice.mark();
  alice.act({ kind: 'loyalty.activate', iid: chandraIid, index: 3 });
  err = await alice.waitFor((m) => m.type === 'error', { since: since2, timeoutMs: 4000 });
  t.ok(err?.code === 'illegal', 'minus below zero rejected', JSON.stringify(err));

  // ---- 5) Saboteur: Scroll Thief (on the board since turn 1) connects.
  mark = alice.mark();
  const cwm = carol.mark();
  const handBefore = my(alice).handCount;
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => Boolean(s.combat), 'combat open', 5000, { since: mark });
  alice.act({ kind: 'combat.attack', iid: ai['Scroll Thief'] });
  await alice.expectState((s) => s.combat?.attackers?.length === 1, 'Thief attacks', 5000, { since: mark });
  alice.act({ kind: 'combat.lock' });
  await carol.expectState((s) => s.combat?.locked === true, 'locked', 5000, { since: cwm });
  carol.act({ kind: 'combat.ready' });
  await alice.expectState((s) => s.combat?.preview != null, 'preview computed', 6000, { since: mark });
  alice.act({ kind: 'combat.resolve' });
  const sabo = await alice.expectState(
    (s) => (s.pendingTriggers ?? []).some(
      (p) => p.sourceName === 'Scroll Thief' && p.when === 'dealsPlayerDamage',
    ),
    'saboteur trigger fired on connection',
    6000,
    { since: mark },
  );
  alice.act({
    kind: 'trigger.answer',
    id: sabo.pendingTriggers.find((p) => p.sourceName === 'Scroll Thief').id,
    apply: true,
  });
  await alice.expectState(
    (s) => alice.me(s).handCount === handBefore + 1,
    'the saboteur draw applied',
    6000,
    { since: mark },
  );
  alice.act({ kind: 'combat.end' });
  await alice.expectState((s) => !s.combat, 'combat closed', 5000, { since: mark });

  // ---- 6) Loyalty death: strip Chandra to zero and the sweep takes her.
  mark = alice.mark();
  alice.act({ kind: 'card.counter', iid: chandraIid, counter: 'loyalty', delta: -5 });
  await alice.expectState(
    (s) => alice.me(s).graveyard.some((c) => c.name === 'Chandra, Torch of Defiance'),
    'zero-loyalty Chandra died to the sweep',
    6000,
    { since: mark },
  );

  alice.send({ type: 'room.leave' });
  carol.send({ type: 'room.leave' });
  await deleteRoom(alice, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('enforced-engine crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'enforced-engine', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
