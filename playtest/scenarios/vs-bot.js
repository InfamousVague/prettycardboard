// Scenario 5: human vs server bot (Bots addendum v2.1). Proves: bot.add
// seating (persona, isBot, precon zones), host-only + pre-start guards and
// error codes, bot.remove, bot mulligan, autonomous turns (land drops, casts,
// combat, passing back within the failsafe), defending (blocks and/or
// self-applied damage), and card conservation for the bot seat throughout.
// Assertions stay state-based where log wording is the engine's business.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

const BOT_TURN_TIMEOUT = 45_000; // contract failsafe is 25s; allow slack

function botConservation(t, state, label) {
  const bot = state.players.find((p) => p.isBot);
  if (!bot) return;
  const stackOwned = (state.stack ?? []).filter((c) => c.owner === bot.userId).length;
  const total =
    bot.handCount + bot.libraryCount + bot.battlefield.length + bot.graveyard.length +
    bot.exile.length + bot.command.length + stackOwned;
  t.check(total === 100, `conservation: bot zones sum to 100 (${label})`, `got ${total}`);
}

async function main() {
  const t = new Assert('vs-bot');
  const names = ['pt_alice', 'pt_bob'];
  const seeded = await ensureSeed(names);
  const [host, rando] = names.map((n) => new PlaytestClient(n, { password: PASSWORD, assert: t }));
  for (const c of [host, rando]) {
    await c.ensureUser();
    await c.connect();
  }

  const roomRes = await host.api('POST', '/api/rooms', {
    name: 'pt vs bot',
    seats: 3,
    persistent: false,
    format: 'commander',
  });
  t.ok(roomRes.status === 201, 'room created (commander, 3 seats)', `status ${roomRes.status}`);
  const roomId = roomRes.json.roomId;

  let m = host.mark();
  host.joinRoom(roomId, seeded.pt_alice.deckId);
  await host.expectState((s) => s.players.length === 1, 'host seated', 5000, { since: m });

  // --- seating + guards -----------------------------------------------------
  m = host.mark();
  host.send({ type: 'bot.add', style: 'casual', deckCode: 'FIC-1' });
  let st = await host.expectState((s) => s.players.length === 2, 'bot seated', 8000, { since: m });
  const bot = st.players.find((p) => p.userId !== host.userId);
  t.ok(bot?.isBot === true, 'bot player flagged isBot', JSON.stringify(bot?.isBot));
  t.ok(/\(AI\)$/.test(bot?.username ?? ''), 'bot has an (AI) persona name', bot?.username);
  t.ok(bot?.userId.startsWith('bot:'), 'bot userId is bot:<id>', bot?.userId);
  t.ok(bot?.command.length === 1 && bot.command[0].isCommander, 'bot command zone: 1 flagged commander', '');
  t.ok(bot?.libraryCount === 99, 'bot library 99 (precon)', `${bot?.libraryCount}`);
  t.ok(typeof bot?.playmat === 'string' && bot.playmat.length > 0, 'bot brings its own playmat', String(bot?.playmat));
  t.ok(bot?.life === 40, 'bot at 40 life', `${bot?.life}`);

  m = host.mark();
  host.send({ type: 'bot.add', deckCode: 'nope' });
  let err = await host.waitFor((msg) => msg.type === 'error', { since: m, timeoutMs: 5000 }).catch(() => null);
  t.ok(err?.code === 'bad_deck', 'bad deckCode rejected with bad_deck', err?.code);

  // non-host (seated) cannot add bots
  m = rando.mark();
  rando.joinRoom(roomId, seeded.pt_bob.deckId);
  await rando.expectState((s) => s.players.length === 3, 'second human seated', 5000, { since: m });
  m = rando.mark();
  rando.send({ type: 'bot.add' });
  err = await rando.waitFor((msg) => msg.type === 'error', { since: m, timeoutMs: 5000 }).catch(() => null);
  t.ok(err?.code === 'forbidden', 'non-host bot.add rejected with forbidden', err?.code);
  // room is FULL (3/3): host add should say room_full
  m = host.mark();
  host.send({ type: 'bot.add' });
  err = await host.waitFor((msg) => msg.type === 'error', { since: m, timeoutMs: 5000 }).catch(() => null);
  t.ok(err?.code === 'room_full', 'bot.add into a full room rejected with room_full', err?.code);
  // second human leaves again; bot.remove works pre-start
  m = host.mark();
  rando.send({ type: 'room.leave' });
  await host.expectState((s) => s.players.length === 2, 'second human left', 5000, { since: m });
  m = host.mark();
  host.send({ type: 'bot.remove', seat: bot.seat });
  await host.expectState((s) => s.players.length === 1, 'bot.remove empties the seat', 5000, { since: m });
  m = host.mark();
  host.send({ type: 'bot.remove', seat: 0 });
  err = await host.waitFor((msg) => msg.type === 'error', { since: m, timeoutMs: 5000 }).catch(() => null);
  t.ok(err?.code === 'not_a_bot', 'bot.remove on a human seat rejected with not_a_bot', err?.code);

  // --- start: bot mulligans on its own -------------------------------------
  m = host.mark();
  host.send({ type: 'bot.add', style: 'casual' });
  st = await host.expectState((s) => s.players.length === 2, 'bot re-seated (random deck)', 8000, { since: m });
  const botSeat = st.players.find((p) => p.isBot).seat;

  m = host.mark();
  host.send({ type: 'room.start' });
  await host.expectState((s) => s.started, 'game started', 5000, { since: m });
  host.act({ kind: 'mull.keep', bottomIids: [] });
  st = await host.expectState(
    (s) => s.players.find((p) => p.isBot)?.mulligan?.state === 'kept',
    'bot resolves its mulligan by itself',
    30_000,
    { since: m },
  );
  const botAfterMull = st.players.find((p) => p.isBot);
  t.ok(botAfterMull.handCount >= 4 && botAfterMull.handCount <= 7, 'bot kept a sane hand size', `${botAfterMull.handCount}`);
  botConservation(t, st, 'after mulligan');

  // bots must not be seatable mid-game
  m = host.mark();
  host.send({ type: 'bot.add' });
  err = await host.waitFor((msg) => msg.type === 'error', { since: m, timeoutMs: 5000 }).catch(() => null);
  t.ok(err?.code === 'already_started', 'bot.add after start rejected with already_started', err?.code);

  // --- autonomous turns -----------------------------------------------------
  // The host passes instantly each turn; the bot must play and pass back.
  let sawCombat = false;
  let maxBotField = 0;
  for (let turn = 0; turn < 4; turn++) {
    m = host.mark();
    host.act({ kind: 'turn.pass' });
    await host.expectState((s) => s.activeSeat === botSeat, `bot turn ${turn + 1} begins`, 10_000, { since: m });
    st = await host.expectState(
      (s) => s.activeSeat !== botSeat,
      `bot turn ${turn + 1}: bot passes back on its own`,
      BOT_TURN_TIMEOUT,
      { since: m },
    );
    const b = st.players.find((p) => p.isBot);
    maxBotField = Math.max(maxBotField, b.battlefield.length);
    botConservation(t, st, `after bot turn ${turn + 1}`);
    const combatLog = host.messages.some(
      (msg) => msg.type === 'log' && /\(AI\).*(begins combat|attacks)/.test(msg.text ?? ''),
    );
    sawCombat = sawCombat || combatLog;
  }
  t.ok(maxBotField >= 3, 'bot developed its board (lands/spells over 4 turns)', `${maxBotField} cards`);
  if (!sawCombat) console.log('  note: bot declared no combat in 4 turns (legal; style and draws dependent)');
  t.ok(
    host.messages.some((msg) => msg.type === 'log' && /\(AI\)/.test(msg.text ?? '') && /puts|casts/.test(msg.text ?? '')),
    'bot cast or played cards (log evidence)',
    '',
  );

  // --- host attacks: the bot defends itself --------------------------------
  m = host.mark();
  host.act({ kind: 'token.create', name: 'Playtest Golem', power: '9', toughness: '9', x: 0.4, y: 0.5 });
  // token.create does not resync; the minted card rides the room.event payload
  const tokenEvent = await host.waitFor(
    (msg) => msg.type === 'room.event' && msg.action?.kind === 'token.create' && msg.action?.card?.name === 'Playtest Golem',
    { since: m, timeoutMs: 5000 },
  );
  t.ok(!!tokenEvent?.action?.card?.iid, 'attack token created (from room.event payload)', '');
  const golem = tokenEvent.action.card;
  const botLifeBefore = host.lastState().players.find((p) => p.isBot).life;

  host.act({ kind: 'combat.begin' });
  await sleep(400);
  host.act({ kind: 'combat.attack', iid: golem.iid });
  await sleep(3500); // give the bot ticks to declare blocks
  const preEnd = host.lastState();
  const botBlocked = (preEnd.combat?.blocks ?? []).some((b) => b.attackerIid === golem.iid);
  m = host.mark();
  host.act({ kind: 'combat.end' });
  let defended = botBlocked;
  if (!botBlocked) {
    // life.add does not resync; the bot's settlement rides a room.event
    const dmg = await host
      .waitFor(
        (msg) => msg.type === 'room.event' && String(msg.actor).startsWith('bot:') && msg.action?.kind === 'life.add' && msg.action.delta < 0,
        { since: m, timeoutMs: 15_000 },
      )
      .catch(() => null);
    t.ok(dmg != null, 'bot applied unblocked damage to itself (life.add event)', dmg ? `delta ${dmg.action.delta}` : 'no event');
    defended = dmg != null;
    // and the next resync carries the new total in room.state
    if (dmg) {
      const m2 = host.mark();
      host.act({ kind: 'turn.pass' });
      st = await host.expectState(
        (s) => s.players.find((p) => p.isBot).life === botLifeBefore + dmg.action.delta,
        'settled life total lands in the next state snapshot',
        15_000,
        { since: m2 },
      );
    }
  } else {
    t.ok(true, 'bot declared a block against the attacker', '');
  }
  t.ok(defended, 'bot defended (blocked or took the damage itself)', botBlocked ? 'blocked' : 'via life.add');
  botConservation(t, host.lastState(), 'after host combat');

  // --- fast combat: begin + two attackers + end inside one bot tick --------
  // (the original bug: the bot never witnessed the combat live and settled
  // nothing; the room's ended-combat record makes settlement race-free)
  st = host.lastState();
  if (st.activeSeat !== st.players.find((p) => !p.isBot).seat) {
    m = host.mark();
    await host.expectState((s2) => s2.activeSeat === s2.players.find((p) => !p.isBot).seat, 'turn back to host', 45_000, { since: m });
  }
  const fastTokens = [];
  for (const name of ['Blitz One', 'Blitz Two']) {
    m = host.mark();
    host.act({ kind: 'token.create', name, power: '4', toughness: '4', x: 0.45, y: 0.5 });
    const ev = await host.waitFor((msg) => msg.type === 'room.event' && msg.action?.kind === 'token.create' && msg.action?.card?.name === name, { since: m, timeoutMs: 5000 });
    fastTokens.push(ev.action.card.iid);
  }
  m = host.mark();
  host.act({ kind: 'combat.begin' });
  host.act({ kind: 'combat.attack', iid: fastTokens[0] });
  host.act({ kind: 'combat.attack', iid: fastTokens[1] });
  host.act({ kind: 'combat.end' });
  const fastDmg = await host
    .waitFor((msg) => msg.type === 'room.event' && String(msg.actor).startsWith('bot:') && msg.action?.kind === 'life.add' && msg.action.delta < 0, { since: m, timeoutMs: 12_000 })
    .catch(() => null);
  t.ok(fastDmg != null && fastDmg.action.delta === -8, 'fast two-attacker combat settles full damage (-8)', fastDmg ? `delta ${fastDmg.action.delta}` : 'no settlement');

  await deleteRoom(host, roomId);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
