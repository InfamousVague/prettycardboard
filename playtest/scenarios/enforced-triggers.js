// Scenario: enforced triggered abilities (rules roadmap pass A). A solo seat
// goldfishes a purpose-built deck whose cards carry every parsed trigger
// pattern: ETB (draw / compound draw-and-lose / drain, and a land's ETB on
// the legal land drop), dies (token stub), attacks (gain life / +1/+1
// counter), beginning-of-upkeep (auto and manual), and end-step (token).
// Proves the prompt lifecycle over the real protocol: fire ->
// pendingTriggers in room.state -> owner answers -> engine applies (or
// declines / acknowledges a manual trigger), plus once-per-turn end-step
// semantics across phase.set and turn.pass.
//
// Determinism: the opening hand is bottomed, every singleton test card is
// fetched out of the library BEFORE anything can draw, and after that the
// library holds only basic lands - so every subsequent draw is a land and no
// test card can hide in a random zone.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

// Confirmed Scryfall oracle texts (2026-07-30):
//   Elvish Visionary   {1}{G}  "When this creature enters, draw a card."
//   Dusk Legion Zealot {1}{B}  "When this creature enters, you draw a card and you lose 1 life."
//   Vampire Spawn      {2}{B}  "When this creature enters, each opponent loses 2 life and you gain 2 life."
//   Radiant Fountain   land    "When this land enters, you gain 2 life."
//   Doomed Dissenter   {1}{B}  "When this creature dies, create a 2/2 black Zombie creature token."
//   Moonrise Cleric    {1}{WB}{WB} "Flying / Whenever this creature attacks, you gain 1 life."
//   Operations Officer {3}{W}  ETB draw + "Whenever this creature attacks, put a +1/+1 counter on it."
//   Nyx-Fleece Ram     {1}{W}  "At the beginning of your upkeep, you gain 1 life."
//   Breeding Pit       {3}{B}  upkeep sacrifice-unless-pay (manual) + end-step 0/1 Thrull token.
const CARDS = {
  visionary: { id: 'a2f174e6-9532-4fc3-815b-2dc3966c6523', name: 'Elvish Visionary' },
  zealot: { id: '72048624-e3fd-4e9b-91a9-996ea3a1a74f', name: 'Dusk Legion Zealot' },
  spawn: { id: 'b8975c72-b2ec-4c5f-86a4-4e1e3bb41c15', name: 'Vampire Spawn' },
  fountain: { id: '7ee5e77f-ca43-480d-ac37-48336d3bf044', name: 'Radiant Fountain' },
  dissenter: { id: 'f7c0cf16-81ea-45e3-99cc-4424d59bb44b', name: 'Doomed Dissenter' },
  cleric: { id: '35f2a71f-31e8-4b51-9dd4-51a5336b3b86', name: 'Moonrise Cleric' },
  officer: { id: '40a37274-af28-4019-86fc-197e764e9e3e', name: 'Operations Officer' },
  ram: { id: '771fcea9-1007-4ff6-8000-99017978ac1c', name: 'Nyx-Fleece Ram' },
  pit: { id: '39abb31a-15af-4182-a33b-ecdb63e09e3e', name: 'Breeding Pit' },
  plains: { id: '9dd2d666-7c6b-48ce-93dc-c004ebdd1fe9', name: 'Plains' },
  swamp: { id: 'f66094ef-059b-4511-aa6e-835906736de4', name: 'Swamp' },
  forest: { id: 'be72862d-d71e-4b18-98a6-59019399f631', name: 'Forest' },
};

async function main() {
  const t = new Assert('enforced-triggers');
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await me.ensureUser();

  // A purpose-built deck: one of each trigger card, lands for the rest.
  const payload = {
    name: 'PT Trigger Lab',
    format: 'standard',
    cards: [
      ...[CARDS.visionary, CARDS.zealot, CARDS.spawn, CARDS.fountain, CARDS.dissenter,
          CARDS.cleric, CARDS.officer, CARDS.ram, CARDS.pit]
        .map((c) => ({ scryfallId: c.id, name: c.name, quantity: 1, board: 'main' })),
      { scryfallId: CARDS.plains.id, name: 'Plains', quantity: 17, board: 'main' },
      { scryfallId: CARDS.swamp.id, name: 'Swamp', quantity: 17, board: 'main' },
      { scryfallId: CARDS.forest.id, name: 'Forest', quantity: 17, board: 'main' },
    ],
  };
  const list = await me.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === payload.name);
  const deckRes = existing
    ? await me.api('PUT', `/api/decks/${existing.id}`, payload)
    : await me.api('POST', '/api/decks', payload);
  const deckId = existing ? existing.id : deckRes.json.id;
  t.ok([200, 201].includes(deckRes.status), 'trigger-lab deck uploaded', `status ${deckRes.status}`);

  await me.connect();
  me.send({ type: 'room.leave' });
  await sleep(300);

  // Solo goldfish: a 2-seat table with one seat taken is startable (start
  // gates on seated players, not on filling the room) and fully
  // deterministic - nobody else ever acts.
  const mk = await me.api('POST', '/api/rooms', {
    name: 'Trigger lab', seats: 2, persistent: false, format: 'standard',
  });
  const roomId = mk.json.roomId;
  me.joinRoom(roomId, deckId);
  await me.expectState((s) => s.players.length === 1, 'seated', 5000);
  const st = me.lastState().settings ?? {};
  me.send({ type: 'room.settings', settings: { ...st, enforced: true } });
  await me.expectState((s) => s.settings?.enforced === true, 'enforced on', 5000);
  me.setReady(true);
  // Oracle prefetch: one small deck, one Scryfall batch.
  await sleep(4000);
  me.send({ type: 'room.start' });
  await me.expectState((s) => s.started, 'started', 5000);
  me.act({ kind: 'mull.keep', bottomIids: [] });
  await me.expectState((s) => s.players[0].mulligan?.state === 'kept', 'hand kept', 10000);

  const myself = () => me.lastState().players[0];
  const inZone = (zone, name) => myself()[zone].find((c) => c.name === name);
  const prompts = () => me.lastState().pendingTriggers ?? [];
  const myPrompt = (name) => prompts().find((p) => p.sourceName === name);

  // The opening hand may hold any of the singleton test cards: return it all
  // to the library so every card is fetchable from one place.
  for (const c of [...myself().hand]) {
    me.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
  }
  await me.expectState((s) => s.players[0].handCount === 0, 'opening hand bottomed', 6000);

  // Fetch named cards out of the library (setup only - the freeform tutoring
  // verbs stay legal under enforcement on purpose).
  me.act({ kind: 'library.search' });
  const libMsg = await me.waitFor((m) => m.type === 'library.cards', { timeoutMs: 5000 });
  t.ok(libMsg, 'library search returned cards', '');
  const lib = libMsg.cards;
  const used = new Set();
  const fetchTo = async (name, zone, x = 0.3, y = 0.6) => {
    // Same-named cards share a name but not an iid: never fetch one twice.
    const card = lib.find((c) => c.name === name && !used.has(c.iid));
    used.add(card.iid);
    me.act({ kind: 'card.move', iid: card.iid, to: zone, x, y });
    await me.expectState(
      (s) => s.players[0][zone].some((c) => c.iid === card.iid),
      `${name} fetched to ${zone}`,
      5000,
    );
    return card.iid;
  };

  // ---- Setup: everything out of the library before anything draws.
  await fetchTo('Elvish Visionary', 'hand');
  await fetchTo('Dusk Legion Zealot', 'hand');
  await fetchTo('Vampire Spawn', 'hand');
  await fetchTo('Radiant Fountain', 'hand');
  for (let i = 0; i < 3; i++) await fetchTo('Plains', 'battlefield', 0.06 + i * 0.06, 0.8);
  for (let i = 0; i < 3; i++) await fetchTo('Swamp', 'battlefield', 0.24 + i * 0.06, 0.8);
  await fetchTo('Forest', 'battlefield', 0.42, 0.8);
  // Battlefield residents whose triggers must all stay SILENT on arrival
  // (dies / attacks / upkeep / end-step - none is an ETB).
  const dissenterIid = await fetchTo('Doomed Dissenter', 'battlefield', 0.66, 0.55);
  const clericIid = await fetchTo('Moonrise Cleric', 'battlefield', 0.72, 0.55);
  await fetchTo('Nyx-Fleece Ram', 'battlefield', 0.84, 0.55);
  await fetchTo('Breeding Pit', 'battlefield', 0.9, 0.55);
  t.eq(prompts().length, 0, 'no prompt fired for non-ETB arrivals');

  // ---- 1) ETB draw on battlefield arrival (library -> battlefield counts).
  const officerIid = await fetchTo('Operations Officer', 'battlefield', 0.78, 0.55);
  let state = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === 'Operations Officer'),
    'Officer ETB prompt fired on arrival',
    6000,
  );
  const offPrompt = myPrompt('Operations Officer');
  t.eq(offPrompt?.when, 'etb', 'prompt is an ETB trigger');
  t.eq(offPrompt?.auto, true, 'draw effect is auto-applicable');
  let handBefore = myself().handCount;
  let sinceMark = me.mark();
  me.act({ kind: 'trigger.answer', id: offPrompt.id, apply: true });
  await me.expectState(
    (s) => s.players[0].handCount === handBefore + 1 && (s.pendingTriggers ?? []).length === 0,
    'applied: drew a card, prompt cleared',
    6000,
    { since: sinceMark },
  );

  // ---- 2) ETB draw via a real cast, paying mana.
  handBefore = myself().handCount;
  me.act({ kind: 'cast', iid: inZone('hand', 'Elvish Visionary').iid, x: 0.5, y: 0.55 });
  state = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === 'Elvish Visionary'),
    'Visionary ETB prompt fired on cast',
    6000,
  );
  const visPrompt = myPrompt('Elvish Visionary');
  t.eq(visPrompt?.effects, [{ kind: 'draw', n: 1 }], 'parsed effect is draw 1');
  sinceMark = me.mark();
  me.act({ kind: 'trigger.answer', id: visPrompt.id, apply: true });
  await me.expectState(
    // Cast lowered the count by one; the applied draw brings it back.
    (s) => s.players[0].handCount === handBefore && (s.pendingTriggers ?? []).length === 0,
    'cast ETB applied',
    6000,
    { since: sinceMark },
  );

  // ---- 3) Compound ETB (draw + lose 1), applied.
  let lifeBefore = myself().life;
  handBefore = myself().handCount;
  me.act({ kind: 'cast', iid: inZone('hand', 'Dusk Legion Zealot').iid, x: 0.55, y: 0.55 });
  state = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === 'Dusk Legion Zealot'),
    'Zealot ETB prompt fired',
    6000,
  );
  t.eq(
    myPrompt('Dusk Legion Zealot')?.effects,
    [{ kind: 'draw', n: 1 }, { kind: 'loseLife', n: 1 }],
    'compound effects parsed',
  );
  me.act({ kind: 'trigger.answer', id: myPrompt('Dusk Legion Zealot').id, apply: true });
  await me.expectState(
    (s) => s.players[0].life === lifeBefore - 1 && s.players[0].handCount === handBefore,
    'compound applied: -1 life and a fresh card',
    6000,
  );

  // ---- 4) ETB declined: no effect happens.
  lifeBefore = myself().life;
  me.act({ kind: 'cast', iid: inZone('hand', 'Vampire Spawn').iid, x: 0.6, y: 0.55 });
  state = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === 'Vampire Spawn'),
    'Spawn ETB prompt fired',
    6000,
  );
  sinceMark = me.mark();
  me.act({ kind: 'trigger.answer', id: myPrompt('Vampire Spawn').id, apply: false });
  await me.expectState(
    (s) => (s.pendingTriggers ?? []).length === 0,
    'declined prompt cleared',
    5000,
    { since: sinceMark },
  );
  t.eq(myself().life, lifeBefore, 'declined trigger changed nothing');

  // ---- 5) Dies trigger: Dissenter to the graveyard leaves a Zombie token.
  me.act({ kind: 'trigger.answer', id: 'bogus', apply: true }); // noise: unknown id is rejected, state unharmed
  me.act({ kind: 'card.move', iid: dissenterIid, to: 'graveyard' });
  state = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === 'Doomed Dissenter'),
    'Dissenter dies prompt fired',
    6000,
  );
  const diesPrompt = myPrompt('Doomed Dissenter');
  t.eq(diesPrompt?.when, 'dies', 'prompt is a dies trigger');
  me.act({ kind: 'trigger.answer', id: diesPrompt.id, apply: true });
  await me.expectState(
    (s) => s.players[0].battlefield.some((c) => c.isToken && c.name === 'Zombie' && c.power === '2'),
    'a 2/2 Zombie token stub appeared',
    6000,
  );

  // ---- 6) End step of turn 1: entering the end phase fires the Pit's token
  //         maker; passing the turn afterwards must NOT re-fire it.
  me.act({ kind: 'phase.set', phase: 'end' });
  state = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.when === 'endStep'),
    'end-step prompt fired on entering the end phase',
    6000,
  );
  me.act({ kind: 'trigger.answer', id: myPrompt('Breeding Pit').id, apply: true });
  await me.expectState(
    (s) => s.players[0].battlefield.some((c) => c.isToken && c.name === 'Thrull'),
    'a 0/1 Thrull token stub appeared',
    6000,
  );
  const thrullsBefore = myself().battlefield.filter((c) => c.name === 'Thrull').length;

  // ---- 7) Turn 2 upkeep: the Ram's auto life gain and the Pit's manual
  //         sacrifice-unless-pay fire together; no duplicate end-step.
  lifeBefore = myself().life;
  me.act({ kind: 'turn.pass' });
  state = await me.expectState(
    (s) => (s.pendingTriggers ?? []).filter((p) => p.when === 'upkeep').length === 2,
    'both upkeep prompts fired on the new turn',
    6000,
  );
  t.eq(state.turnNumber, 2, 'turn 2 began');
  t.eq(
    state.pendingTriggers.filter((p) => p.when === 'endStep').length,
    0,
    'no duplicate end-step firing on turn.pass',
  );
  t.eq(myself().battlefield.filter((c) => c.name === 'Thrull').length, thrullsBefore, 'no extra Thrull');
  const ramPrompt = myPrompt('Nyx-Fleece Ram');
  const pitPrompt = myPrompt('Breeding Pit');
  t.eq(ramPrompt?.auto, true, 'Ram upkeep is auto');
  t.eq(pitPrompt?.auto, false, 'Pit upkeep (sacrifice unless pay) is manual');
  sinceMark = me.mark();
  me.act({ kind: 'trigger.answer', id: ramPrompt.id, apply: true });
  me.act({ kind: 'trigger.answer', id: pitPrompt.id, apply: true }); // acknowledgment only
  // turn.pass untap+draw preceded the upkeep, so life compares against the
  // post-draw baseline captured above.
  await me.expectState(
    (s) => s.players[0].life === lifeBefore + 1 && (s.pendingTriggers ?? []).length === 0,
    'Ram applied (+1 life), manual Pit acknowledged without effect',
    6000,
    { since: sinceMark },
  );

  // ---- 8) A land's ETB fires on the legal land drop (turn 1's allowance
  //         was consumed by the library -> battlefield land fetches).
  lifeBefore = myself().life;
  me.act({ kind: 'card.move', iid: inZone('hand', 'Radiant Fountain').iid, to: 'battlefield', x: 0.48, y: 0.8 });
  state = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === 'Radiant Fountain'),
    'Fountain land-drop ETB prompt fired',
    6000,
  );
  me.act({ kind: 'trigger.answer', id: myPrompt('Radiant Fountain').id, apply: true });
  await me.expectState((s) => s.players[0].life === lifeBefore + 2, 'gained 2 life', 5000);

  // ---- 9) Attack triggers fire on combat.lock (gain life + self counter).
  //         Cleric and Officer arrived last turn: summoning sickness is gone.
  lifeBefore = myself().life;
  me.act({ kind: 'combat.begin' });
  await me.expectState((s) => Boolean(s.combat), 'combat open', 5000);
  me.act({ kind: 'combat.attack', iid: clericIid });
  me.act({ kind: 'combat.attack', iid: officerIid });
  await me.expectState((s) => s.combat?.attackers?.length === 2, 'two attackers declared', 5000);
  me.act({ kind: 'combat.lock' });
  state = await me.expectState(
    (s) => (s.pendingTriggers ?? []).filter((p) => p.when === 'attacks').length === 2,
    'both attack triggers fired on lock',
    6000,
  );
  me.act({ kind: 'trigger.answer', id: myPrompt('Moonrise Cleric').id, apply: true });
  me.act({ kind: 'trigger.answer', id: myPrompt('Operations Officer').id, apply: true });
  await me.expectState(
    (s) =>
      s.players[0].life === lifeBefore + 1 &&
      s.players[0].battlefield.some(
        (c) => c.iid === officerIid && (c.counters?.['+1/+1'] ?? 0) === 1,
      ),
    'gained 1 life and the Officer wears a +1/+1 counter',
    6000,
  );
  sinceMark = me.mark();
  me.act({ kind: 'combat.end' });
  await me.expectState((s) => !s.combat, 'combat closed', 5000, { since: sinceMark });

  me.send({ type: 'room.leave' });
  await deleteRoom(me, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('enforced-triggers crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'enforced-triggers', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
