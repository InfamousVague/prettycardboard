// Scenario: trigger REMINDERS on a freeform table.
//
// A freeform table is still a table where people forget their triggers.
// Chrome Mox entering and saying "Imprint — you may exile a nonartifact,
// nonland card from your hand" is worth showing whether or not an engine is
// going to do it for you. Prompts used to exist only under enforcement, so
// the commonest way to play got no help at all.
//
// The line this draws: reminders fire everywhere, but a freeform prompt is
// ACKNOWLEDGE-ONLY. The engine never performs the effect, because the
// freeform contract is that the server records and never judges.
//
//   1. A freeform table queues a prompt when a permanent enters.
//   2. Every freeform prompt is manual, even for text the engine could do.
//   3. Answering one changes nothing on the board - it is a reminder.
//   4. The same table under enforcement DOES apply it.
//   5. Bots get no reminders (nothing reads them, and they would just lapse).
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

// Verbatim Scryfall (2026-08-01):
//   Radiant Fountain  Land  "When this land enters, you gain 2 life."
//   Elvish Visionary  {1}{G} "When this creature enters, draw a card."
const CARDS = {
  fountain: { id: '7ee5e77f-ca43-480d-ac37-48336d3bf044', name: 'Radiant Fountain' },
  visionary: { id: 'a2f174e6-9532-4fc3-815b-2dc3966c6523', name: 'Elvish Visionary' },
  forest: { id: 'be72862d-d71e-4b18-98a6-59019399f631', name: 'Forest' },
};

async function uploadDeck(client, t) {
  const payload = {
    name: 'PT Reminder Lab',
    format: 'standard',
    cards: [
      { scryfallId: CARDS.fountain.id, name: CARDS.fountain.name, quantity: 4, board: 'main' },
      { scryfallId: CARDS.visionary.id, name: CARDS.visionary.name, quantity: 4, board: 'main' },
      { scryfallId: CARDS.forest.id, name: 'Forest', quantity: 52, board: 'main' },
    ],
  };
  const list = await client.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === payload.name);
  const res = existing
    ? await client.api('PUT', `/api/decks/${existing.id}`, payload)
    : await client.api('POST', '/api/decks', payload);
  t.ok([200, 201].includes(res.status), 'reminder-lab deck uploaded', `status ${res.status}`);
  return existing ? existing.id : res.json.id;
}

/** Seat one player (plus a bot) and start, at the given enforcement. */
async function table(client, t, deckId, { enforced, label }) {
  client.send({ type: 'room.leave' });
  await sleep(300);
  const mk = await client.api('POST', '/api/rooms', {
    name: `Reminders ${label}`, seats: 2, persistent: false, format: 'standard',
  });
  client.joinRoom(mk.json.roomId, deckId);
  await client.expectState((s) => s.players.length === 1, `${label}: seated`, 8000);
  const settings = client.lastState().settings ?? {};
  client.send({ type: 'room.settings', settings: { ...settings, enforced } });
  await client.expectState(
    (s) => Boolean(s.settings?.enforced) === enforced,
    `${label}: enforcement ${enforced ? 'on' : 'off'}`,
    8000,
  );
  client.send({ type: 'bot.add', style: 'casual' });
  await client.expectState(
    (s) => s.players.filter((p) => p.isBot).length === 1,
    `${label}: bot seated`,
    12_000,
  );
  client.setReady(true);
  await sleep(4500); // oracle prefetch
  client.send({ type: 'room.start' });
  await client.expectState((s) => s.started, `${label}: started`, 10_000);
  client.act({ kind: 'mull.keep', bottomIids: [] });
  await client.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    `${label}: hands kept`,
    25_000,
  );
  return mk.json.roomId;
}

async function main() {
  const t = new Assert('freeform-reminders');
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await me.ensureUser();
  const deckId = await uploadDeck(me, t);
  await me.connect();

  const mine = () => me.lastState().players.find((p) => p.userId === me.userId);
  const prompts = () => me.lastState().pendingTriggers ?? [];
  const fetchTo = async (name, zone, x, y) => {
    const mark = me.mark();
    me.act({ kind: 'library.search' });
    const lib = await me.waitFor((m) => m.type === 'library.cards', { since: mark, timeoutMs: 8000 });
    const card = (lib?.cards ?? []).find((c) => c.name === name);
    t.ok(card, `${name} found`, '');
    if (!card) return null;
    me.act({ kind: 'card.move', iid: card.iid, to: zone, ...(x != null ? { x, y } : {}) });
    await me.expectState(
      (s) => s.players.find((p) => p.userId === me.userId)[zone].some((c) => c.iid === card.iid),
      `${name} -> ${zone}`,
      8000,
    );
    return card.iid;
  };

  // ------------------------------------------------------------- freeform
  const freeRoom = await table(me, t, deckId, { enforced: false, label: 'freeform' });
  for (const c of [...mine().hand]) me.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
  await me.expectState(
    (s) => s.players.find((p) => p.userId === me.userId)?.handCount === 0,
    'freeform: hand bottomed',
    10_000,
  );

  const lifeBefore = mine().life;
  const mark = me.mark();
  await fetchTo(CARDS.fountain.name, 'battlefield', 0.35, 0.6);
  // ---- 1) A permanent entering prompts even with no engine running.
  const fired = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === CARDS.fountain.name),
    'a freeform table reminds me my trigger fired',
    10_000,
    { since: mark },
  );
  const prompt = (fired?.pendingTriggers ?? []).find((p) => p.sourceName === CARDS.fountain.name);
  t.eq(prompt?.when, 'etb', 'the reminder names the event');
  t.ok(
    (prompt?.text ?? '').toLowerCase().includes('gain 2 life'),
    'and carries the card text, which is the whole point',
    prompt?.text,
  );
  // ---- 2) It is a reminder, not an instruction.
  t.ok(!prompt?.auto, 'a freeform prompt is acknowledge-only');

  // ---- 3) Acknowledging changes nothing on the board.
  me.act({ kind: 'trigger.answer', id: prompt.id, apply: true });
  await me.expectState(
    (s) => (s.pendingTriggers ?? []).every((p) => p.id !== prompt.id),
    'the reminder clears when acknowledged',
    8000,
  );
  await sleep(500);
  t.eq(mine().life, lifeBefore, 'and my life did not move - the engine did not play for me');

  // ---- 5) The bot gets none: nothing reads them, and they would only lapse.
  await sleep(1500);
  t.ok(
    prompts().every((p) => p.owner === me.userId),
    'no reminder is queued for a bot',
    JSON.stringify(prompts().map((p) => p.owner)),
  );

  await deleteRoom(me, freeRoom).catch(() => null);

  // ------------------------------------------------------------- enforced
  const strictRoom = await table(me, t, deckId, { enforced: true, label: 'enforced' });
  for (const c of [...mine().hand]) me.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
  await me.expectState(
    (s) => s.players.find((p) => p.userId === me.userId)?.handCount === 0,
    'enforced: hand bottomed',
    10_000,
  );
  const strictLife = mine().life;
  const mark2 = me.mark();
  await fetchTo(CARDS.fountain.name, 'battlefield', 0.35, 0.6);
  const fired2 = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === CARDS.fountain.name),
    'the same card prompts under enforcement',
    10_000,
    { since: mark2 },
  );
  const prompt2 = (fired2?.pendingTriggers ?? []).find((p) => p.sourceName === CARDS.fountain.name);
  // ---- 4) Same card, same event - but here the engine can carry it out.
  t.ok(prompt2?.auto, 'an enforced prompt CAN be applied by the engine');
  me.act({ kind: 'trigger.answer', id: prompt2.id, apply: true });
  await me.expectState(
    (s) => s.players.find((p) => p.userId === me.userId)?.life === strictLife + 2,
    'and applying it actually gains the life',
    10_000,
  );

  await deleteRoom(me, strictRoom).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('freeform-reminders crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'freeform-reminders', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
