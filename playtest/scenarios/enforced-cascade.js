// Scenario: enforced replacement + cascade effects (rules roadmap pass C).
// Deterministic two-seat table proving:
//   - "enters tapped" and "enters with a +1/+1 counter" auto-apply on
//     battlefield arrival (and coexist with ETB trigger prompts);
//   - "If ~ would die, exile it instead" routes a death to exile with no
//     dies trigger;
//   - the manual "cascade for N" verb: reveal until a nonland with mv < N,
//     the hit rides the stack revealed and free, the rest go to the bottom;
//   - cascade fires automatically on casting a spell with the keyword;
//   - a spell on the stack can be token-copied (the copy resolves like any
//     stack card and evaporates if declined);
//   - Fog Bank's combat damage prevention shields both directions in the
//     server preview.
// Same determinism recipe as the other enforced scenarios: hands bottomed,
// every test card fetched before anything draws, library plants for cascade.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

// Confirmed Scryfall oracle data (2026-07-30):
//   Bloodbraid Elf   {2}{R}{G} 3/2 Haste, Cascade
//   Iron Apprentice  {1}   0/0  "This creature enters with a +1/+1 counter on it." + manual dies trigger
//   Gloomshrieker    {1}{B}{G} 2/2 ETB return-target (manual) + "If this creature would die, exile it instead."
//   Bloodfell Caves  land  "This land enters tapped." + ETB gain 1 life
//   Elvish Visionary {1}{G} 1/1 ETB draw a card
//   Fog Bank         {1}{U} 0/2 defender, flying, prevent all combat damage to and by
const CARDS = {
  bloodbraid: { id: 'e2f12f6f-9383-47e6-a44f-2834ad130e51', name: 'Bloodbraid Elf' },
  apprentice: { id: '13d6d9fc-509b-42db-8ac1-85066eb6e9c4', name: 'Iron Apprentice' },
  shrieker: { id: 'a2b50751-7f65-4321-86da-eef735bf8b67', name: 'Gloomshrieker' },
  caves: { id: '1dde3c68-6f29-4c00-b668-c25ac9e3e13b', name: 'Bloodfell Caves' },
  visionary: { id: 'a2f174e6-9532-4fc3-815b-2dc3966c6523', name: 'Elvish Visionary' },
  fogbank: { id: '18748b1d-4161-482c-a726-8762b4c1819c', name: 'Fog Bank' },
  mountain: { id: 'a18ef64b-a9de-4548-b4d5-168758442db7', name: 'Mountain' },
  forest: { id: 'be72862d-d71e-4b18-98a6-59019399f631', name: 'Forest' },
  swamp: { id: 'f66094ef-059b-4511-aa6e-835906736de4', name: 'Swamp' },
  island: { id: 'b92ec9f6-a56d-40c6-aee2-7d5e1524c985', name: 'Island' },
};

async function uploadDeck(client, name, cards) {
  const payload = { name, format: 'standard', cards };
  const list = await client.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === name);
  const res = existing
    ? await client.api('PUT', `/api/decks/${existing.id}`, payload)
    : await client.api('POST', '/api/decks', payload);
  return existing ? existing.id : res.json.id;
}

async function main() {
  const t = new Assert('enforced-cascade');
  const alice = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  const bob = new PlaytestClient('pt_bob', { password: PASSWORD, assert: t });
  await alice.ensureUser();
  await bob.ensureUser();

  const aliceDeck = await uploadDeck(alice, 'PT Cascade Lab', [
    { scryfallId: CARDS.bloodbraid.id, name: CARDS.bloodbraid.name, quantity: 1, board: 'main' },
    { scryfallId: CARDS.apprentice.id, name: CARDS.apprentice.name, quantity: 1, board: 'main' },
    { scryfallId: CARDS.shrieker.id, name: CARDS.shrieker.name, quantity: 1, board: 'main' },
    { scryfallId: CARDS.caves.id, name: CARDS.caves.name, quantity: 1, board: 'main' },
    { scryfallId: CARDS.visionary.id, name: CARDS.visionary.name, quantity: 2, board: 'main' },
    { scryfallId: CARDS.mountain.id, name: 'Mountain', quantity: 18, board: 'main' },
    { scryfallId: CARDS.forest.id, name: 'Forest', quantity: 18, board: 'main' },
    { scryfallId: CARDS.swamp.id, name: 'Swamp', quantity: 18, board: 'main' },
  ]);
  const bobDeck = await uploadDeck(bob, 'PT Cascade Defense', [
    { scryfallId: CARDS.fogbank.id, name: CARDS.fogbank.name, quantity: 1, board: 'main' },
    { scryfallId: CARDS.island.id, name: 'Island', quantity: 30, board: 'main' },
    { scryfallId: CARDS.forest.id, name: 'Forest', quantity: 29, board: 'main' },
  ]);

  await alice.connect();
  await bob.connect();
  alice.send({ type: 'room.leave' });
  bob.send({ type: 'room.leave' });
  await sleep(300);

  const mk = await alice.api('POST', '/api/rooms', {
    name: 'Cascade lab', seats: 2, persistent: false, format: 'standard',
  });
  const roomId = mk.json.roomId;
  alice.joinRoom(roomId, aliceDeck);
  await alice.expectState((s) => s.players.length === 1, 'alice seated first', 5000);
  bob.joinRoom(roomId, bobDeck);
  await alice.expectState((s) => s.players.length === 2, 'bob seated', 5000);
  const st = alice.lastState().settings ?? {};
  alice.send({ type: 'room.settings', settings: { ...st, enforced: true } });
  await alice.expectState((s) => s.settings?.enforced === true, 'enforced on', 5000);
  alice.setReady(true);
  bob.setReady(true);
  await sleep(4000); // oracle prefetch
  alice.send({ type: 'room.start' });
  await alice.expectState((s) => s.started, 'started', 5000);
  alice.act({ kind: 'mull.keep', bottomIids: [] });
  bob.act({ kind: 'mull.keep', bottomIids: [] });
  await alice.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    'hands kept',
    10000,
  );

  const mine = (client, s = null) =>
    (s ?? client.lastState()).players.find((p) => p.userId === client.userId);
  const prompts = () => alice.lastState().pendingTriggers ?? [];
  const myPrompt = (name) => prompts().find((p) => p.sourceName === name);

  for (const who of [alice, bob]) {
    for (const c of [...mine(who).hand]) {
      who.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
    }
    await who.expectState(
      (s) => s.players.find((p) => p.userId === who.userId).handCount === 0,
      'hand bottomed',
      6000,
    );
    who.act({ kind: 'library.search' });
  }
  const aliceLib = (await alice.waitFor((m) => m.type === 'library.cards', { timeoutMs: 5000 })).cards;
  const bobLib = (await bob.waitFor((m) => m.type === 'library.cards', { timeoutMs: 5000 })).cards;

  const iids = {};
  const fetchTo = async (who, lib, name, zone, x = 0.4, y = 0.55, key = name) => {
    const card = lib.find((c) => c.name === name && !c._used);
    card._used = true;
    who.act({ kind: 'card.move', iid: card.iid, to: zone, x, y });
    await who.expectState(
      (s) => s.players.find((p) => p.userId === who.userId)[zone].some((c) => c.iid === card.iid),
      `${key} fetched to ${zone}`,
      5000,
    );
    iids[key] = card.iid;
    return card.iid;
  };

  // ---- 1) Enters-tapped + the land's ETB trigger, together.
  let mark = alice.mark();
  await fetchTo(alice, aliceLib, 'Bloodfell Caves', 'battlefield', 0.06, 0.8);
  let state = await alice.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === 'Bloodfell Caves'),
    'Caves ETB prompt fired',
    6000,
    { since: mark },
  );
  const caves = mine(alice, state).battlefield.find((c) => c.iid === iids['Bloodfell Caves']);
  t.eq(caves?.tapped, true, 'Bloodfell Caves entered tapped (replacement)');
  const lifeBase = mine(alice).life;
  alice.act({ kind: 'trigger.answer', id: myPrompt('Bloodfell Caves').id, apply: true });
  await alice.expectState(
    (s) => mine(alice, s).life === lifeBase + 1,
    'Caves ETB applied (+1 life)',
    5000,
  );

  // ---- 2) Enters with a +1/+1 counter.
  await fetchTo(alice, aliceLib, 'Iron Apprentice', 'battlefield', 0.14, 0.55);
  state = await alice.expectState(
    (s) =>
      mine(alice, s).battlefield.some(
        (c) => c.iid === iids['Iron Apprentice'] && (c.counters?.['+1/+1'] ?? 0) === 1,
      ),
    'Iron Apprentice entered with its +1/+1 counter',
    6000,
  );

  // ---- 3) Dies-to-exile replacement (its manual ETB is acknowledged first).
  mark = alice.mark();
  await fetchTo(alice, aliceLib, 'Gloomshrieker', 'battlefield', 0.2, 0.55);
  await alice.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === 'Gloomshrieker'),
    'Gloomshrieker manual ETB prompt fired',
    6000,
    { since: mark },
  );
  t.eq(myPrompt('Gloomshrieker')?.auto, false, 'return-target ETB is manual');
  alice.act({ kind: 'trigger.answer', id: myPrompt('Gloomshrieker').id, apply: true });
  mark = alice.mark();
  alice.act({ kind: 'card.move', iid: iids['Gloomshrieker'], to: 'graveyard' });
  await alice.expectState(
    (s) => mine(alice, s).exile.some((c) => c.iid === iids['Gloomshrieker']),
    'Gloomshrieker exiled instead of dying',
    6000,
    { since: mark },
  );
  t.eq(
    mine(alice).graveyard.some((c) => c.iid === iids['Gloomshrieker']),
    false,
    'not in the graveyard',
  );
  const exileLog = await alice.waitFor(
    (m) => m.type === 'log' && /Gloomshrieker is exiled instead of dying/.test(m.text),
    { since: mark, timeoutMs: 4000 },
  );
  t.ok(exileLog, 'replacement logged', '');
  t.eq(
    (alice.lastState().pendingTriggers ?? []).length,
    0,
    'no dies trigger fired for the exiled death',
  );

  // Mana + hand pieces for the cascade tests.
  for (let i = 0; i < 2; i++) await fetchTo(alice, aliceLib, 'Mountain', 'battlefield', 0.3 + i * 0.06, 0.8, `Mountain${i}`);
  for (let i = 0; i < 2; i++) await fetchTo(alice, aliceLib, 'Forest', 'battlefield', 0.44 + i * 0.06, 0.8, `Forest${i}`);
  await fetchTo(alice, aliceLib, 'Elvish Visionary', 'hand', 0.4, 0.55, 'Vis1');
  await fetchTo(alice, aliceLib, 'Elvish Visionary', 'hand', 0.4, 0.55, 'Vis2');
  await fetchTo(alice, aliceLib, 'Bloodbraid Elf', 'hand');
  await fetchTo(alice, aliceLib, 'Forest', 'hand', 0.4, 0.55, 'PlantForest');
  await fetchTo(alice, aliceLib, 'Swamp', 'hand', 0.4, 0.55, 'PlantSwamp');
  await fetchTo(bob, bobLib, 'Fog Bank', 'battlefield', 0.5, 0.4);

  // ---- 4) Manual "cascade for 3": plant [Forest, Visionary] on top.
  alice.act({ kind: 'card.move', iid: iids['Vis1'], to: 'library', index: 0 });
  await alice.expectState((s) => mine(alice, s).handCount === 4, 'Visionary planted', 5000);
  alice.act({ kind: 'card.move', iid: iids['PlantForest'], to: 'library', index: 0 });
  await alice.expectState((s) => mine(alice, s).handCount === 3, 'Forest planted on top', 5000);
  mark = alice.mark();
  alice.act({ kind: 'cascade', n: 3 });
  state = await alice.expectState(
    (s) => (s.stack ?? []).some((c) => c.iid === iids['Vis1']),
    'cascade hit rides the stack',
    6000,
    { since: mark },
  );
  t.eq(state.stack.find((c) => c.iid === iids['Vis1'])?.revealed, true, 'hit is revealed');
  const cascadeLog = await alice.waitFor(
    (m) => m.type === 'log' && /cascades for 3 \(manual\): reveals Forest, Elvish Visionary/.test(m.text),
    { since: mark, timeoutMs: 4000 },
  );
  t.ok(cascadeLog, 'cascade reveal logged in order', '');
  // The revealed Forest went to the bottom.
  alice.act({ kind: 'library.search' });
  const relib = (await alice.waitFor((m) => m.type === 'library.cards', { since: mark, timeoutMs: 5000 })).cards;
  t.eq(relib[relib.length - 1]?.iid, iids['PlantForest'], 'revealed land bottomed');

  // ---- 5) Token-copy of the stack spell, then both resolve free.
  mark = alice.mark();
  alice.act({ kind: 'token.clone', iid: iids['Vis1'], x: 0.5, y: 0.5 });
  state = await alice.expectState(
    (s) => (s.stack ?? []).length === 2,
    'the spell was copied on the stack',
    6000,
    { since: mark },
  );
  const copy = state.stack[1];
  t.eq(copy?.isToken, true, 'the copy is a token');
  t.eq(copy?.name, 'Elvish Visionary', 'copy shares the name');
  // Copy resolves first (top-down): bob passes, alice resolves to battlefield.
  const resolveTop = async (iid, label) => {
    const passSince = alice.mark();
    bob.act({ kind: 'stack.pass' });
    await alice.expectState(
      (s) => (s.stackPassed ?? []).length === 1,
      `${label}: responses passed`,
      6000,
      { since: passSince },
    );
    const since = alice.mark();
    alice.act({ kind: 'stack.resolve', iid, to: 'battlefield', x: 0.6, y: 0.5 });
    await alice.expectState(
      (s) => mine(alice, s).battlefield.some((c) => c.iid === iid),
      `${label}: resolved to the battlefield`,
      6000,
      { since },
    );
    // Its ETB (draw) fires like any other arrival; apply it.
    const prompt = await alice.expectState(
      (s) => (s.pendingTriggers ?? []).some((p) => p.sourceIid === iid),
      `${label}: ETB fired`,
      6000,
      { since },
    );
    const pt = prompt.pendingTriggers.find((p) => p.sourceIid === iid);
    alice.act({ kind: 'trigger.answer', id: pt.id, apply: true });
    await alice.expectState(
      (s) => (s.pendingTriggers ?? []).length === 0,
      `${label}: ETB applied`,
      6000,
      { since },
    );
  };
  await resolveTop(copy.iid, 'copy');
  await resolveTop(iids['Vis1'], 'original');

  // ---- 6) Cascade fires automatically on casting Bloodbraid Elf.
  //         (Hand is 5 again: the two resolved Visionaries each drew a land.)
  alice.act({ kind: 'card.move', iid: iids['Vis2'], to: 'library', index: 0 });
  await alice.expectState((s) => mine(alice, s).handCount === 4, 'Visionary #2 planted', 5000);
  alice.act({ kind: 'card.move', iid: iids['PlantSwamp'], to: 'library', index: 0 });
  await alice.expectState((s) => mine(alice, s).handCount === 3, 'Swamp planted on top', 5000);
  mark = alice.mark();
  alice.act({ kind: 'cast', iid: iids['Bloodbraid Elf'], x: 0.7, y: 0.55 });
  state = await alice.expectState(
    (s) =>
      mine(alice, s).battlefield.some((c) => c.iid === iids['Bloodbraid Elf']) &&
      (s.stack ?? []).some((c) => c.iid === iids['Vis2']),
    'Bloodbraid resolved and its cascade dug up the Visionary',
    6000,
    { since: mark },
  );
  const autoLog = await alice.waitFor(
    (m) => m.type === 'log' && /cascades for 4 \(Bloodbraid Elf, cascade\)/.test(m.text),
    { since: mark, timeoutMs: 4000 },
  );
  t.ok(autoLog, 'keyword cascade fired with n = mana value', '');
  await resolveTop(iids['Vis2'], 'cascade hit');

  // ---- 7) Fog Bank shields both directions in the preview.
  mark = alice.mark();
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => Boolean(s.combat), 'combat open', 5000, { since: mark });
  alice.act({ kind: 'combat.attack', iid: iids['Bloodbraid Elf'] });
  await alice.expectState((s) => s.combat?.attackers?.length === 1, 'haste attack declared', 5000, { since: mark });
  const bobLockSince = bob.mark();
  alice.act({ kind: 'combat.lock' });
  await bob.expectState((s) => s.combat?.locked === true, 'locked', 5000, { since: bobLockSince });
  const bobSince = bob.mark();
  bob.act({ kind: 'combat.block', blockerIid: iids['Fog Bank'], attackerIid: iids['Bloodbraid Elf'] });
  await bob.expectState(
    (s) => (s.combat?.blocks ?? []).length === 1,
    'Fog Bank blocks',
    5000,
    { since: bobSince },
  );
  bob.act({ kind: 'combat.ready' });
  const previewed = await alice.expectState(
    (s) => s.combat?.preview != null,
    'preview computed',
    6000,
    { since: mark },
  );
  const row = previewed.combat.preview.rows.find((r) => r.attackerIid === iids['Bloodbraid Elf']);
  t.eq(row?.playerDamage, 0, 'blocked: nothing through');
  t.eq(row?.attackerDies, false, 'Fog Bank deals no damage (prevention)');
  t.eq(row?.deadBlockers?.length ?? 0, 0, 'Fog Bank takes no damage (prevention)');
  alice.act({ kind: 'combat.end' });

  alice.send({ type: 'room.leave' });
  bob.send({ type: 'room.leave' });
  await deleteRoom(alice, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('enforced-cascade crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'enforced-cascade', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
