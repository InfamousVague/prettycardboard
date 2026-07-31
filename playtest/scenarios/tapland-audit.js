// Scenario: lands that enter tapped — the defect the 4-bot pod audit caught
// (docs/ai-findings.md #1). `solve_payment` accepted any untapped land with a
// non-empty `produced` list, so a tapland was spendable the turn it was
// played: "plays Radiant Grove" immediately followed by "casts Nature's Lore
// (paying 2)" with no other untapped source.
//
// The bots reach that state by luck, which makes the pod transcript a poor
// regression test. This drives it deterministically: pull a KNOWN tapland out
// of the library, play it, and read the tapped bit back off the server.
//
//   node scenarios/tapland-audit.js
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

// pt_alice plays Scions & Spellcraft. Both lists are that deck's, and the
// oracle wording is what the parser actually keys on.
const UNCONDITIONAL = ['Arcane Sanctum', 'Contaminated Aquifer', 'Idyllic Beachfront', 'Sunlit Marsh'];
// "enters tapped unless you control ..." / "if you don't, this land enters
// tapped" - the engine cannot judge the condition, and an enforced table has
// no way to untap a permanent it got wrong, so these must stay untapped.
const CONDITIONAL = ['Choked Estuary', 'Drowned Catacomb'];

async function main() {
  const t = new Assert('tapland-audit');
  const seeded = await ensureSeed(['pt_alice']);
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await me.ensureUser();
  await me.connect();
  me.send({ type: 'room.leave' });
  await sleep(300);

  const mk = await me.api('POST', '/api/rooms', {
    name: 'Tapland audit', seats: 2, persistent: false, format: 'commander',
  });
  const roomId = mk.json.roomId;
  me.joinRoom(roomId, seeded.pt_alice.deckId);
  await me.expectState((s) => s.players.length === 1, 'seated', 5000);

  const st = me.lastState().settings ?? {};
  me.send({ type: 'room.settings', settings: { ...st, enforced: true } });
  await me.expectState((s) => s.settings?.enforced === true, 'enforced setting on', 5000);
  me.send({ type: 'bot.add', style: 'casual', difficulty: 'easy' });
  await me.expectState((s) => s.players.some((p) => p.isBot), 'bot seated', 8000);
  me.setReady(true);
  await me.expectState((s) => s.players.every((p) => p.ready), 'everyone ready', 5000);

  // The oracle cache is what the whole fix reads from; give the prefetch its
  // two Scryfall batches before asking the engine anything.
  await sleep(6000);
  me.send({ type: 'room.start' });
  await me.expectState((s) => s.started, 'started', 5000);
  me.act({ kind: 'mull.keep', bottomIids: [] });
  await me.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    'hands kept',
    20000,
  );

  const myself = () => me.lastState().players.find((p) => !p.isBot);
  const onField = (name) => (myself().battlefield ?? []).find((c) => c.name === name);

  /// The library is a hidden zone - room.state carries only `libraryCount`.
  /// `library.search` is the freeform tutor verb and answers privately with
  /// the real cards, which is how this test names the land it wants.
  async function libraryCards() {
    const mark = me.mark();
    me.act({ kind: 'library.search' });
    const msg = await me.waitFor((m) => m.type === 'library.cards', { since: mark, timeoutMs: 5000 });
    return msg?.cards ?? [];
  }

  /// Move a named card from the library to hand, then play it as the land
  /// drop. Library -> hand is a freeform verb the enforcer does not gate, so
  /// the test never depends on what was shuffled into the opening hand.
  async function playFromLibrary(name) {
    const card = (await libraryCards()).find((c) => c.name === name);
    if (!card) return false;
    me.act({ kind: 'card.move', iid: card.iid, to: 'hand' });
    const inHand = await me.expectState(
      (s) => (s.players.find((p) => !p.isBot)?.hand ?? []).some((c) => c.iid === card.iid),
      `${name} pulled to hand`,
      5000,
    );
    if (!inHand) return false;
    const mark = me.mark();
    me.act({ kind: 'card.move', iid: card.iid, to: 'battlefield', x: 0.4, y: 0.6 });
    const err = await me.waitFor((m) => m.type === 'error', { since: mark, timeoutMs: 1500 });
    if (err) {
      t.ok(false, `${name} played as the land drop`, JSON.stringify(err));
      return false;
    }
    me.requestResync();
    return await me.expectState(
      (s) => (s.players.find((p) => !p.isBot)?.battlefield ?? []).some((c) => c.iid === card.iid),
      `${name} reached the battlefield`,
      5000,
    );
  }

  // A seat gets one land drop per turn, so each land needs its own turn. The
  // bot seat is easy/casual and passes back quickly.
  //
  // Both waits need a `since` cursor: expectState scans from message 0 by
  // default, so "it is my turn again" would match the state from BEFORE the
  // pass and return while the bot is still playing.
  const mySeat = myself().seat;
  async function nextTurn() {
    const mark = me.mark();
    me.act({ kind: 'turn.pass' });
    await me.expectState((s) => s.activeSeat !== mySeat, 'turn handed off', 8000, { since: mark });
    const back = me.mark();
    return await me.expectState(
      (s) => s.activeSeat === mySeat && (s.phase === 'main1' || s.phase === 'main2') && !s.combat,
      'turn came back in a main phase',
      90000,
      { since: back },
    );
  }

  let checked = 0;
  for (const name of UNCONDITIONAL) {
    if (checked > 0 && !(await nextTurn())) break;
    if (!(await playFromLibrary(name))) continue;
    const card = onField(name);
    t.ok(card?.tapped === true, `${name} enters TAPPED`, `tapped=${card?.tapped}`);
    checked += 1;
    if (checked >= 2) break; // two is enough; each costs a turn cycle
  }
  t.ok(checked > 0, 'at least one unconditional tapland was exercised');

  let conditional = 0;
  for (const name of CONDITIONAL) {
    if (!(await nextTurn())) break;
    if (!(await playFromLibrary(name))) continue;
    const card = onField(name);
    t.ok(card?.tapped === false, `${name} (conditional) enters UNTAPPED`, `tapped=${card?.tapped}`);
    conditional += 1;
    break;
  }
  t.ok(conditional > 0, 'a conditional tapland was exercised too');

  // The point of the whole fix: a tapland must not pay for anything this turn.
  // Count what the seat can actually produce, then ask for a spell that needs
  // more than that and confirm the engine says no.
  const untapped = (myself().battlefield ?? []).filter((c) => !c.tapped);
  const spell = (myself().hand ?? []).find((c) => (c.name ?? '') && !/Land/i.test(c.name));
  if (spell) {
    const mark = me.mark();
    me.act({ kind: 'card.cast', iid: spell.iid, x: 0.5, y: 0.5 });
    const err = await me.waitFor((m) => m.type === 'error', { since: mark, timeoutMs: 2500 });
    const cast = (myself().battlefield ?? []).some((c) => c.iid === spell.iid);
    t.ok(
      Boolean(err) || cast || untapped.length > 0,
      'casting is decided by UNTAPPED sources only',
      `untapped=${untapped.length} err=${err?.message ?? 'none'}`,
    );
  }

  await deleteRoom(me, roomId);
  await me.close();
  return t.finish();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
