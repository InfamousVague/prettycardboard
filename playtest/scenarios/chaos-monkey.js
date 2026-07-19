// Scenario 3: chaos monkey. 3 players, 120 random-but-valid actions sampled
// (weighted) across the whole v2 action space. After EVERY action asserts:
//   (a) no desync — every client receives the room.event, and a forced
//       room.state resync, within 3s;
//   (b) card conservation per player — hand/handCount coherence and
//       hand + battlefield + graveyard + exile + command + stack + library
//       totals stay at the deck size (tokens excluded; actions pause while a
//       cmd.choice is pending and it is answered randomly);
//   (c) the server stays alive (no error frames, REST still answers).
// Seeded RNG: `node scenarios/chaos-monkey.js [seed]` reproduces a run.
import { PlaytestClient, Assert, sleep, mulberry32, deleteRoom } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

const SEED = Number(process.argv[2]) || 20260717;
const TOTAL_ACTIONS = Number(process.argv[3]) || 120;
const PHASES = ['upkeep', 'main1', 'attack', 'block', 'damage', 'main2', 'end'];
const MOVE_DESTS = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'command'];

async function main() {
  const t = new Assert('chaos-monkey');
  console.log(`chaos seed: ${SEED} (${TOTAL_ACTIONS} actions)`);
  const rng = mulberry32(SEED);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const rint = (n) => Math.floor(rng() * n);

  const names = ['pt_alice', 'pt_bob', 'pt_carol'];
  const seeded = await ensureSeed(names);
  const clients = names.map((n) => new PlaytestClient(n, { password: PASSWORD, assert: t }));
  const [alice] = clients;
  for (const c of clients) {
    await c.ensureUser();
    await c.connect();
  }

  const roomRes = await alice.api('POST', '/api/rooms', {
    name: 'pt chaos table',
    seats: 3,
    persistent: false,
    format: 'commander',
  });
  t.ok(roomRes.status === 201, 'room created', `status ${roomRes.status}`);
  const roomId = roomRes.json.roomId;
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    const m = c.mark();
    c.joinRoom(roomId, seeded[c.username].deckId);
    await c.expectState((s) => s.players.length === i + 1, `${c.username} seated`, 5000, { since: m });
  }
  let m = alice.mark();
  alice.send({ type: 'room.start' });
  await alice.expectState((s) => s.started, 'game started', 5000, { since: m });
  for (const c of clients) {
    const mm = c.mark();
    c.act({ kind: 'mull.keep', bottomIids: [] });
    await c.expectState((s) => c.me(s).mulligan?.state === 'kept', `${c.username} kept`, 5000, { since: mm });
  }
  // Wait until the post-keep auto-draw settles, then baseline.
  m = alice.mark();
  alice.requestResync();
  let st = await alice.expectState((s) => s.players.every((p) => p.mulligan?.state === 'kept'), 'all kept, baseline state', 5000, { since: m });
  let lastSeq = st.seq;

  const nonToken = (arr) => arr.filter((c) => !c.isToken).length;
  const playerTotal = (state, p) =>
    p.handCount +
    p.libraryCount +
    nonToken(p.battlefield) +
    nonToken(p.graveyard) +
    nonToken(p.exile) +
    nonToken(p.command) +
    state.stack.filter((e) => e.owner === p.userId && !e.isToken).length;

  const baseline = {};
  for (const p of st.players) baseline[p.userId] = playerTotal(st, p);
  t.ok(
    Object.values(baseline).every((v) => v === 100),
    'baseline: every player owns exactly 100 cards',
    JSON.stringify(baseline),
  );

  // ------------------------------------------------------------ samplers
  // Each entry: [name, weight, (actor, state, me) => action | null].
  const otherSeat = (state, me) => pick(state.players.filter((p) => p.seat !== me.seat)).seat;
  const ownCard = (me, zones) => {
    const pool = [];
    for (const z of zones) for (const c of me[z] ?? []) pool.push(c);
    return pool.length ? pick(pool) : null;
  };
  const TABLE = [
    ['card.move', 20, (a, s, me) => {
      const c = ownCard(me, ['hand', 'battlefield', 'graveyard', 'exile', 'command']);
      if (!c) return null;
      const to = pick(MOVE_DESTS);
      const act = { kind: 'card.move', iid: c.iid, to };
      if (to === 'battlefield') { act.x = rng(); act.y = rng(); }
      if (to === 'library') act.index = pick([0, -1]);
      return act;
    }],
    ['card.pos', 12, (a, s, me) => {
      const c = ownCard(me, ['battlefield']);
      return c ? { kind: 'card.pos', iid: c.iid, x: rng(), y: rng() } : null;
    }],
    ['card.tap', 12, (a, s, me) => {
      const c = ownCard(me, ['battlefield']);
      return c ? { kind: 'card.tap', iid: c.iid, tapped: rng() < 0.5 } : null;
    }],
    ['card.face', 4, (a, s, me) => {
      const c = ownCard(me, ['battlefield']);
      return c ? { kind: 'card.face', iid: c.iid, faceDown: rng() < 0.5 } : null;
    }],
    ['card.counter', 4, (a, s, me) => {
      const c = ownCard(me, ['battlefield']);
      return c ? { kind: 'card.counter', iid: c.iid, counter: pick(['+1/+1', 'charge', 'loyalty']), delta: pick([1, 1, 2, -1]) } : null;
    }],
    ['card.attach', 3, (a, s, me) => {
      if (me.battlefield.length < 2) return null;
      const card = pick(me.battlefield);
      const host = pick(me.battlefield.filter((c) => c.iid !== card.iid));
      return { kind: 'card.attach', iid: card.iid, hostIid: rng() < 0.85 ? host.iid : null };
    }],
    ['token.create', 3, () => ({ kind: 'token.create', name: pick(['Zombie', 'Treasure', 'Soldier', 'Chocobo']), power: '2', toughness: '2', x: rng(), y: rng() })],
    ['token.clone', 2, (a, s, me) => {
      const c = ownCard(me, ['battlefield']);
      return c ? { kind: 'token.clone', iid: c.iid, x: rng(), y: rng() } : null;
    }],
    ['draw', 8, () => ({ kind: 'draw', count: 1 })],
    ['shuffle', 3, () => ({ kind: 'shuffle' })],
    ['mulligan.v1', 1, () => ({ kind: 'mulligan' })],
    ['untap.all', 3, () => ({ kind: 'untap.all' })],
    ['life.add', 5, () => ({ kind: 'life.add', delta: pick([1, 2, 3, -1, -2, -3]) })],
    ['life.set', 1, () => ({ kind: 'life.set', value: 1 + rint(40) })],
    ['cmd.damage', 2, (a, s, me) => ({ kind: 'cmd.damage', fromSeat: otherSeat(s, me), delta: 1 + rint(3) })],
    ['poison.add', 1, () => ({ kind: 'poison.add', delta: pick([1, -1]) })],
    ['reveal.hand', 1, () => ({ kind: 'reveal.hand' })],
    ['turn.pass', 4, () => ({ kind: 'turn.pass' })],
    ['turn.set', 1, (a, s) => ({ kind: 'turn.set', seat: pick(s.players).seat })],
    ['phase.set', 3, () => ({ kind: 'phase.set', phase: pick(PHASES) })],
    ['turn.auto', 1, (a, s) => (a.userId === s.hostUserId ? { kind: 'turn.auto', enabled: rng() < 0.7 } : null)],
    ['stack.push', 5, (a, s, me) => {
      const c = ownCard(me, ['hand', 'battlefield', 'graveyard', 'exile', 'command']);
      return c ? { kind: 'stack.push', iid: c.iid } : null;
    }],
    ['stack.resolve', 4, (a, s) => {
      if (!s.stack.length) return null;
      const e = pick(s.stack);
      const to = pick(['battlefield', 'graveyard', 'exile', 'hand']);
      const act = { kind: 'stack.resolve', iid: e.iid, to };
      if (to === 'battlefield') { act.x = rng(); act.y = rng(); }
      return act;
    }],
    ['stack.counter', 2, (a, s) => {
      if (!s.stack.length) return null;
      return { kind: 'stack.counter', iid: pick(s.stack).iid, to: 'graveyard' };
    }],
    ['combat.begin', 2, (a, s) => (s.combat ? null : { kind: 'combat.begin' })],
    ['combat.attack', 3, (a, s, me) => {
      if (!s.combat) return null;
      const c = ownCard(me, ['battlefield']);
      if (!c) return null;
      const act = { kind: 'combat.attack', iid: c.iid };
      if (rng() < 0.7) act.defenderSeat = otherSeat(s, me);
      return act;
    }],
    ['combat.block', 2, (a, s, me) => {
      if (!s.combat?.attackers.length) return null;
      const blocker = ownCard(me, ['battlefield']);
      if (!blocker) return null;
      // Attacker must still exist on some battlefield for a sane pairing.
      const live = s.combat.attackers.filter((at) => s.players.some((p) => p.battlefield.some((c) => c.iid === at.iid)));
      if (!live.length) return null;
      return { kind: 'combat.block', blockerIid: blocker.iid, attackerIid: pick(live).iid };
    }],
    ['combat.end', 2, (a, s) => (s.combat ? { kind: 'combat.end' } : null)],
    ['cmd.cast', 2, (a, s, me) => {
      const c = ownCard(me, ['command']);
      return c ? { kind: 'cmd.cast', iid: c.iid, x: rng(), y: rng() } : null;
    }],
    ['dice.roll', 2, () => ({ kind: 'dice.roll', sides: pick([2, 6, 20]), count: 1 + rint(3) })],
    ['marker.set', 1, (a, s) => ({ kind: 'marker.set', marker: pick(['monarch', 'initiative']), seat: rint(s.seats) })],
    ['marker.day', 1, () => ({ kind: 'marker.day', value: pick(['day', 'night', null]) })],
    ['marker.storm', 1, () => ({ kind: 'marker.storm', delta: pick([1, 2, -1]) })],
    ['library.peek', 3, (a, s, me) => (me.libraryCount ? { kind: 'library.peek', count: 1 + rint(3), _scry: true } : null)],
    ['library.search', 1, () => ({ kind: 'library.search', _private: true })],
    ['library.reveal', 1, () => ({ kind: 'library.reveal', count: 1 + rint(2) })],
    ['undo.pair', 2, (a, s, me) => {
      const c = ownCard(me, ['battlefield']);
      return c ? { kind: 'card.tap', iid: c.iid, tapped: rng() < 0.5, _thenUndo: true } : null;
    }],
  ];
  const WEIGHT_SUM = TABLE.reduce((n, [, w]) => n + w, 0);

  function sampleItem() {
    for (let tries = 0; tries < 60; tries++) {
      let roll = rng() * WEIGHT_SUM;
      let entry = TABLE[TABLE.length - 1];
      for (const e of TABLE) {
        roll -= e[1];
        if (roll <= 0) { entry = e; break; }
      }
      const actor = pick(clients);
      const state = actor.lastState();
      const me = actor.me(state);
      const action = entry[2](actor, state, me);
      if (action) return { actor, action, name: entry[0] };
    }
    return { actor: pick(clients), action: { kind: 'dice.roll', sides: 6 }, name: 'dice.roll' };
  }

  // ---------------------------------------------------------------- loop
  const queue = [];
  const dist = {};
  let actionsDone = 0;
  let step = 0;
  let cmdChoicesAnswered = 0;

  /// Send one game.action, verify sync + conservation on every client.
  /// Returns the number of actions performed (1 + any cmd.return answers).
  async function performStep(item) {
    step++;
    const { actor, action } = item;
    const label = `step ${step} [${actor.username}] ${action.kind}`;
    const marks = clients.map((c) => c.mark());
    const { _scry, _thenUndo, _private, ...wire } = action;
    actor.act(wire);
    let performed = 1;
    lastSeq++;

    // (a) every client receives the room.event within 3s
    const evs = await Promise.all(
      clients.map((c, i) => c.waitFor((x) => x.type === 'room.event' && x.seq === lastSeq, { since: marks[i], timeoutMs: 3000 })),
    );
    t.check(evs.every(Boolean), `${label}: room.event seq ${lastSeq} on all clients`, `missing on ${clients.filter((c, i) => !evs[i]).map((c) => c.username).join(',')}`);

    // (c) no error frames anywhere
    const errs = clients.flatMap((c, i) => c.errorsSince(marks[i]));
    t.check(errs.length === 0, `${label}: no error frames`, errs.map((e) => `${e.code}: ${e.message}`).join('; '));

    // scry follow-up: use the private reply to queue a reorder/bottom
    if (_scry) {
      const priv = await actor.waitFor((x) => x.type === 'library.cards', { since: marks[clients.indexOf(actor)], timeoutMs: 3000 });
      t.check(priv, `${label}: peek got private library.cards`);
      if (priv && priv.cards.length) {
        const iids = priv.cards.map((c) => c.iid);
        if (rng() < 0.5) {
          const shuffled = [...iids].sort(() => rng() - 0.5);
          queue.push({ actor, action: { kind: 'library.reorder', iids: shuffled }, name: 'library.reorder' });
        } else {
          queue.push({ actor, action: { kind: 'library.bottom', iids: iids.slice(0, 1 + rint(iids.length)) }, name: 'library.bottom' });
        }
      }
    }
    if (_private) {
      const priv = await actor.waitFor((x) => x.type === 'library.cards', { since: marks[clients.indexOf(actor)], timeoutMs: 3000 });
      t.check(priv, `${label}: search got private library.cards`);
    }
    if (_thenUndo) queue.push({ actor, action: { kind: 'undo' }, name: 'undo' });

    // forced per-viewer resync so we can inspect state after EVERY action
    const stMarks = clients.map((c) => c.mark());
    alice.requestResync();
    let states = await Promise.all(
      clients.map((c, i) => c.waitFor((x) => x.type === 'room.state' && x.state.roomId === roomId && x.state.seq === lastSeq, { since: stMarks[i], timeoutMs: 3000 })),
    );
    t.check(states.every(Boolean), `${label}: room.state resync on all clients`, `missing on ${clients.filter((c, i) => !states[i]).map((c) => c.username).join(',')}`);

    // pause + answer any pending cmd.choice randomly, then resync again
    for (let i = 0; i < clients.length; i++) {
      const c = clients[i];
      const choices = c.messages.slice(marks[i]).filter((x) => x.type === 'cmd.choice');
      for (const ch of choices) {
        const answerMarks = clients.map((cc) => cc.mark());
        c.act({ kind: 'cmd.return', iid: ch.iid, accept: rng() < 0.5 });
        cmdChoicesAnswered++;
        performed++;
        lastSeq++;
        const aevs = await Promise.all(
          clients.map((cc, j) => cc.waitFor((x) => x.type === 'room.event' && x.seq === lastSeq, { since: answerMarks[j], timeoutMs: 3000 })),
        );
        t.check(aevs.every(Boolean), `${label}: cmd.return event on all clients`);
        const rsMarks = clients.map((cc) => cc.mark());
        alice.requestResync();
        states = await Promise.all(
          clients.map((cc, j) => cc.waitFor((x) => x.type === 'room.state' && x.state.roomId === roomId && x.state.seq === lastSeq, { since: rsMarks[j], timeoutMs: 3000 })),
        );
        t.check(states.every(Boolean), `${label}: post-cmd.return resync on all clients`);
      }
    }

    // (b) card conservation + hand coherence, per player, per viewer
    const problems = [];
    for (const c of clients) {
      const s = c.lastState();
      if (!s || s.seq !== lastSeq) {
        problems.push(`${c.username}: state seq ${s?.seq} != ${lastSeq}`);
        continue;
      }
      for (const p of s.players) {
        const total = playerTotal(s, p);
        if (total !== baseline[p.userId]) {
          problems.push(`${c.username} sees ${p.username} total ${total} != ${baseline[p.userId]}`);
        }
        if (p.userId === c.userId && (!Array.isArray(p.hand) || p.hand.length !== p.handCount)) {
          problems.push(`${c.username}: own hand ${p.hand?.length} != handCount ${p.handCount}`);
        }
      }
    }
    t.check(problems.length === 0, `${label}: card conservation + hand coherence`, problems.join('; '));
    return performed;
  }

  while (actionsDone < TOTAL_ACTIONS) {
    const item = queue.length ? queue.shift() : sampleItem();
    dist[item.name] = (dist[item.name] || 0) + 1;
    actionsDone += await performStep(item);
    if (actionsDone % 20 === 0) console.log(`  ... ${actionsDone}/${TOTAL_ACTIONS} actions (seq ${lastSeq})`);
  }

  // (c) server still alive
  const alive = await alice.api('GET', '/api/me');
  t.ok(alive.status === 200, 'server alive after chaos (REST answers)', `status ${alive.status}`);
  console.log(`action distribution: ${JSON.stringify(dist)}`);
  console.log(`cmd.choice windows answered: ${cmdChoicesAnswered}`);

  await deleteRoom(alice, roomId);
  for (const c of clients) await c.close();
  const result = t.finish();
  console.log(`reproduce with: node scenarios/chaos-monkey.js ${SEED}`);
  process.exit(result.failed ? 1 : 0);
}

main().catch((e) => {
  console.error('chaos-monkey crashed:', e);
  console.log(`##RESULT## ${JSON.stringify({ name: 'chaos-monkey', passed: 0, failed: 1, durationMs: 0, crashed: String(e) })}`);
  process.exit(1);
});
