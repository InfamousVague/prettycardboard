// Scenario: enforced rules — a human seat vs a hard bot at an enforced table.
// Proves the Arena-lite validator: illegal moves are rejected with reasons
// (uncast spells, second land drops, unaffordable casts, off-turn passes),
// legal land drops go through, and the bot runs the full combat machine
// (declare → lock → our ready → server preview → resolve applies damage).
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

async function main() {
  const t = new Assert('enforced-duel');
  const seeded = await ensureSeed(['pt_alice']);
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await me.ensureUser();
  await me.connect();
  me.send({ type: 'room.leave' });
  await sleep(300);

  const mk = await me.api('POST', '/api/rooms', {
    name: 'Enforced duel', seats: 2, persistent: false, format: 'commander',
  });
  const roomId = mk.json.roomId;
  me.joinRoom(roomId, seeded.pt_alice.deckId);
  await me.expectState((s) => s.players.length === 1, 'seated', 5000);

  // Flip the table to enforced, then seat a hard bot.
  const st = me.lastState().settings ?? {};
  me.send({ type: 'room.settings', settings: { ...st, enforced: true } });
  await me.expectState((s) => s.settings?.enforced === true, 'enforced setting on', 5000);
  me.send({ type: 'bot.add', style: 'aggro', difficulty: 'hard' });
  await me.expectState((s) => s.players.some((p) => p.isBot), 'bot seated', 8000);
  me.setReady(true);
  await me.expectState((s) => s.players.every((p) => p.ready), 'everyone ready', 5000);

  // Give the oracle prefetch a moment (two Scryfall batches for two precons).
  await sleep(6000);
  me.send({ type: 'room.start' });
  await me.expectState((s) => s.started, 'started', 5000);
  me.act({ kind: 'mull.keep', bottomIids: [] });
  await me.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    'hands kept',
    20000,
  );

  const isLand = (name) =>
    /Plains|Island|Swamp|Mountain|Forest|Tower|Peaks|Bog|Cairns|Outpost|Glade|Ridgeline|Path of Ancestry|Barrens|Spire|Grounds|Wastes|Panorama|Vista|Crossroads|Land/i.test(name);
  const myself = () => me.lastState().players.find((p) => !p.isBot);

  // The opening hand can hold zero regex-recognizable lands (the FF precons
  // carry exotic land names). Fetch two basics from the library so the
  // land-drop assertions below are deterministic.
  me.act({ kind: 'library.search' });
  const libMsg = await me.waitFor((m) => m.type === 'library.cards', { timeoutMs: 5000 });
  const basics = (libMsg?.cards ?? []).filter((c) =>
    /^(Plains|Island|Swamp|Mountain|Forest)$/.test(c.name),
  );
  for (const basic of basics.slice(0, 2)) {
    me.act({ kind: 'card.move', iid: basic.iid, to: 'hand' });
    await me.expectState(
      (s) => s.players.find((p) => !p.isBot).hand?.some((c) => c.iid === basic.iid),
      `${basic.name} fetched to hand`,
      5000,
    );
  }

  // 1) Dragging a nonland out of hand must be rejected: cast it instead.
  // The name heuristic can mislabel an exotic land, so accept either the
  // must_cast rejection or the card legally landing as this turn's drop.
  const spell = myself().hand.find((c) => !isLand(c.name));
  let mark = me.mark();
  if (spell) {
    me.act({ kind: 'card.move', iid: spell.iid, to: 'battlefield', x: 0.4, y: 0.5 });
    const err = await me.waitFor((m) => m.type === 'error', { since: mark, timeoutMs: 4000 });
    if (err) {
      t.ok(err.code === 'must_cast', 'raw spell drop rejected (must_cast)', JSON.stringify(err));
    } else {
      const landed = myself().battlefield.some((c) => c.iid === spell.iid);
      t.ok(landed, 'nameless land landed as the turn drop', spell.name);
    }
  }

  // 2) An unaffordable cast is rejected with a reason (no lands tapped yet,
  //    and nothing in the FF precons costs zero).
  if (spell) {
    mark = me.mark();
    me.act({ kind: 'cast', iid: spell.iid, x: 0.4, y: 0.5 });
    const err = await me.waitFor((m) => m.type === 'error', { since: mark, timeoutMs: 4000 });
    t.ok(err?.code === 'illegal', 'unaffordable cast rejected', JSON.stringify(err));
  }

  // 3) A land drop is tracked, and any further drop this turn is rejected.
  const alreadyDropped = (myself().landsThisTurn ?? 0) >= 1;
  const lands = myself().hand.filter((c) => isLand(c.name));
  t.ok(lands.length >= 1, 'test hand has a land', `${lands.length} lands`);
  if (lands.length >= 1 && !alreadyDropped) {
    me.act({ kind: 'card.move', iid: lands[0].iid, to: 'battlefield', x: 0.15, y: 0.75 });
    await me.expectState(
      (s) => (s.players.find((p) => !p.isBot).landsThisTurn ?? 0) === 1,
      'first land drop lands',
      5000,
    );
  }
  const extraLand = myself().hand.filter((c) => isLand(c.name))[0];
  if (extraLand) {
    mark = me.mark();
    me.act({ kind: 'card.move', iid: extraLand.iid, to: 'battlefield', x: 0.25, y: 0.75 });
    const err = await me.waitFor((m) => m.type === 'error', { since: mark, timeoutMs: 4000 });
    t.ok(err?.code === 'illegal', 'second land drop rejected', JSON.stringify(err));
  }
  t.ok((myself().landsThisTurn ?? 0) === 1, 'landsThisTurn tracked', String(myself().landsThisTurn));

  // 4) Structural guards: turn.set is always refused at an enforced table
  //    (untap.all is a harmless no-op on your own turn, so it makes a poor
  //    assertion - whether it errors depends on who is active).
  mark = me.mark();
  me.act({ kind: 'turn.set', seat: myself().seat });
  let err = await me.waitFor((m) => m.type === 'error', { since: mark, timeoutMs: 4000 });
  t.ok(err?.code === 'illegal', 'turn.set rejected', JSON.stringify(err));

  // 5) Goldfish my turns and ride the bot's enforced combat machine: it must
  //    lock, wait for our ready, and resolve only after the server's preview.
  me.act({ kind: 'turn.pass' });
  const mySeat = myself().seat;
  const t0 = Date.now();
  let locked = null;
  while (Date.now() - t0 < 150000 && !locked) {
    const s = me.lastState();
    if (s?.combat?.locked === true) {
      locked = { state: s };
      break;
    }
    // The bot passed back to me with no combat pending: pass straight back.
    // (Never into my own open end window - that pass would be rejected; the
    // bot's response closes it.)
    if (s?.activeSeat === mySeat && !s.combat && s.endWindow == null) {
      me.act({ kind: 'turn.pass' });
    }
    // The bot's own end window: pass so its turn ends without the lapse.
    if (
      s?.activeSeat !== mySeat &&
      s?.endWindow != null &&
      (s.stack ?? []).length === 0 &&
      !(s.stackPassed ?? []).includes(mySeat)
    ) {
      me.act({ kind: 'stack.pass' });
    }
    await sleep(1200);
  }
  t.ok(Boolean(locked), 'bot locked in an enforced attack', '');
  if (locked) {
    const lifeBefore = myself().life;
    const sinceReady = me.mark();
    me.act({ kind: 'combat.ready' });
    const previewed = await me.waitFor(
      (m) => m.type === 'room.state' && m.state.combat?.preview != null,
      { since: sinceReady, timeoutMs: 10000 },
    );
    t.ok(Boolean(previewed), 'server computed a combat preview', '');
    const preview = previewed?.state.combat.preview;
    const expected = Object.entries(preview?.life ?? {})
      .filter(([seat]) => Number(seat) === myself().seat)
      .reduce((sum, [, d]) => sum + d, 0);
    // Read life off the exact state that cleared combat: the resolve resync
    // carries both, so no later bot action can muddy the assertion.
    const resolved = await me.waitFor(
      (m) => m.type === 'room.state' && m.state.combat == null,
      { since: sinceReady, timeoutMs: 20000 },
    );
    t.ok(Boolean(resolved), 'bot resolved the combat', '');
    const lifeAfter = resolved?.state.players.find((p) => !p.isBot)?.life;
    if (expected !== 0) {
      t.eq(lifeAfter, lifeBefore + expected, 'preview damage applied to my life');
    } else {
      t.ok(lifeAfter === lifeBefore, 'no damage previewed, none applied', '');
    }
  }

  me.send({ type: 'room.leave' });
  await deleteRoom(me, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('enforced-duel crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'enforced-duel', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
