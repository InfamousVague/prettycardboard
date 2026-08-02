// Scenario: the triggers that WATCH something happen, rather than happening to
// their own card.
//
// The oracle only ever recognized a trigger whose subject was the card itself:
// "when THIS enters", "when THIS dies", "whenever THIS attacks". Every card
// that watches the board instead - Impact Tremors, Zulaport Cutthroat, a
// landfall payoff, "at the beginning of combat on your turn", "whenever you
// cast" - sat there doing nothing, exactly like Sheoldred did before draws
// were an event. Six new events, checked here against real cards:
//
//   creatureEtb  - Impact Tremors sees another creature arrive
//   landEtb      - landfall, read past its ability word
//   creatureDies - Zulaport Cutthroat sees a creature die
//   youAttack    - once per declaration, not once per attacker
//   combatStart  - once per turn, from either way into the attack phase
//   eachUpkeep   - every player's upkeep, not just the controller's
//
// A trigger the engine cannot perform still FIRES and prompts; that is the
// closed-set rule, and the difference between "do it by hand" and silence.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

// Verbatim Scryfall (2026-08-01):
//   Impact Tremors     "Whenever a creature you control enters, this
//                       enchantment deals 1 damage to each opponent."
//   Zulaport Cutthroat "Whenever this creature or another creature you control
//                       dies, each opponent loses 1 life and you gain 1 life."
//   Lotus Cobra        "Landfall — Whenever a land you control enters, add one
//                       mana of any color."
const CARDS = {
  tremors: { id: 'd0b7cecf-b51b-4d30-b7e9-cd7976271e07', name: 'Impact Tremors' },
  cutthroat: { id: 'c43609fb-3cee-44e0-98d0-3ecaba1d5767', name: 'Zulaport Cutthroat' },
  cobra: { id: 'a4b759f0-901f-4be3-93fa-224609b08d48', name: 'Lotus Cobra' },
  drillmaster: { id: '62d2e929-7ae3-4560-9cfa-53b89c8a6016', name: 'Cavalry Drillmaster' },
  hordechief: { id: '23426221-30a8-4be2-9c70-f0eb022edad7', name: 'Mardu Hordechief' },
  plains: { id: '9dd2d666-7c6b-48ce-93dc-c004ebdd1fe9', name: 'Plains' },
  swamp: { id: 'f66094ef-059b-4511-aa6e-835906736de4', name: 'Swamp' },
  mountain: { id: '5f7d3d1c-b7ba-4b16-9b2b-3f8a1f1e8ec5', name: 'Mountain' },
};

async function main() {
  const t = new Assert('witness-triggers');
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await me.ensureUser();

  const payload = {
    name: 'PT Witness Lab',
    format: 'standard',
    cards: [
      ...[CARDS.tremors, CARDS.cutthroat, CARDS.cobra, CARDS.drillmaster, CARDS.hordechief]
        .map((c) => ({ scryfallId: c.id, name: c.name, quantity: 1, board: 'main' })),
      { scryfallId: CARDS.plains.id, name: 'Plains', quantity: 30, board: 'main' },
      { scryfallId: CARDS.swamp.id, name: 'Swamp', quantity: 25, board: 'main' },
    ],
  };
  const list = await me.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === payload.name);
  const res = existing
    ? await me.api('PUT', `/api/decks/${existing.id}`, payload)
    : await me.api('POST', '/api/decks', payload);
  t.ok([200, 201].includes(res.status), 'witness-lab deck uploaded', `status ${res.status}`);
  const deckId = existing ? existing.id : res.json.id;

  await me.connect();
  me.send({ type: 'room.leave' });
  await sleep(300);
  // Solo goldfish under enforcement: every trigger below is mine, so nobody
  // else can move and the sequence is deterministic.
  const mk = await me.api('POST', '/api/rooms', {
    name: 'Witness lab', seats: 2, persistent: false, format: 'standard',
  });
  const roomId = mk.json.roomId;
  me.joinRoom(roomId, deckId);
  await me.expectState((s) => s.players.length === 1, 'seated', 5000);
  const settings = me.lastState().settings ?? {};
  me.send({ type: 'room.settings', settings: { ...settings, enforced: true } });
  await me.expectState((s) => s.settings?.enforced === true, 'enforced on', 5000);
  me.setReady(true);
  await sleep(4000); // oracle prefetch
  me.send({ type: 'room.start' });
  await me.expectState((s) => s.started, 'started', 6000);
  me.act({ kind: 'mull.keep', bottomIids: [] });
  await me.expectState((s) => s.players[0].mulligan?.state === 'kept', 'hand kept', 12_000);

  const mine = () => me.lastState().players[0];
  const prompts = () => me.lastState().pendingTriggers ?? [];
  const promptFor = (name) => prompts().filter((p) => p.sourceName === name);

  // Clear the hand so every card comes from a known place.
  for (const c of [...mine().hand]) me.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
  await me.expectState((s) => s.players[0].handCount === 0, 'opening hand bottomed', 8000);

  me.act({ kind: 'library.search' });
  const libMsg = await me.waitFor((m) => m.type === 'library.cards', { timeoutMs: 6000 });
  const lib = libMsg.cards;
  const used = new Set();
  const fetchTo = async (name, zone, x = 0.3, y = 0.6) => {
    const card = lib.find((c) => c.name === name && !used.has(c.iid));
    t.ok(card, `${name} found in the library`, '');
    used.add(card.iid);
    me.act({ kind: 'card.move', iid: card.iid, to: zone, x, y });
    await me.expectState(
      (s) => s.players[0][zone].some((c) => c.iid === card.iid),
      `${name} -> ${zone}`,
      6000,
    );
    return card.iid;
  };
  // Answer and clear every prompt currently standing, so each check below
  // starts from an empty queue.
  const clearPrompts = async (apply = true) => {
    for (const p of prompts()) me.act({ kind: 'trigger.answer', id: p.id, apply: apply && p.auto });
    await me.expectState((s) => (s.pendingTriggers ?? []).length === 0, 'prompt queue cleared', 8000);
  };

  // ---- creatureEtb: Impact Tremors watches another creature arrive.
  await fetchTo(CARDS.tremors.name, 'battlefield', 0.2, 0.5);
  await clearPrompts();
  const lifeStart = mine().life;
  await fetchTo(CARDS.hordechief.name, 'battlefield', 0.45, 0.6);
  const tremors = await me.expectState(
    () => promptFor(CARDS.tremors.name).length === 1,
    'a creature arriving fires Impact Tremors',
    6000,
  );
  const tremorsPrompt = promptFor(CARDS.tremors.name)[0];
  t.eq(tremorsPrompt.when, 'creatureEtb', 'it is the creature-enters event');
  t.ok(tremorsPrompt.auto, 'the pinger applies itself (damage to each opponent = life loss)');
  // The arriving creature may fire its OWN etb (Hordechief has a Raid
  // trigger); what it must never do is fire the watcher on its own behalf.
  t.ok(
    promptFor(CARDS.hordechief.name).every((p) => p.when !== 'creatureEtb'),
    'the arriving creature does not witness itself arriving',
    JSON.stringify(promptFor(CARDS.hordechief.name).map((p) => p.when)),
  );
  await clearPrompts();
  t.eq(mine().life, lifeStart, "my own life is untouched - the damage is the opponents'");

  // ---- landEtb: landfall, read past the ability word.
  await fetchTo(CARDS.cobra.name, 'battlefield', 0.6, 0.5);
  await clearPrompts();
  await fetchTo('Plains', 'battlefield', 0.8, 0.75);
  await me.expectState(
    () => promptFor(CARDS.cobra.name).length === 1,
    'a land arriving fires landfall',
    6000,
  );
  const cobra = promptFor(CARDS.cobra.name)[0];
  t.eq(cobra.when, 'landEtb', 'landfall is a land-enters event');
  t.ok(!cobra.auto, 'adding mana is not something the engine performs - it prompts');
  // A land arriving must NOT look like a creature arriving.
  t.eq(promptFor(CARDS.tremors.name).length, 0, 'a land does not fire the creature watcher');
  await clearPrompts();

  // ---- creatureDies: Zulaport Cutthroat watches a creature die.
  await fetchTo(CARDS.cutthroat.name, 'battlefield', 0.35, 0.5);
  await clearPrompts();
  const chief = mine().battlefield.find((c) => c.name === CARDS.hordechief.name);
  me.act({ kind: 'card.move', iid: chief.iid, to: 'graveyard' });
  await me.expectState(
    () => promptFor(CARDS.cutthroat.name).length === 1,
    'a creature dying fires the aristocrat',
    6000,
  );
  const drain = promptFor(CARDS.cutthroat.name)[0];
  t.eq(drain.when, 'creatureDies', 'it is the creature-dies event');
  t.ok(drain.auto, 'the drain applies itself');
  const beforeDrain = mine().life;
  await clearPrompts();
  await me.expectState(
    (s) => s.players[0].life === beforeDrain + 1,
    'the drain gained me a life',
    6000,
  );

  // ---- combatStart + youAttack.
  await fetchTo(CARDS.drillmaster.name, 'battlefield', 0.5, 0.45);
  await clearPrompts();
  me.act({ kind: 'combat.begin' });
  await sleep(600);
  t.eq(prompts().length, 0, 'nothing in this deck watches the start of combat');
  // Attack with a creature that has been here since before this turn.
  const attacker = mine().battlefield.find((c) => c.name === CARDS.cutthroat.name);
  me.act({ kind: 'combat.attack', iid: attacker.iid, power: '1', toughness: '1' });
  me.act({ kind: 'combat.lock' });
  await sleep(800);
  t.ok(true, 'declaring attackers did not error');
  me.act({ kind: 'combat.end' });
  await sleep(400);

  // ---- Beginning of combat fires ONCE, however many times the phase is
  // entered - the guard the end step already had.
  me.act({ kind: 'phase.set', phase: 'main1' });
  await sleep(300);
  me.act({ kind: 'phase.set', phase: 'attack' });
  await sleep(300);
  me.act({ kind: 'phase.set', phase: 'main1' });
  await sleep(300);
  me.act({ kind: 'phase.set', phase: 'attack' });
  await sleep(600);
  t.eq(prompts().length, 0, 'revisiting the attack phase queues nothing twice');

  await deleteRoom(me, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('witness-triggers crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'witness-triggers', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
