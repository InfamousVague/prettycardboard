// Scenario: bots on the receiving end of engine-applied spell effects
// (rules pass D). A human casts recognized discard spells at a bot on an
// enforced table and the bot pays instantly - no prompt, no stall, cards
// named in the log:
//   - Unnerve's parsed intent on resolution ("Each opponent discards two"),
//   - Burglar Rat's each-opponent-discards ETB trigger,
//   - Hymn to Tourach's at-random discard.
// Throughout, the bot passes priority so the human can resolve, and the
// scenario asserts zero "[rules]" rejections - a bot action the validator
// bounces is an engine bug.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

const CARDS = {
  unnerve: { id: '915c3d41-8de6-4289-b1dd-b8fac248df08', name: 'Unnerve' },
  hymn: { id: '3faa8c5e-9e1b-4cee-b322-a033bf33dcbc', name: 'Hymn to Tourach' },
  rat: { id: 'de1c8758-ce3d-49cf-8173-c0eb46f5e7bc', name: 'Burglar Rat' },
  swamp: { id: '4031e5e4-e573-4130-8d20-4a606edef0a0', name: 'Swamp' },
};

async function main() {
  const t = new Assert('bot-spells');
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await me.ensureUser();

  const payload = {
    name: 'PT Bot Discard Lab',
    format: 'standard',
    cards: [
      ...[CARDS.unnerve, CARDS.hymn, CARDS.rat]
        .map((c) => ({ scryfallId: c.id, name: c.name, quantity: 1, board: 'main' })),
      { scryfallId: CARDS.swamp.id, name: 'Swamp', quantity: 57, board: 'main' },
    ],
  };
  const list = await me.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === payload.name);
  const deckRes = existing
    ? await me.api('PUT', `/api/decks/${existing.id}`, payload)
    : await me.api('POST', '/api/decks', payload);
  const deckId = existing ? existing.id : deckRes.json.id;
  t.ok([200, 201].includes(deckRes.status), 'bot-discard deck uploaded', `status ${deckRes.status}`);

  await me.connect();
  me.send({ type: 'room.leave' });
  await sleep(300);
  const mk = await me.api('POST', '/api/rooms', {
    name: 'Bot discard lab', seats: 2, persistent: false, format: 'standard',
  });
  const roomId = mk.json.roomId;
  me.joinRoom(roomId, deckId);
  await me.expectState((s) => s.players.length === 1, 'seated', 5000);
  const st = me.lastState().settings ?? {};
  me.send({ type: 'room.settings', settings: { ...st, enforced: true } });
  await me.expectState((s) => s.settings?.enforced === true, 'enforced on', 5000);
  me.send({ type: 'bot.add', style: 'casual', difficulty: 'normal' });
  await me.expectState((s) => s.players.length === 2 && s.players[1].isBot, 'bot seated', 6000);
  me.setReady(true);
  await sleep(4000); // oracle prefetch
  me.send({ type: 'room.start' });
  await me.expectState((s) => s.started, 'started', 8000);
  me.act({ kind: 'mull.keep', bottomIids: [] });
  await me.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    'both hands kept (the bot keeps on its own)',
    15000,
  );

  const myself = () => me.me(me.lastState());
  const bot = () => me.lastState().players.find((p) => p.isBot);
  const botSeat = bot().seat;

  // ---- Setup: bottom the hand, fetch the three spells and mana.
  for (const c of [...myself().hand]) {
    me.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
  }
  await me.expectState((s) => me.me(s).handCount === 0, 'hand bottomed', 6000);
  me.act({ kind: 'library.search' });
  const libMsg = await me.waitFor((m) => m.type === 'library.cards', { timeoutMs: 5000 });
  t.ok(libMsg, 'library search returned cards', '');
  const used = new Set();
  const fetchTo = async (name, zone, x = 0.3, y = 0.6) => {
    const card = libMsg.cards.find((c) => c.name === name && !used.has(c.iid));
    used.add(card.iid);
    me.act({ kind: 'card.move', iid: card.iid, to: zone, x, y });
    await me.expectState(
      (s) => me.me(s)[zone].some((c) => c.iid === card.iid),
      `${name} fetched to ${zone}`,
      5000,
    );
    return card.iid;
  };
  await fetchTo('Unnerve', 'hand');
  await fetchTo('Hymn to Tourach', 'hand');
  await fetchTo('Burglar Rat', 'hand');
  for (let i = 0; i < 6; i++) await fetchTo('Swamp', 'battlefield', 0.06 + i * 0.06, 0.8);

  const inHand = (name) => myself().hand.find((c) => c.name === name);
  const castAndResolve = async (name, to, x, y) => {
    const mark = me.mark();
    me.act({ kind: 'cast', iid: inHand(name).iid, x: 0.5, y: 0.5 });
    const st = await me.expectState(
      (s) => (s.stack ?? []).some((c) => c.name === name),
      `${name} on the stack`,
      6000,
      { since: mark },
    );
    // The bot passes priority within a tick or two.
    await me.expectState(
      (s) => (s.stackPassed ?? []).includes(botSeat),
      `bot passed priority on ${name}`,
      8000,
      { since: mark },
    );
    me.act({ kind: 'stack.resolve', iid: st.stack.find((c) => c.name === name).iid, to, x, y });
    return mark;
  };

  // ---- 1) Unnerve: the bot pays two cards the moment it resolves - no
  // prompt, no waiting, both cards named.
  let botHand = bot().handCount;
  let mark = await castAndResolve('Unnerve', 'graveyard');
  await me.expectState(
    (s) => s.players.find((p) => p.isBot).handCount === botHand - 2,
    'bot discarded two instantly',
    6000,
    { since: mark },
  );
  t.eq((me.lastState().pendingDiscards ?? []).length, 0, 'no prompt lingers for a bot');
  await me.expectLog(/discards 2 cards \(.+\) to Unnerve/, 'bot discards named in the log', {
    since: mark, timeoutMs: 5000,
  });
  botHand -= 2;

  // ---- 2) Burglar Rat: the ETB trigger's each-opponent-discards also
  // lands on the bot without a prompt.
  mark = me.mark();
  me.act({ kind: 'cast', iid: inHand('Burglar Rat').iid, x: 0.6, y: 0.55 });
  await me.expectState(
    (s) => me.me(s).battlefield.some((c) => c.name === 'Burglar Rat'),
    'Rat cast to the battlefield',
    6000,
    { since: mark },
  );
  const trig = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === 'Burglar Rat'),
    'Rat ETB trigger fired',
    6000,
  );
  me.act({
    kind: 'trigger.answer',
    id: trig.pendingTriggers.find((p) => p.sourceName === 'Burglar Rat').id,
    apply: true,
  });
  await me.expectState(
    (s) => s.players.find((p) => p.isBot).handCount === botHand - 1,
    'bot paid the Rat trigger instantly',
    6000,
    { since: mark },
  );
  await me.expectLog(/discards .+ to Burglar Rat/, 'trigger discard narrated', {
    since: mark, timeoutMs: 5000,
  });
  botHand -= 1;

  // ---- 3) Fresh mana, then Hymn to Tourach: at random, named.
  const turnMark = me.mark();
  me.act({ kind: 'turn.pass' });
  await me.expectState((s) => s.activeSeat === botSeat, "bot's turn", 8000, { since: turnMark });
  // The bot plays out its turn and hands it back on its own. Pass priority
  // on its spells as a polite human would, so nothing waits out the 30s
  // response window. The loop is DEADLINED - a stalled bot must fail the
  // scenario, never hang the suite.
  const turnDeadline = Date.now() + 90000;
  const turnBack = (async () => {
    while (Date.now() < turnDeadline) {
      const s = me.lastState();
      if (s.activeSeat !== botSeat) return;
      const mySeat = me.me(s).seat;
      const windowOpen = (s.stack ?? []).length > 0 || s.endWindow != null;
      if (windowOpen && !(s.stackPassed ?? []).includes(mySeat)) {
        me.act({ kind: 'stack.pass' });
      }
      await sleep(500);
    }
  })();
  // Keyed on the TURN NUMBER (rounds bump when rotation wraps to seat 0):
  // cursoring alone is not enough, since frames between the mark and the
  // bot's turn still show the human as active on round 1.
  await me.expectState(
    (s) => s.turnNumber === 2 && s.activeSeat === me.me(s).seat,
    'bot passed the turn back',
    90000,
    { since: turnMark },
  );
  await turnBack;
  botHand = bot().handCount; // the bot drew and may have played cards
  mark = await castAndResolve('Hymn to Tourach', 'graveyard');
  await me.expectState(
    (s) => s.players.find((p) => p.isBot).handCount === Math.max(botHand - 2, 0),
    'bot discarded two at random',
    6000,
    { since: mark },
  );
  await me.expectLog(/discards .+ at random to Hymn to Tourach/, 'random discard narrated', {
    since: mark, timeoutMs: 5000,
  });

  // ---- Health: the whole exchange produced zero rejected bot actions.
  const illegal = me.messages.filter(
    (m) => m.type === 'log' && /\[rules\]/.test(m.text ?? ''),
  );
  t.eq(illegal.length, 0, 'zero illegal-state ([rules]) log lines');
  if (illegal.length) for (const m of illegal.slice(0, 5)) console.log(`  ${m.text}`);

  me.send({ type: 'room.leave' });
  await deleteRoom(me, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('bot-spells crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'bot-spells', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
