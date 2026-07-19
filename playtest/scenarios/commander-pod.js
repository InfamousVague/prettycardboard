// Scenario 1: full 4-player commander pod exercising the whole Gameplay v2
// surface — London mulligans, first-turn auto-draw (no skip in 4p commander),
// turn rotation + wrap, phase ribbon, commander cast/loss/return/tax, guided
// combat, commander damage attribution, stack push/counter, dice, all
// markers, library viewers + privacy, attach + glued move, undo, reveal,
// and disconnect/resume.
import { PlaytestClient, Assert, sleep, deleteRoom } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

const PHASES = ['upkeep', 'main1', 'attack', 'block', 'damage', 'main2', 'end'];

async function main() {
  const t = new Assert('commander-pod');
  const names = ['pt_alice', 'pt_bob', 'pt_carol', 'pt_dana'];
  const seeded = await ensureSeed(names);
  const [alice, bob, carol, dana] = names.map((n) => new PlaytestClient(n, { password: PASSWORD, assert: t }));
  const clients = [alice, bob, carol, dana];
  for (const c of clients) {
    await c.ensureUser();
    await c.connect();
  }

  // --- create + join -------------------------------------------------------
  const roomRes = await alice.api('POST', '/api/rooms', {
    name: 'pt commander pod',
    seats: 4,
    persistent: false,
    format: 'commander',
  });
  t.ok(roomRes.status === 201, 'room created (commander, 4 seats, non-persistent)', `status ${roomRes.status}`);
  const roomId = roomRes.json.roomId;

  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    const m = c.mark();
    c.joinRoom(roomId, seeded[c.username].deckId);
    const st = await c.expectState(
      (s) => s.players.length === i + 1 && s.players.some((p) => p.userId === c.userId),
      `joined with deck (seat ${i})`,
      5000,
      { since: m },
    );
    if (st) {
      const me = c.me(st);
      t.ok(me.seat === i, `${c.username} took seat ${i}`, `got seat ${me.seat}`);
      t.ok(me.life === 40, `${c.username} starts at 40 life`, `got ${me.life}`);
      t.ok(me.libraryCount === 99 && me.command.length === 1, `${c.username} deck loaded: 99 library + 1 commander`, `lib ${me.libraryCount}, cmd ${me.command.length}`);
      t.ok(me.command[0].isCommander === true, `${c.username} commander flagged isCommander`);
    }
  }

  // --- start + London mulligans -------------------------------------------
  let m = alice.mark();
  alice.send({ type: 'room.start' });
  const started = await alice.expectState(
    (s) => s.started && s.players.every((p) => p.handCount === 7 && p.mulligan?.state === 'deciding'),
    'game started: 7-card hands dealt, everyone deciding mulligan',
    5000,
    { since: m },
  );
  t.ok(started && started.activeSeat === 0 && started.turnNumber === 1, 'starting seat is 0, turn 1', started ? `seat ${started.activeSeat} turn ${started.turnNumber}` : 'no state');

  // bob mulls once (free in 3+ player commander)
  m = bob.mark();
  bob.act({ kind: 'mull.take' });
  await bob.expectLog(/pt_bob mulligans to 7 \(free\)/, 'bob first mulligan is free', { since: m });
  await bob.expectState((s) => bob.me(s).mulligan?.taken === 1, 'bob mulligan.taken = 1', 5000, { since: m });

  // carol mulls twice (second is not free)
  m = carol.mark();
  carol.act({ kind: 'mull.take' });
  await carol.expectLog(/pt_carol mulligans to 7 \(free\)/, 'carol first mulligan free', { since: m });
  m = carol.mark();
  carol.act({ kind: 'mull.take' });
  await carol.expectLog(/pt_carol mulligans to 7(?! \(free\))/, 'carol second mulligan not free', { since: m });
  const carolSt = await carol.expectState((s) => carol.me(s).mulligan?.taken === 2, 'carol mulligan.taken = 2', 5000, { since: m });

  // alice keeps at once
  m = alice.mark();
  alice.act({ kind: 'mull.keep', bottomIids: [] });
  await alice.expectLog(/pt_alice keeps at 7/, 'alice keeps at 7 (no bottoming)', { since: m });

  // bob mulled once -> bottoms 0
  m = bob.mark();
  bob.act({ kind: 'mull.keep', bottomIids: [] });
  await bob.expectLog(/pt_bob keeps at 7/, 'bob keeps at 7 after one free mulligan (bottoms 0)', { since: m });

  // carol mulled twice -> must bottom exactly 1 (server enforces)
  m = carol.mark();
  carol.act({ kind: 'mull.keep', bottomIids: [] });
  const keepErr = await carol.waitFor((x) => x.type === 'error' && x.code === 'bad_bottom', { since: m, timeoutMs: 3000 });
  t.ok(keepErr, 'carol keeping without bottoming 1 is rejected (bad_bottom)');
  const carolHand = carol.me(carolSt ?? carol.lastState()).hand;
  m = carol.mark();
  carol.act({ kind: 'mull.keep', bottomIids: [carolHand[0].iid] });
  await carol.expectLog(/pt_carol keeps at 6/, 'carol bottoms 1, keeps at 6', { since: m });

  // Before dana keeps: no first-turn auto yet.
  let st = alice.lastState();
  t.ok(alice.me(st).handCount === 7, 'no auto first-turn draw before all seats kept', `alice hand ${alice.me(st).handCount}`);

  // dana keeps -> all kept -> first turn begins; 4p commander does NOT skip the draw.
  m = alice.mark();
  dana.act({ kind: 'mull.keep', bottomIids: [] });
  await alice.expectLog(/pt_alice untaps and draws a card/, 'first-turn auto for starting seat: draw happens (no 4p skip)', { since: m });
  st = await alice.expectState((s) => alice.me(s).handCount === 8 && alice.me(s).libraryCount === 91, 'alice hand 8 / library 91 after auto draw', 5000, { since: m });

  // --- full turn rotation with turn.pass -----------------------------------
  const expectPass = async (passer, next, nextName, expHand, expTurn, label) => {
    const mm = passer.mark();
    passer.act({ kind: 'turn.pass' });
    await passer.expectLog(new RegExp(`${passer.username} passes the turn to ${nextName} \\(turn ${expTurn}\\)`), `${label}: pass log`, { since: mm });
    await passer.expectLog(new RegExp(`${nextName} untaps and draws a card`), `${label}: incoming player untaps + draws`, { since: mm });
    const s2 = await passer.expectState(
      (s) => s.activeSeat === next && s.turnNumber === expTurn && s.players.find((p) => p.seat === next)?.handCount === expHand,
      `${label}: activeSeat ${next}, turn ${expTurn}, hand ${expHand}`,
      5000,
      { since: mm },
    );
    return s2;
  };
  await expectPass(alice, 1, 'pt_bob', 8, 1, 'rotation 1');
  await expectPass(bob, 2, 'pt_carol', 7, 1, 'rotation 2'); // carol kept at 6
  await expectPass(carol, 3, 'pt_dana', 8, 1, 'rotation 3');
  // dana passes back to alice: wrap -> turnNumber increments
  m = dana.mark();
  dana.act({ kind: 'turn.pass' });
  await dana.expectLog(/pt_dana passes the turn to pt_alice \(turn 2\)/, 'rotation wrap: turnNumber -> 2', { since: m });
  st = await dana.expectState(
    (s) => s.activeSeat === 0 && s.turnNumber === 2 && s.players.find((p) => p.seat === 0)?.handCount === 9,
    'wrap: alice active again, turn 2, drew (hand 9)',
    5000,
    { since: m },
  );

  // --- phase ribbon walk ----------------------------------------------------
  for (const phase of PHASES) {
    m = bob.mark();
    alice.act({ kind: 'phase.set', phase });
    await bob.expectState((s) => s.phase === phase, `phase ribbon -> ${phase}`, 5000, { since: m });
  }
  m = alice.mark();
  alice.act({ kind: 'phase.set', phase: 'main1' });
  await alice.expectState((s) => s.phase === 'main1', 'phase back to main1', 5000, { since: m });

  // --- commander: cast (tax 0) -> lost -> cmd.choice -> return -> recast (tax 2)
  st = alice.lastState();
  const cmdIid = alice.me(st).command[0].iid;
  const cmdName = alice.me(st).command[0].name;
  m = alice.mark();
  alice.act({ kind: 'cmd.cast', iid: cmdIid, x: 0.3, y: 0.4 });
  await alice.expectLog(new RegExp(`pt_alice casts .* \\(tax 0\\)`), 'commander cast with tax 0', { since: m });
  st = await alice.expectState(
    (s) => alice.me(s).battlefield.some((c) => c.iid === cmdIid) && alice.me(s).commanderTax[cmdIid] === 2 && alice.me(s).command.length === 0,
    'commander on battlefield, tax counter now 2',
    5000,
    { since: m },
  );

  // lose it to the graveyard -> owner gets cmd.choice; others never do
  m = alice.mark();
  const mBobPriv = bob.mark();
  alice.act({ kind: 'card.move', iid: cmdIid, to: 'graveyard' });
  const choice = await alice.expectPrivate('cmd.choice', 'owner receives cmd.choice on commander leaving battlefield', { since: m });
  t.ok(choice && choice.iid === cmdIid && choice.to === 'graveyard', 'cmd.choice carries iid + destination', JSON.stringify(choice));
  await alice.expectLog(/commander .* may return to the command zone/, 'pending-commander log line', { since: m });
  st = await alice.expectState(
    (s) => !alice.me(s).battlefield.some((c) => c.iid === cmdIid) && !alice.me(s).graveyard.some((c) => c.iid === cmdIid),
    'commander held in limbo while choice pending',
    5000,
    { since: m },
  );
  await bob.assertNever('cmd.choice', 'bob never receives another player\'s cmd.choice', 1200, { since: mBobPriv });

  m = alice.mark();
  alice.act({ kind: 'cmd.return', iid: cmdIid, accept: true });
  await alice.expectLog(/pt_alice returns .* to the command zone/, 'accept -> commander back to command zone', { since: m });
  st = await alice.expectState((s) => alice.me(s).command.some((c) => c.iid === cmdIid), 'commander in command zone again', 5000, { since: m });

  m = alice.mark();
  alice.act({ kind: 'cmd.cast', iid: cmdIid, x: 0.35, y: 0.45 });
  await alice.expectLog(new RegExp(`pt_alice casts .* \\(tax 2\\)`), 'recast logs tax 2', { since: m });
  st = await alice.expectState((s) => alice.me(s).commanderTax[cmdIid] === 4, 'tax counter now 4 after second cast', 5000, { since: m });

  // --- guided combat: bob attacks alice + carol; carol blocks one -----------
  st = bob.lastState();
  const bobHand = bob.me(st).hand;
  const atk1 = bobHand[0].iid;
  const atk2 = bobHand[1].iid;
  for (const [i, iid] of [atk1, atk2].entries()) {
    m = bob.mark();
    bob.act({ kind: 'card.move', iid, to: 'battlefield', x: 0.2 + i * 0.1, y: 0.5 });
    await bob.expectState((s) => bob.me(s).battlefield.some((c) => c.iid === iid), `bob deploys attacker ${i + 1}`, 5000, { since: m });
  }
  m = bob.mark();
  bob.act({ kind: 'combat.begin' });
  await bob.expectState((s) => s.combat && s.phase === 'attack', 'combat.begin: phase -> attack, combat block created', 5000, { since: m });

  m = bob.mark();
  bob.act({ kind: 'combat.attack', iid: atk1, defenderSeat: 0 });
  await bob.expectLog(/ attacks pt_alice, tapped/, 'attacker 1 declared vs alice, auto-tapped', { since: m });
  m = bob.mark();
  bob.act({ kind: 'combat.attack', iid: atk2, defenderSeat: 2 });
  await bob.expectLog(/ attacks pt_carol, tapped/, 'attacker 2 declared vs carol, auto-tapped', { since: m });
  st = await carol.expectState(
    (s) =>
      s.combat?.attackers.length === 2 &&
      s.combat.attackers.some((a) => a.iid === atk1 && a.defenderSeat === 0) &&
      s.combat.attackers.some((a) => a.iid === atk2 && a.defenderSeat === 2) &&
      s.players.find((p) => p.seat === 1).battlefield.every((c) => c.tapped),
    'both attackers registered with defenders; both tapped',
    5000,
  );

  st = carol.lastState();
  const blockerIid = carol.me(st).hand[0].iid;
  m = carol.mark();
  carol.act({ kind: 'card.move', iid: blockerIid, to: 'battlefield', x: 0.6, y: 0.5 });
  await carol.expectState((s) => carol.me(s).battlefield.some((c) => c.iid === blockerIid), 'carol deploys blocker', 5000, { since: m });
  m = carol.mark();
  carol.act({ kind: 'combat.block', blockerIid, attackerIid: atk2 });
  await carol.expectLog(/ blocks /, 'block pairing logged', { since: m });
  await carol.expectState(
    (s) => s.combat?.blocks.length === 1 && s.combat.blocks[0].blockerIid === blockerIid && s.combat.blocks[0].attackerIid === atk2,
    'block pairing in combat state',
    5000,
    { since: m },
  );

  m = bob.mark();
  bob.act({ kind: 'combat.end' });
  await bob.expectState((s) => s.combat === null && s.phase === 'main2', 'combat.end: combat cleared, phase -> main2', 5000, { since: m });

  // --- commander damage with attribution ------------------------------------
  const bobCmdIid = alice.lastState().players.find((p) => p.seat === 1).command[0].iid;
  m = alice.mark();
  alice.act({ kind: 'cmd.damage', fromSeat: 1, delta: 6, commanderIid: bobCmdIid });
  await alice.expectLog(/pt_bob deals 6 commander damage to pt_alice \(6 total\)/, 'commander damage logged with source', { since: m });
  st = await alice.expectState(
    (s) => alice.me(s).cmdDamage['1'] === 6 && alice.me(s).cmdDamageByCommander[bobCmdIid] === 6,
    'cmdDamage by seat and by commander both tally 6',
    5000,
    { since: m },
  );

  // --- stack: dana pushes a hand card, alice counters it --------------------
  st = dana.lastState();
  const spellIid = dana.me(st).hand[0].iid;
  const spellName = dana.me(st).hand[0].name;
  m = bob.mark();
  dana.act({ kind: 'stack.push', iid: spellIid });
  st = await bob.expectState(
    (s) => s.stack.length === 1 && s.stack[0].iid === spellIid && s.stack[0].revealed === true && s.stack[0].owner === dana.userId,
    'hand card on stack, revealed to the table, owner tagged',
    5000,
    { since: m },
  );
  t.ok(st && st.stack[0].name === spellName, 'other players see the revealed card name', st ? `saw "${st.stack[0].name}"` : '');
  m = alice.mark();
  alice.act({ kind: 'stack.counter', iid: spellIid, to: 'graveyard' });
  await alice.expectLog(/pt_alice counters /, 'counter logged', { since: m });
  await alice.expectState(
    (s) => s.stack.length === 0 && s.players.find((p) => p.userId === dana.userId).graveyard.some((c) => c.iid === spellIid),
    'countered card lands in owner\'s (dana\'s) graveyard',
    5000,
    { since: m },
  );

  // --- dice ------------------------------------------------------------------
  m = bob.mark();
  alice.act({ kind: 'dice.roll', sides: 20 });
  let ev = await bob.expectEvent((x) => x.action.kind === 'dice.roll' && Array.isArray(x.action.results) && x.action.results.length === 1, 'd20 result broadcast', { since: m });
  t.ok(ev && ev.action.results[0] >= 1 && ev.action.results[0] <= 20, 'd20 result in range', ev ? `${ev.action.results[0]}` : '');
  await bob.expectLog(/pt_alice rolls d20: \d+/, 'd20 log line', { since: m });
  m = bob.mark();
  alice.act({ kind: 'dice.roll', sides: 6, count: 3 });
  ev = await bob.expectEvent((x) => x.action.kind === 'dice.roll' && x.action.results?.length === 3, '3d6 gives 3 results', { since: m });
  m = bob.mark();
  alice.act({ kind: 'dice.roll', sides: 2 });
  await bob.expectLog(/pt_alice flips a coin: (Heads|Tails)/, 'coin flip log', { since: m });

  // --- all markers ------------------------------------------------------------
  m = bob.mark();
  alice.act({ kind: 'marker.set', marker: 'monarch', seat: 2 });
  await bob.expectLog(/pt_carol becomes the monarch/, 'monarch log', { since: m });
  await bob.expectState((s) => s.markers.monarch === 2, 'monarch marker on seat 2', 5000, { since: m });
  m = bob.mark();
  alice.act({ kind: 'marker.set', marker: 'initiative', seat: 3 });
  await bob.expectState((s) => s.markers.initiative === 3, 'initiative marker on seat 3', 5000, { since: m });
  m = bob.mark();
  alice.act({ kind: 'marker.day', value: 'night' });
  await bob.expectState((s) => s.markers.dayNight === 'night', 'day/night -> night', 5000, { since: m });
  m = bob.mark();
  alice.act({ kind: 'marker.day', value: null });
  await bob.expectState((s) => s.markers.dayNight === undefined, 'day/night cleared', 5000, { since: m });
  m = bob.mark();
  alice.act({ kind: 'marker.storm', delta: 3 });
  await bob.expectState((s) => s.markers.storm === 3, 'storm count 3', 5000, { since: m });
  m = bob.mark();
  alice.act({ kind: 'marker.storm', delta: -1 });
  await bob.expectState((s) => s.markers.storm === 2, 'storm count back to 2', 5000, { since: m });

  // --- library peek / reorder / bottom / search + privacy ---------------------
  let mBob = bob.mark();
  m = alice.mark();
  alice.act({ kind: 'library.peek', count: 3 });
  const peek = await alice.expectPrivate('library.cards', 'peek returns top 3 privately', { since: m });
  t.ok(peek && peek.cards.length === 3, 'peek card count = 3', peek ? `${peek.cards.length}` : '');
  await alice.expectLog(/pt_alice looks at the top 3 cards of their library/, 'peek is logged publicly', { since: m });
  await bob.assertNever('library.cards', 'PRIVACY: bob never receives alice\'s library.cards (peek)', 1200, { since: mBob });

  const peekedIids = peek.cards.map((c) => c.iid);
  const reversed = [...peekedIids].reverse();
  m = alice.mark();
  alice.act({ kind: 'library.reorder', iids: reversed });
  await alice.expectLog(/pt_alice rearranges the top 3 cards/, 'scry reorder logged', { since: m });
  m = alice.mark();
  alice.act({ kind: 'library.peek', count: 3 });
  const peek2 = await alice.expectPrivate('library.cards', 'second peek to verify order', { since: m });
  t.eq(peek2?.cards.map((c) => c.iid), reversed, 'library order matches the reorder');

  m = alice.mark();
  alice.act({ kind: 'library.bottom', iids: [reversed[0]] });
  await alice.expectLog(/pt_alice puts 1 card on the bottom of their library/, 'bottom 1 peeked card', { since: m });

  mBob = bob.mark();
  m = alice.mark();
  const libCount = alice.me(alice.lastState()).libraryCount;
  alice.act({ kind: 'library.search' });
  const search = await alice.expectPrivate('library.cards', 'search returns full library privately', { since: m });
  t.ok(search && search.cards.length === libCount, `search shows all ${libCount} cards`, search ? `${search.cards.length}` : '');
  await alice.expectLog(/pt_alice searches their library/, 'search is logged publicly', { since: m });
  await bob.assertNever('library.cards', 'PRIVACY: bob never receives alice\'s library.cards (search)', 1200, { since: mBob });
  alice.act({ kind: 'shuffle' });
  await alice.expectLog(/pt_alice shuffles their library/, 'shuffle after search', { since: m });

  // --- attach + glued move -----------------------------------------------------
  st = alice.lastState();
  const auraIid = alice.me(st).hand[0].iid;
  m = alice.mark();
  alice.act({ kind: 'card.move', iid: auraIid, to: 'battlefield', x: 0.5, y: 0.6 });
  await alice.expectState((s) => alice.me(s).battlefield.some((c) => c.iid === auraIid), 'aura-ish card deployed', 5000, { since: m });
  m = alice.mark();
  alice.act({ kind: 'card.attach', iid: auraIid, hostIid: cmdIid });
  await alice.expectLog(/pt_alice attaches /, 'attach logged', { since: m });
  st = await alice.expectState(
    (s) => alice.me(s).battlefield.find((c) => c.iid === auraIid)?.attachedTo === cmdIid,
    'attachedTo set on the glued card',
    5000,
    { since: m },
  );
  m = alice.mark();
  alice.act({ kind: 'card.pos', iid: cmdIid, x: 0.8, y: 0.2 });
  ev = await alice.expectEvent(
    (x) => x.action.kind === 'card.pos' && Array.isArray(x.action.attachments) && x.action.attachments.some((a) => a.iid === auraIid),
    'glued move: card.pos event carries attachment positions',
    { since: m },
  );
  alice.requestResync();
  st = await alice.expectState(
    (s) => {
      const aura = alice.me(s).battlefield.find((c) => c.iid === auraIid);
      return aura && Math.abs(aura.x - 0.818) < 1e-9 && Math.abs(aura.y - 0.218) < 1e-9;
    },
    'attached card followed its host (x=0.818, y=0.218)',
    5000,
    { since: m },
  );

  // --- undo a tap ----------------------------------------------------------------
  m = alice.mark();
  alice.act({ kind: 'card.tap', iid: auraIid, tapped: true });
  await alice.expectLog(/pt_alice taps /, 'tap logged', { since: m });
  alice.requestResync();
  await alice.expectState((s) => alice.me(s).battlefield.find((c) => c.iid === auraIid)?.tapped === true, 'card tapped', 5000, { since: m });
  m = alice.mark();
  alice.act({ kind: 'undo' });
  await alice.expectLog(/pt_alice undoes their last action/, 'undo logged', { since: m });
  await alice.expectState((s) => alice.me(s).battlefield.find((c) => c.iid === auraIid)?.tapped === false, 'undo reverted the tap', 5000, { since: m });

  // --- reveal top 2 -----------------------------------------------------------------
  m = bob.mark();
  alice.act({ kind: 'library.reveal', count: 2 });
  ev = await bob.expectEvent(
    (x) => x.action.kind === 'library.reveal' && x.action.cards?.length === 2 && x.action.cards.every((c) => c.name),
    'reveal top 2: card details broadcast to the table',
    { since: m },
  );
  await bob.expectLog(/pt_alice reveals .* from the top of their library/, 'reveal logged with names', { since: m });

  // --- disconnect + reconnect (seat + full v2 state resumes) --------------------------
  const beforeDrop = dana.lastState();
  const danaHand = dana.me(beforeDrop).handCount;
  m = alice.mark();
  await dana.close();
  await alice.expectState((s) => s.players.find((p) => p.userId === dana.userId)?.online === false, 'others see dana offline', 5000, { since: m });

  const mDana = dana.mark();
  await dana.connect();
  const resumed = await dana.expectState((s) => s.roomId === roomId && dana.me(s)?.online === true, 'dana auto-resumes her seat on reconnect', 5000, { since: mDana });
  if (resumed) {
    const me = dana.me(resumed);
    t.ok(me.seat === 3, 'seat 3 preserved', `seat ${me.seat}`);
    t.ok(Array.isArray(me.hand) && me.hand.length === danaHand && me.handCount === danaHand, 'private hand restored in full', `hand ${me.hand?.length}/${me.handCount}`);
    t.ok(
      resumed.turnNumber === beforeDrop.turnNumber && resumed.phase === beforeDrop.phase && resumed.activeSeat === beforeDrop.activeSeat,
      'v2 turn/phase state identical after resume',
      `turn ${resumed.turnNumber} phase ${resumed.phase}`,
    );
    t.eq(resumed.markers, beforeDrop.markers, 'markers identical after resume');
    t.eq(
      resumed.players.find((p) => p.userId === alice.userId).commanderTax,
      beforeDrop.players.find((p) => p.userId === alice.userId).commanderTax,
      'commander tax identical after resume',
    );
  }
  await alice.expectState((s) => s.players.find((p) => p.userId === dana.userId)?.online === true, 'others see dana back online', 5000);

  // --- teardown -------------------------------------------------------------------------
  const mClose = bob.mark();
  await deleteRoom(alice, roomId);
  const closed = await bob.waitFor((x) => x.type === 'room.closed' && x.roomId === roomId, { since: mClose, timeoutMs: 3000 });
  t.ok(closed, 'room.closed pushed to seated players on host delete');
  for (const c of clients) await c.close();

  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((e) => {
  console.error('commander-pod crashed:', e);
  console.log(`##RESULT## ${JSON.stringify({ name: 'commander-pod', passed: 0, failed: 1, durationMs: 0, crashed: String(e) })}`);
  process.exit(1);
});
