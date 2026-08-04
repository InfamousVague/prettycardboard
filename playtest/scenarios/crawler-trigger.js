// Scenario: "that player loses 1 life" is the same trigger as "they lose 2
// life", and has to reach a bot's life total the same way.
//
// Confirmed Scryfall oracle text (2026-08-04):
//   Scrawling Crawler {4}
//     "At the beginning of your upkeep, each player draws a card.
//      Whenever an opponent draws a card, that player loses 1 life."
//
// Sheoldred says "they lose 2 life" and worked. This says "that player loses 1
// life" and did not: parse_effect_part stripped "you " and "they " but not
// "that player ", and matched the verb "lose" but not "loses". So the TRIGGER
// half parsed - the prompt appeared, the card looked wired up - while its
// effect fell to Manual. Neither the engine (enforced) nor the bot's own
// draw-tax shortcut (freeform) will perform a Manual effect, so the opponent
// drew and took nothing, in either mode.
//
// Both modes are checked here because they reach the bot's life by completely
// different routes: enforced fires a real trigger the controller answers,
// freeform has the bot charge itself on its next tick.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

const CRAWLER = { id: 'a1176dcf-40ee-4342-aa74-791b8352e99a', name: 'Scrawling Crawler' };
const PLAINS = { id: '7b7c408b-8660-4db5-9a16-5003c11b4ac1', name: 'Plains' };

async function uploadDeck(client, t) {
  const payload = {
    name: 'PT Crawler Lab',
    format: 'standard',
    cards: [
      { scryfallId: CRAWLER.id, name: CRAWLER.name, quantity: 1, board: 'main' },
      { scryfallId: PLAINS.id, name: 'Plains', quantity: 59, board: 'main' },
    ],
  };
  const list = await client.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === payload.name);
  const res = existing
    ? await client.api('PUT', `/api/decks/${existing.id}`, payload)
    : await client.api('POST', '/api/decks', payload);
  t.ok([200, 201].includes(res.status), 'crawler-lab deck uploaded', `status ${res.status}`);
  return existing ? existing.id : res.json.id;
}

/** Bottom the opening hand, then fetch the Crawler out of the library. One
 *  copy in sixty opens in hand often enough that a library-only search would
 *  be a coin flip. */
async function landCrawler(client, t, label) {
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
  const card = lib.cards.find((c) => c.name === CRAWLER.name);
  t.ok(card, `${label}: the Crawler is in the library`, '');
  client.act({ kind: 'card.move', iid: card.iid, to: 'battlefield', x: 0.4, y: 0.6 });
  await client.expectState(
    (s) => s.players.some((p) => p.battlefield.some((c) => c.iid === card.iid)),
    `${label}: the Crawler is on the battlefield`,
    6000,
  );
  return card.iid;
}

async function seatWithBot(me, t, label, enforced) {
  me.send({ type: 'room.leave' });
  await sleep(300);
  const mk = await me.api('POST', '/api/rooms', {
    name: `Crawler lab (${label})`, seats: 2, persistent: false, format: 'standard',
  });
  const roomId = mk.json.roomId;
  me.joinRoom(roomId, me.deckId);
  await me.expectState((s) => s.players.length === 1, `${label}: seated`, 5000);
  if (enforced) {
    const settings = me.lastState().settings ?? {};
    me.send({ type: 'room.settings', settings: { ...settings, enforced: true } });
    await me.expectState((s) => s.settings?.enforced === true, `${label}: enforced on`, 5000);
  }
  me.send({ type: 'bot.add', style: 'casual' });
  await me.expectState((s) => s.players.filter((p) => p.isBot).length === 1, `${label}: bot seated`, 10_000);
  me.setReady(true);
  await me.expectState((s) => s.players.every((p) => p.ready), `${label}: ready`, 6000);
  me.send({ type: 'room.start' });
  await me.expectState((s) => s.started, `${label}: started`, 6000);
  me.act({ kind: 'mull.keep', bottomIids: [] });
  await me.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    `${label}: hands kept`,
    20_000,
  );
  return roomId;
}

async function main() {
  const t = new Assert('crawler-trigger');
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await me.ensureUser();
  me.deckId = await uploadDeck(me, t);
  await me.connect();

  // ---------------------------------------------------------------- enforced
  const enforcedRoom = await seatWithBot(me, t, 'enforced', true);
  await landCrawler(me, t, 'enforced');
  const bot = () => me.lastState().players.find((p) => p.isBot);
  const botLifeBefore = bot().life;

  let mark = me.mark();
  me.act({ kind: 'turn.pass' });
  const fired = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.when === 'opponentDraws'),
    "the bot's draw fires the Crawler",
    12_000,
    { since: mark },
  );
  const opp = fired.pendingTriggers.find((p) => p.when === 'opponentDraws');
  // The bug lived here: the trigger fired, but carried nothing the engine
  // could perform, so answering it changed no life total.
  t.ok(opp.auto, 'the engine can perform it (it parsed to a real effect)', JSON.stringify(opp.effects ?? null));
  me.act({ kind: 'trigger.answer', id: opp.id, apply: true });
  await me.expectState(
    (s) => s.players.find((p) => p.isBot)?.life === botLifeBefore - 1,
    'the BOT lost 1 life for its own draw',
    8000,
  );
  await deleteRoom(me, enforcedRoom).catch(() => null);

  // ---------------------------------------------------------------- freeform
  // No engine triggers here; the bot notices the tax itself on its next tick.
  const freeRoom = await seatWithBot(me, t, 'freeform', false);
  await landCrawler(me, t, 'freeform');
  const freeBotLife = bot().life;
  me.act({ kind: 'turn.pass' });
  await me.expectState(
    (s) => (s.players.find((p) => p.isBot)?.life ?? 99) <= freeBotLife - 1,
    'the bot charged ITSELF for drawing under freeform rules',
    25_000,
  );
  await deleteRoom(me, freeRoom).catch(() => null);

  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('crawler-trigger crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'crawler-trigger', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
