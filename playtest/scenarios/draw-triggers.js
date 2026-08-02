// Scenario: "whenever a player draws a card" triggers, both ways a table can
// run them.
//
// The oracle knew ETB, dies, attacks, upkeep, end step and combat damage - but
// not draws. So Sheoldred, the Apocalypse sat on the battlefield doing nothing
// at all: the opponent drew for turn and took no damage, and her controller
// drew and gained nothing. Two paths have to work now:
//
//   ENFORCED - the engine fires a real trigger, and the CONTROLLER answers it.
//   The life comes off the player who drew, which is not the same player.
//
//   FREEFORM - no engine triggers by design, so a bot pays its own draw tax
//   the same way it settles its own combat damage.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

// Confirmed Scryfall oracle text (2026-08-01):
//   Sheoldred, the Apocalypse {2}{B}{B}
//     "Deathtouch
//      Whenever you draw a card, you gain 2 life.
//      Whenever an opponent draws a card, they lose 2 life."
const SHEOLDRED = { id: 'd67be074-cdd4-41d9-ac89-0a0456c4e4b2', name: 'Sheoldred, the Apocalypse' };
const SWAMP = { id: 'f66094ef-059b-4511-aa6e-835906736de4', name: 'Swamp' };

async function uploadDeck(client, t) {
  const payload = {
    name: 'PT Draw Lab',
    format: 'standard',
    cards: [
      { scryfallId: SHEOLDRED.id, name: SHEOLDRED.name, quantity: 1, board: 'main' },
      { scryfallId: SWAMP.id, name: 'Swamp', quantity: 59, board: 'main' },
    ],
  };
  const list = await client.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === payload.name);
  const res = existing
    ? await client.api('PUT', `/api/decks/${existing.id}`, payload)
    : await client.api('POST', '/api/decks', payload);
  t.ok([200, 201].includes(res.status), 'draw-lab deck uploaded', `status ${res.status}`);
  return existing ? existing.id : res.json.id;
}

/** Fetch Sheoldred out of the library onto the battlefield.
 *
 *  The opening hand goes to the bottom first: one Sheoldred in sixty cards
 *  opens in hand often enough that a library-only search is a coin flip, and
 *  this scenario failed exactly that way inside the full suite. */
async function landSheoldred(client, t, label) {
  const seat = () => client.lastState().players.find((p) => p.userId === client.userId);
  for (const c of [...(seat().hand ?? [])]) {
    client.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
  }
  await client.expectState(
    (s) => s.players.find((p) => p.userId === client.userId)?.handCount === 0,
    `${label}: opening hand bottomed`,
    8000,
  );
  const mark = client.mark();
  client.act({ kind: 'library.search' });
  const lib = await client.waitFor((m) => m.type === 'library.cards', { since: mark, timeoutMs: 6000 });
  const card = lib.cards.find((c) => c.name === SHEOLDRED.name);
  t.ok(card, `${label}: Sheoldred is in the library`, '');
  client.act({ kind: 'card.move', iid: card.iid, to: 'battlefield', x: 0.4, y: 0.6 });
  await client.expectState(
    (s) => s.players.some((p) => p.battlefield.some((c) => c.iid === card.iid)),
    `${label}: Sheoldred on the battlefield`,
    6000,
  );
  return card.iid;
}

async function main() {
  const t = new Assert('draw-triggers');
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await me.ensureUser();
  const deckId = await uploadDeck(me, t);
  await me.connect();

  // ---------------------------------------------------------------- enforced
  me.send({ type: 'room.leave' });
  await sleep(300);
  let mk = await me.api('POST', '/api/rooms', {
    name: 'Draw lab', seats: 2, persistent: false, format: 'standard',
  });
  const enforcedRoom = mk.json.roomId;
  me.joinRoom(enforcedRoom, deckId);
  await me.expectState((s) => s.players.length === 1, 'seated', 5000);
  const settings = me.lastState().settings ?? {};
  me.send({ type: 'room.settings', settings: { ...settings, enforced: true } });
  await me.expectState((s) => s.settings?.enforced === true, 'enforced on', 5000);
  // A bot opponent: the point of the exercise is that ITS draw costs IT life,
  // decided by a permanent it does not control.
  me.send({ type: 'bot.add', style: 'casual' });
  await me.expectState((s) => s.players.filter((p) => p.isBot).length === 1, 'bot seated', 10_000);
  me.setReady(true);
  await sleep(4000); // oracle prefetch: one small deck plus the bot's
  me.send({ type: 'room.start' });
  await me.expectState((s) => s.started, 'started', 6000);
  me.act({ kind: 'mull.keep', bottomIids: [] });
  await me.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    'hands kept',
    20_000,
  );

  const mine = () => me.lastState().players.find((p) => p.userId === me.userId);
  const bot = () => me.lastState().players.find((p) => p.isBot);
  const prompts = () => me.lastState().pendingTriggers ?? [];

  await landSheoldred(me, t, 'enforced');

  // ---- My own draw: "whenever you draw a card, you gain 2 life".
  const lifeBefore = mine().life;
  let mark = me.mark();
  me.act({ kind: 'draw', count: 1 });
  const own = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === SHEOLDRED.name),
    'drawing fires Sheoldred',
    6000,
    { since: mark },
  );
  const ownPrompt = own.pendingTriggers.find((p) => p.sourceName === SHEOLDRED.name);
  t.eq(ownPrompt.when, 'youDraw', 'it is the you-draw trigger');
  t.ok(ownPrompt.auto, 'the engine can apply it on its own');
  me.act({ kind: 'trigger.answer', id: ownPrompt.id, apply: true });
  await me.expectState((s) => s.players.find((p) => p.userId === me.userId).life === lifeBefore + 2,
    'I gained 2 life for my draw', 6000);

  // ---- Three at once: a draw trigger fires PER CARD, not per draw action.
  const lifeBefore3 = mine().life;
  mark = me.mark();
  me.act({ kind: 'draw', count: 3 });
  const three = await me.expectState(
    (s) => (s.pendingTriggers ?? []).filter((p) => p.sourceName === SHEOLDRED.name).length === 3,
    'drawing three cards fires three triggers',
    6000,
    { since: mark },
  );
  for (const p of three.pendingTriggers.filter((p) => p.sourceName === SHEOLDRED.name)) {
    me.act({ kind: 'trigger.answer', id: p.id, apply: true });
  }
  await me.expectState(
    (s) => s.players.find((p) => p.userId === me.userId)?.life === lifeBefore3 + 6,
    'three draws gained six life',
    8000,
  );

  // ---- The BOT's draw: my permanent, its life total. Passing the turn to it
  // runs its draw step under enforcement.
  const botLifeBefore = bot().life;
  mark = me.mark();
  me.act({ kind: 'turn.pass' });
  const oppPrompt = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.when === 'opponentDraws'),
    "the bot's draw fires my Sheoldred",
    10_000,
    { since: mark },
  );
  const opp = oppPrompt.pendingTriggers.find((p) => p.when === 'opponentDraws');
  t.eq(opp.owner, me.userId, 'the trigger belongs to Sheoldred\'s controller, not the drawer');
  me.act({ kind: 'trigger.answer', id: opp.id, apply: true });
  await me.expectState(
    (s) => s.players.find((p) => p.isBot)?.life === botLifeBefore - 2,
    'the BOT lost 2 life for its own draw',
    8000,
  );
  t.eq(mine().life, lifeBefore3 + 6, 'and my life did not move - "they" is the drawer');

  await deleteRoom(me, enforcedRoom).catch(() => null);

  // ---------------------------------------------------------------- freeform
  // No engine triggers here by design. The bot has to notice the tax itself,
  // exactly as it settles its own combat damage.
  me.send({ type: 'room.leave' });
  await sleep(400);
  mk = await me.api('POST', '/api/rooms', {
    name: 'Draw lab freeform', seats: 2, persistent: false, format: 'standard',
  });
  const freeRoom = mk.json.roomId;
  me.joinRoom(freeRoom, deckId);
  await me.expectState((s) => s.players.length === 1, 'seated (freeform)', 5000);
  me.send({ type: 'bot.add', style: 'casual' });
  await me.expectState((s) => s.players.filter((p) => p.isBot).length === 1, 'bot seated (freeform)', 10_000);
  me.setReady(true);
  await sleep(4000);
  me.send({ type: 'room.start' });
  await me.expectState((s) => s.started, 'started (freeform)', 6000);
  me.act({ kind: 'mull.keep', bottomIids: [] });
  await me.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    'hands kept (freeform)',
    20_000,
  );
  t.eq((me.lastState().pendingTriggers ?? []).length, 0, 'a freeform table queues no triggers');

  await landSheoldred(me, t, 'freeform');
  const freeBotLife = me.lastState().players.find((p) => p.isBot).life;
  me.act({ kind: 'turn.pass' });
  // The bot draws on its turn and charges itself. Its own scheduler tick does
  // the work, so this is a wait rather than an answer.
  await me.expectState(
    (s) => (s.players.find((p) => p.isBot)?.life ?? 99) <= freeBotLife - 2,
    'the bot charged ITSELF for drawing under freeform rules',
    25_000,
  );

  await deleteRoom(me, freeRoom).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('draw-triggers crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'draw-triggers', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
