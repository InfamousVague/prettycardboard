// Scenario: the two effects a mono-black aristocrats deck is BUILT on, which
// the engine had no idea about.
//
//   Grave Pact / Dictate of Erebos - "whenever a creature you control dies,
//   each opponent sacrifices a creature". The trigger fired (creatureDies is
//   an event now) but its effect was Manual, so the opponent's board never
//   shrank: the whole engine of the deck did nothing.
//
//   Damnation - "destroy all creatures". A wrath resolved to the graveyard
//   and left every creature on the table standing.
//
// A sacrifice is a real choice, so it follows the discard pattern exactly: a
// bot picks its worst creature immediately, a human gets a prompt with a
// deadline that picks for them.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

// Verbatim Scryfall (2026-08-01):
//   Grave Pact  {2}{B}{B}  "Whenever a creature you control dies, each
//                           opponent sacrifices a creature of their choice."
//   Damnation   {2}{B}{B}  "Destroy all creatures. They can't be regenerated."
const CARDS = {
  pact: { id: 'd4a95e2a-1a52-4d1b-8d17-4d3f2d1e5d3f', name: 'Grave Pact' },
  damnation: { id: '8ad3f2ba-9b0b-4f8f-92c5-fdd4c4a4a3c5', name: 'Damnation' },
  bear: { id: '', name: 'Grizzly Bears' },
  swamp: { id: 'f66094ef-059b-4511-aa6e-835906736de4', name: 'Swamp' },
};

async function main() {
  const t = new Assert('edict-wrath');
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await me.ensureUser();

  // Resolve the ids from Scryfall rather than hardcoding guesses: this
  // scenario is only meaningful against the real oracle text.
  const byName = async (name) => {
    const res = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`,
      { headers: { 'User-Agent': 'PrettyCardboard/1.0', Accept: 'application/json' } },
    );
    const json = await res.json();
    return { id: json.id, name: json.name };
  };
  CARDS.pact = await byName('Grave Pact');
  CARDS.damnation = await byName('Damnation');
  CARDS.bear = await byName('Grizzly Bears');

  const payload = {
    name: 'PT Edict Lab',
    format: 'standard',
    cards: [
      { scryfallId: CARDS.pact.id, name: CARDS.pact.name, quantity: 1, board: 'main' },
      { scryfallId: CARDS.damnation.id, name: CARDS.damnation.name, quantity: 1, board: 'main' },
      { scryfallId: CARDS.bear.id, name: CARDS.bear.name, quantity: 4, board: 'main' },
      { scryfallId: CARDS.swamp.id, name: 'Swamp', quantity: 55, board: 'main' },
    ],
  };
  const list = await me.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === payload.name);
  const res = existing
    ? await me.api('PUT', `/api/decks/${existing.id}`, payload)
    : await me.api('POST', '/api/decks', payload);
  t.ok([200, 201].includes(res.status), 'edict-lab deck uploaded', `status ${res.status}`);
  const deckId = existing ? existing.id : res.json.id;

  await me.connect();
  me.send({ type: 'room.leave' });
  await sleep(300);
  const mk = await me.api('POST', '/api/rooms', {
    name: 'Edict lab', seats: 2, persistent: false, format: 'standard',
  });
  const roomId = mk.json.roomId;
  me.joinRoom(roomId, deckId);
  await me.expectState((s) => s.players.length === 1, 'seated', 5000);
  const settings = me.lastState().settings ?? {};
  me.send({ type: 'room.settings', settings: { ...settings, enforced: true } });
  await me.expectState((s) => s.settings?.enforced === true, 'enforced on', 5000);
  // A bot opponent with a board of its own: the edict has to take one of ITS
  // creatures, chosen by it, without a human in the loop.
  me.send({ type: 'bot.add', style: 'casual' });
  await me.expectState((s) => s.players.filter((p) => p.isBot).length === 1, 'bot seated', 10_000);
  me.setReady(true);
  await sleep(4500); // oracle prefetch for both decks
  me.send({ type: 'room.start' });
  await me.expectState((s) => s.started, 'started', 6000);
  me.act({ kind: 'mull.keep', bottomIids: [] });
  await me.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    'hands kept',
    25_000,
  );

  // CardInst.power is only set for tokens and declared stats, so counting
  // creatures by power silently counts zero. Ask Scryfall once per id and
  // cache; the alternative is a test that passes on an empty board.
  const typeCache = new Map();
  const typesOf = async (ids) => {
    const missing = [...new Set(ids)].filter((id) => id && !typeCache.has(id));
    for (let i = 0; i < missing.length; i += 75) {
      const chunk = missing.slice(i, i + 75);
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: {
          'User-Agent': 'PrettyCardboard/1.0',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifiers: chunk.map((id) => ({ id })) }),
      });
      const json = await res.json();
      for (const c of json.data ?? []) typeCache.set(c.id, c.type_line ?? '');
      for (const id of chunk) if (!typeCache.has(id)) typeCache.set(id, '');
    }
    return typeCache;
  };
  const creaturesOn = async (player) => {
    const board = player?.battlefield ?? [];
    await typesOf(board.map((c) => c.scryfallId));
    return board.filter(
      (c) => c.power != null || (typeCache.get(c.scryfallId) ?? '').includes('Creature'),
    );
  };

  const mine = () => me.lastState().players.find((p) => p.userId === me.userId);
  const bot = () => me.lastState().players.find((p) => p.isBot);
  const prompts = () => me.lastState().pendingTriggers ?? [];
  const clearPrompts = async () => {
    for (const p of prompts()) me.act({ kind: 'trigger.answer', id: p.id, apply: p.auto });
    await me.expectState((s) => (s.pendingTriggers ?? []).length === 0, 'prompts cleared', 10_000);
  };

  for (const c of [...mine().hand]) me.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
  await me.expectState(
    (s) => s.players.find((p) => p.userId === me.userId)?.handCount === 0,
    'opening hand bottomed',
    8000,
  );
  const used = new Set();
  const fetchTo = async (name, zone, x = 0.3, y = 0.6) => {
    // Search fresh each time: a snapshot taken once goes stale the moment
    // anything draws, and this scenario passes a lot of turns.
    const mark = me.mark();
    me.act({ kind: 'library.search' });
    const libMsg = await me.waitFor((m) => m.type === 'library.cards', {
      since: mark,
      timeoutMs: 6000,
    });
    const card = (libMsg?.cards ?? []).find((c) => c.name === name && !used.has(c.iid));
    t.ok(card, `${name} found in the library`, '');
    if (!card) return null;
    used.add(card.iid);
    me.act({ kind: 'card.move', iid: card.iid, to: zone, x, y });
    await me.expectState(
      (s) => s.players.find((p) => p.userId === me.userId)[zone].some((c) => c.iid === card.iid),
      `${name} -> ${zone}`,
      6000,
    );
    return card.iid;
  };

  // ---- My side of the board goes down first, while everything is still
  // where this scenario put it.
  await fetchTo(CARDS.pact.name, 'battlefield', 0.25, 0.5);
  await clearPrompts();
  const bears = [];
  bears.push(await fetchTo(CARDS.bear.name, 'battlefield', 0.45, 0.6));
  await clearPrompts();
  bears.push(await fetchTo(CARDS.bear.name, 'battlefield', 0.62, 0.6));
  await clearPrompts();
  const wrathIid = await fetchTo(CARDS.damnation.name, 'hand');
  // Damnation costs {2}{B}{B}: an enforced table refuses a spell that has not
  // been paid for, so the mana has to be on the table first.
  for (let i = 0; i < 4; i += 1) {
    await fetchTo('Swamp', 'battlefield', 0.12 + i * 0.09, 0.85);
  }

  // ---- Give the bot a board to lose. Nothing in this test depends on WHICH
  // creatures it has, only that it has some.
  const botCreatures = async () => creaturesOn(bot());
  const myTurn = () => me.lastState().activeSeat === mine().seat;
  const deadline = Date.now() + 150_000;
  while ((await botCreatures()).length < 1 && Date.now() < deadline) {
    await clearPrompts().catch(() => {});
    if (myTurn()) me.act({ kind: 'turn.pass' });
    await sleep(2500);
  }
  const developed = await botCreatures();
  t.ok(developed.length >= 1, 'the bot developed a board to lose', `${developed.length}`);

  // Get the turn back before casting anything.
  const deadline2 = Date.now() + 60_000;
  while (!myTurn() && Date.now() < deadline2) {
    await clearPrompts().catch(() => {});
    await sleep(1000);
  }
  await clearPrompts().catch(() => {});

  // ---- Grave Pact: one of my creatures dying costs the bot one of its own.
  const myBoard = () => mine().battlefield ?? [];
  const bearIid = bears.find((iid) => myBoard().some((c) => c.iid === iid));
  t.ok(bearIid, 'a Grizzly Bears of mine survived to be sacrificed', '');
  const botBefore = (await botCreatures()).length;
  const sacMark = me.mark();
  me.act({ kind: 'card.move', iid: bearIid, to: 'graveyard' });
  const fired = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === CARDS.pact.name),
    'my creature dying fires Grave Pact',
    8000,
  );
  const pactPrompt = fired.pendingTriggers.find((p) => p.sourceName === CARDS.pact.name);
  t.eq(pactPrompt.when, 'creatureDies', 'Grave Pact watches creatures die');
  t.ok(pactPrompt.auto, 'the edict is something the engine can carry out');
  me.act({ kind: 'trigger.answer', id: pactPrompt.id, apply: true });
  // The engine names the sacrifice in the log; that is the unambiguous
  // signal, and the board count corroborates it.
  await me.expectLog(
    /sacrifices .+ \(Grave Pact\)/,
    'the bot sacrificed a creature to the edict',
    { since: sacMark, timeoutMs: 12_000 },
  );
  await sleep(600);
  const botAfter = (await botCreatures()).length;
  t.eq(botAfter, botBefore - 1, "the bot's board is one creature smaller");

  // ---- Damnation: everything dies, mine included.
  await clearPrompts().catch(() => {});
  const beforeWrath = {
    mine: (await creaturesOn(mine())).length,
    bot: (await botCreatures()).length,
  };
  t.ok(beforeWrath.mine >= 1, 'I have a creature for the wrath to take', `${beforeWrath.mine}`);
  const wrathMark = me.mark();
  // A sorcery needs my main phase, my turn and an empty stack; the loop above
  // left the table wherever the bot's last turn ended.
  me.act({ kind: 'phase.set', phase: 'main1' });
  await sleep(400);
  // `cast` with no payment lets the engine auto-tap, exactly as the client's
  // cast button does.
  me.act({ kind: 'cast', iid: wrathIid });
  await sleep(900);
  const castErr = me.messages.slice(wrathMark).find((m) => m.type === 'error');
  t.ok(!castErr, 'the wrath was castable', castErr ? `${castErr.code}: ${castErr.message}` : '');
  // Enforced tables hold a spell on the stack until every other seat has
  // passed priority; the bot does that on its own tick, so resolving is a
  // retry rather than a single shot.
  //
  // Resolve first, THEN check: a stack entry arrives with its card masked in
  // the snapshot, so "is my spell still on the stack" cannot be asked by iid.
  // The graveyard is the unambiguous answer.
  const resolveBy = Date.now() + 20_000;
  const inGraveyard = () => (mine().graveyard ?? []).some((c) => c.iid === wrathIid);
  while (Date.now() < resolveBy && !inGraveyard()) {
    me.act({ kind: 'stack.resolve', iid: wrathIid, to: 'graveyard' });
    await sleep(1200);
  }
  t.ok(inGraveyard(), 'the wrath resolved', '');
  await me.expectLog(
    /destroys every creature/,
    'the wrath resolved as a wrath',
    { since: wrathMark, timeoutMs: 10_000 },
  );
  await sleep(800);
  t.eq((await creaturesOn(mine())).length, 0, 'the wrath took my creatures');
  t.eq((await botCreatures()).length, 0, "and the bot's - a wrath is symmetric");

  await deleteRoom(me, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('edict-wrath crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'edict-wrath', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
