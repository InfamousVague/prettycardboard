// Scenario: enforced static/evasion/cost effects (rules roadmap pass B).
// Alice attacks with an evasion zoo while Bob's blockers probe every rule:
//   - unblockable, fear, shadow, skulk, protection-from-color rejections
//     (and the matching legal blocks);
//   - vigilance: declaring the attack does not tap;
//   - anthem: "Creatures you control get +1/+1" folded into the server's
//     combat preview math;
//   - cost cut: "Artifact spells you cast cost {1} less" lets a {2} artifact
//     resolve off a single land;
//   - ward: aiming a spell at a warded permanent relays the printed tax.
// Deterministic like enforced-triggers: hands bottomed, every test card
// fetched from the library before anything draws.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

// Confirmed Scryfall oracle data (2026-07-30):
//   Slither Blade    {U}    1/2  "This creature can't be blocked."
//   Prickly Boggart  {B}    1/1  Fear
//   Vampire Cutthroat{B}    1/1  Skulk, Lifelink
//   Dauthi Slayer    {B}{B} 2/2  Shadow
//   White Knight     {W}{W} 2/2  First strike, Protection from black
//   Serra Angel      {3}{W}{W} 4/4 Flying, Vigilance
//   Glorious Anthem  {1}{W}{W} "Creatures you control get +1/+1."
//   Foundry Inspector{3}   3/2  "Artifact spells you cast cost {1} less to cast."
//   Mind Stone       {2}   artifact
//   Armored Armadillo{W}   0/4  Ward {1}
//   Grizzly Bears    {1}{G} 2/2 vanilla; Walking Corpse {1}{B} 2/2 vanilla;
//   Memnite          {0}   1/1 artifact creature.
const A = {
  blade: { id: '859e5ca5-c184-47ee-a2ea-8075847f46d9', name: 'Slither Blade' },
  boggart: { id: '55121b63-22a6-4923-82e9-c55f66742980', name: 'Prickly Boggart' },
  cutthroat: { id: '954d53f3-ebbe-48e0-9e1a-7019d2b0740c', name: 'Vampire Cutthroat' },
  slayer: { id: 'c289baab-04ee-4639-bc9b-9f032752fa69', name: 'Dauthi Slayer' },
  knight: { id: '660f69ef-c04f-4f53-80e6-8190549ab12a', name: 'White Knight' },
  serra: { id: 'b8c5e74c-96e7-4a1f-93b7-14d776fe4b2d', name: 'Serra Angel' },
  anthem: { id: '17d154d3-7ae5-43ff-9978-d974285e2c89', name: 'Glorious Anthem' },
  inspector: { id: '16debeb1-fb2b-4172-b6da-726416d4fb38', name: 'Foundry Inspector' },
  mindstone: { id: 'ad881aa0-decc-447b-8c8a-983546a9a55a', name: 'Mind Stone' },
  armadillo: { id: '263232df-69b8-4205-93ad-c724fe57ec11', name: 'Armored Armadillo' },
};
const B = {
  bears: { id: '409f9b88-f03e-40b6-9883-68c14c37c0de', name: 'Grizzly Bears' },
  corpse: { id: '053b59b4-a22c-4228-aadc-ae9da6bb465e', name: 'Walking Corpse' },
  memnite: { id: '975459ba-e1c2-4800-a3fa-5c0cf8ce728f', name: 'Memnite' },
};
const BASICS = {
  plains: { id: '9dd2d666-7c6b-48ce-93dc-c004ebdd1fe9', name: 'Plains' },
  swamp: { id: 'f66094ef-059b-4511-aa6e-835906736de4', name: 'Swamp' },
  forest: { id: 'be72862d-d71e-4b18-98a6-59019399f631', name: 'Forest' },
};

async function uploadDeck(client, name, cards) {
  const payload = { name, format: 'standard', cards };
  const list = await client.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === name);
  const res = existing
    ? await client.api('PUT', `/api/decks/${existing.id}`, payload)
    : await client.api('POST', '/api/decks', payload);
  return existing ? existing.id : res.json.id;
}

async function main() {
  const t = new Assert('enforced-statics');
  const alice = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  const bob = new PlaytestClient('pt_bob', { password: PASSWORD, assert: t });
  await alice.ensureUser();
  await bob.ensureUser();

  const aliceDeck = await uploadDeck(alice, 'PT Statics Attack', [
    ...Object.values(A).map((c) => ({ scryfallId: c.id, name: c.name, quantity: 1, board: 'main' })),
    { scryfallId: BASICS.plains.id, name: 'Plains', quantity: 25, board: 'main' },
    { scryfallId: BASICS.swamp.id, name: 'Swamp', quantity: 25, board: 'main' },
  ]);
  const bobDeck = await uploadDeck(bob, 'PT Statics Defense', [
    ...Object.values(B).map((c) => ({ scryfallId: c.id, name: c.name, quantity: 1, board: 'main' })),
    { scryfallId: BASICS.forest.id, name: 'Forest', quantity: 29, board: 'main' },
    { scryfallId: BASICS.swamp.id, name: 'Swamp', quantity: 28, board: 'main' },
  ]);

  await alice.connect();
  await bob.connect();
  alice.send({ type: 'room.leave' });
  bob.send({ type: 'room.leave' });
  await sleep(300);

  const mk = await alice.api('POST', '/api/rooms', {
    name: 'Statics lab', seats: 2, persistent: false, format: 'standard',
  });
  const roomId = mk.json.roomId;
  alice.joinRoom(roomId, aliceDeck);
  await alice.expectState((s) => s.players.length === 1, 'alice seated first (seat 0)', 5000);
  bob.joinRoom(roomId, bobDeck);
  await alice.expectState((s) => s.players.length === 2, 'bob seated', 5000);
  const st = alice.lastState().settings ?? {};
  alice.send({ type: 'room.settings', settings: { ...st, enforced: true } });
  await alice.expectState((s) => s.settings?.enforced === true, 'enforced on', 5000);
  alice.setReady(true);
  bob.setReady(true);
  await sleep(4000); // oracle prefetch
  alice.send({ type: 'room.start' });
  await alice.expectState((s) => s.started, 'started', 5000);
  alice.act({ kind: 'mull.keep', bottomIids: [] });
  bob.act({ kind: 'mull.keep', bottomIids: [] });
  await alice.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    'hands kept',
    10000,
  );

  const seatOf = (client) =>
    alice.lastState().players.find((p) => p.userId === client.userId).seat;
  const mine = (client) => client.lastState().players.find((p) => p.userId === client.userId);

  // Bottom both hands; fetch all test cards before anything draws.
  for (const who of [alice, bob]) {
    for (const c of [...mine(who).hand]) {
      who.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
    }
    await who.expectState(
      (s) => s.players.find((p) => p.userId === who.userId).handCount === 0,
      'hand bottomed',
      6000,
    );
    who.act({ kind: 'library.search' });
  }
  const aliceLib = (await alice.waitFor((m) => m.type === 'library.cards', { timeoutMs: 5000 })).cards;
  const bobLib = (await bob.waitFor((m) => m.type === 'library.cards', { timeoutMs: 5000 })).cards;

  const iids = {};
  const fetchTo = async (who, lib, name, zone, x = 0.4, y = 0.55) => {
    const card = lib.find((c) => c.name === name && !c._used);
    card._used = true;
    who.act({ kind: 'card.move', iid: card.iid, to: zone, x, y });
    await who.expectState(
      (s) => s.players.find((p) => p.userId === who.userId)[zone].some((c) => c.iid === card.iid),
      `${name} fetched`,
      5000,
    );
    iids[name] = card.iid;
    return card.iid;
  };

  // Alice's board: the evasion zoo + Inspector + Armadillo. The Anthem waits
  // in HAND (fetched before any draw can swallow it) - the skulk test needs
  // pre-anthem power, so it is cast only between the two combats. One Plains
  // out for now: the cost cut must be what makes Mind Stone castable.
  for (const c of [A.blade, A.boggart, A.cutthroat, A.slayer, A.knight, A.serra, A.inspector, A.armadillo]) {
    await fetchTo(alice, aliceLib, c.name, 'battlefield', 0.1 + 0.1 * Object.keys(iids).length, 0.6);
  }
  await fetchTo(alice, aliceLib, 'Mind Stone', 'hand');
  await fetchTo(alice, aliceLib, 'Glorious Anthem', 'hand');
  await fetchTo(alice, aliceLib, 'Plains', 'battlefield', 0.05, 0.8);
  for (const c of [B.bears, B.corpse, B.memnite]) {
    await fetchTo(bob, bobLib, c.name, 'battlefield', 0.2 + 0.15 * Object.keys(iids).length, 0.4);
  }

  // ---- 1) Cost cut: {2} Mind Stone resolves off ONE land with the
  //         Inspector out (without the cut solve_payment must refuse).
  let mark = alice.mark();
  alice.act({ kind: 'cast', iid: iids['Mind Stone'], x: 0.6, y: 0.6 });
  await alice.expectState(
    (s) =>
      s.players.find((p) => p.userId === alice.userId).battlefield.some((c) => c.name === 'Mind Stone'),
    'Mind Stone cast off a single land (cost cut applied)',
    6000,
  );
  const castLog = await alice.waitFor(
    (m) => m.type === 'log' && /casts Mind Stone \(paying 1\)/.test(m.text),
    { since: mark, timeoutMs: 4000 },
  );
  t.ok(castLog, 'cast log shows the discounted payment (paying 1)', '');

  // Mana for the Anthem cast later ({1}{W}{W}), fetched after the single-land
  // proof above so it cannot contaminate it.
  for (let i = 0; i < 3; i++) await fetchTo(alice, aliceLib, 'Plains', 'battlefield', 0.12 + i * 0.06, 0.8);

  // ---- 2) Ward reminder: bob aims a spell at the Armadillo.
  mark = bob.mark();
  bob.send({ type: 'aim', fromIid: iids['Grizzly Bears'], toIid: iids['Armored Armadillo'] });
  const aimMsg = await bob.waitFor(
    (m) => m.type === 'aim' && m.toIid === iids['Armored Armadillo'],
    { since: mark, timeoutMs: 4000 },
  );
  t.eq(aimMsg?.ward, '{1}', 'aim relay carries the ward tax');
  const wardLog = await bob.waitFor(
    (m) => m.type === 'log' && /Armored Armadillo has ward \{1\}/.test(m.text),
    { since: mark, timeoutMs: 4000 },
  );
  t.ok(wardLog, 'ward tax reminder logged', '');

  // To combat: pass through bob's turn so alice's creatures shed sickness.
  alice.act({ kind: 'turn.pass' });
  await alice.expectState((s) => s.activeSeat === seatOf(bob), "bob's turn", 6000);
  bob.act({ kind: 'turn.pass' });
  await alice.expectState(
    (s) => s.activeSeat === seatOf(alice) && s.turnNumber === 2,
    "alice's second turn",
    6000,
  );

  // ---- 3) Combat 1 (no anthem): evasion matrix + vigilance.
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => Boolean(s.combat), 'combat open', 5000);
  for (const name of ['Prickly Boggart', 'Vampire Cutthroat', 'Dauthi Slayer', 'White Knight', 'Serra Angel']) {
    alice.act({ kind: 'combat.attack', iid: iids[name] });
  }
  await alice.expectState((s) => s.combat?.attackers?.length === 5, 'five attackers', 5000);
  alice.act({ kind: 'combat.lock' });
  const locked = await bob.expectState((s) => s.combat?.locked === true, 'locked', 5000);
  const serraCard = locked.players
    .find((p) => p.userId === alice.userId)
    .battlefield.find((c) => c.iid === iids['Serra Angel']);
  t.eq(serraCard?.tapped, false, 'vigilance: Serra Angel attacks untapped');
  const boggartCard = locked.players
    .find((p) => p.userId === alice.userId)
    .battlefield.find((c) => c.iid === iids['Prickly Boggart']);
  t.eq(boggartCard?.tapped, true, 'no vigilance: Boggart attacks tapped');

  // Illegal blocks are rejected with reasons; legal ones stick.
  const tryBlock = async (blockerName, attackerName, expectErr, label) => {
    const since = bob.mark();
    bob.act({ kind: 'combat.block', blockerIid: iids[blockerName], attackerIid: iids[attackerName] });
    if (expectErr) {
      const err = await bob.waitFor((m) => m.type === 'error', { since, timeoutMs: 4000 });
      t.ok(err?.code === 'illegal', label, JSON.stringify(err?.message ?? err));
    } else {
      await bob.expectState(
        (s) =>
          (s.combat?.blocks ?? []).some(
            (b) => b.blockerIid === iids[blockerName] && b.attackerIid === iids[attackerName],
          ),
        label,
        5000,
      );
    }
  };
  await tryBlock('Grizzly Bears', 'Dauthi Slayer', true, 'shadow: Bears cannot block Dauthi Slayer');
  await tryBlock('Grizzly Bears', 'Prickly Boggart', true, 'fear: Bears cannot block the Boggart');
  await tryBlock('Grizzly Bears', 'Vampire Cutthroat', true, 'skulk: 2-power Bears cannot block the 1/1');
  await tryBlock('Walking Corpse', 'White Knight', true, 'protection from black: Corpse bounced');
  await tryBlock('Walking Corpse', 'Prickly Boggart', false, 'fear: black Corpse blocks the Boggart');
  await tryBlock('Memnite', 'Vampire Cutthroat', false, 'skulk: 1-power artifact Memnite blocks');
  await tryBlock('Grizzly Bears', 'White Knight', false, 'green Bears block the pro-black Knight');

  bob.act({ kind: 'combat.ready' });
  const previewed = await alice.expectState((s) => s.combat?.preview != null, 'preview computed', 6000);
  const life1 = previewed.combat.preview.life ?? {};
  t.eq(life1[String(seatOf(bob))], -6, 'unblocked Slayer (2) + Serra (4) previewed without anthem');
  t.eq(life1[String(seatOf(alice))], 1, 'Cutthroat lifelink previewed for the attacker');
  // Every assertion from here on could match a stale combat-1 state:
  // always anchor to a fresh mark.
  let since = alice.mark();
  alice.act({ kind: 'combat.end' });
  await alice.expectState((s) => !s.combat, 'combat 1 cancelled (no damage applied)', 5000, { since });

  // ---- 4) Combat 2: the Anthem is cast for real, and the same math grows.
  since = alice.mark();
  alice.act({ kind: 'cast', iid: iids['Glorious Anthem'], x: 0.92, y: 0.6 });
  await alice.expectState(
    (s) =>
      s.players.find((p) => p.userId === alice.userId).battlefield.some((c) => c.name === 'Glorious Anthem'),
    'Glorious Anthem cast',
    6000,
    { since },
  );
  since = alice.mark();
  const bobSince2 = bob.mark();
  alice.act({ kind: 'combat.begin' });
  await alice.expectState((s) => Boolean(s.combat), 'combat 2 open', 5000, { since });
  alice.act({ kind: 'combat.attack', iid: iids['Slither Blade'] });
  await alice.expectState(
    (s) => s.combat?.attackers?.length === 1,
    'Blade attacks',
    5000,
    { since },
  );
  alice.act({ kind: 'combat.lock' });
  await bob.expectState((s) => s.combat?.locked === true, 'locked 2', 5000, { since: bobSince2 });
  await tryBlock('Grizzly Bears', 'Slither Blade', true, 'unblockable: Bears bounce off Slither Blade');
  const sinceReady2 = alice.mark();
  bob.act({ kind: 'combat.ready' });
  const previewed2 = await alice.expectState(
    (s) => s.combat?.preview != null,
    'preview 2 computed',
    6000,
    { since: sinceReady2 },
  );
  const life2 = previewed2.combat.preview.life ?? {};
  t.eq(
    life2[String(seatOf(bob))],
    -2,
    'anthem folded into the preview (1/2 Blade hits for 2)',
  );
  since = alice.mark();
  alice.act({ kind: 'combat.end' });
  await alice.expectState((s) => !s.combat, 'combat 2 closed', 5000, { since });

  alice.send({ type: 'room.leave' });
  bob.send({ type: 'room.leave' });
  await deleteRoom(alice, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('enforced-statics crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'enforced-statics', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
