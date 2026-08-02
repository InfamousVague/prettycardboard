// Scenario: pointing an attacker at something.
//
// Declaring an attacker in a pod named nobody - the client sent an "open
// swing" with no defenderSeat, because there was no way to say WHICH opponent
// (or which planeswalker) a creature was hitting. The declaration existed and
// the aim did not, which is why it was not clear how to set one.
//
// Two halves:
//   1. An attack can carry a defending seat, and a defending CARD.
//   2. Re-declaring with a different aim RE-POINTS the attacker instead of
//      withdrawing it - "actually, hit the planeswalker" is a change of mind
//      about the target, not about attacking. A plain re-click still toggles
//      it off, which is how an attacker is taken back.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

const NAMES = ['Grizzly Bears', 'Forest'];

async function main() {
  const t = new Assert('attack-aim');
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  const foe = new PlaytestClient('pt_bob', { password: PASSWORD, assert: t });
  await me.ensureUser();
  await foe.ensureUser();

  const res = await fetch('https://api.scryfall.com/cards/collection', {
    method: 'POST',
    headers: {
      'User-Agent': 'PrettyCardboard/1.0',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ identifiers: NAMES.map((name) => ({ name })) }),
  });
  const byName = new Map();
  for (const c of (await res.json()).data ?? []) byName.set(c.name, c.id);
  t.eq(byName.size, NAMES.length, 'test cards resolved');

  const payload = {
    name: 'PT Aim Lab',
    format: 'standard',
    cards: [
      { scryfallId: byName.get('Grizzly Bears'), name: 'Grizzly Bears', quantity: 8, board: 'main' },
      { scryfallId: byName.get('Forest'), name: 'Forest', quantity: 52, board: 'main' },
    ],
  };
  const deckFor = async (client) => {
    const list = await client.api('GET', '/api/decks');
    const existing = list.json?.find((d) => d.name === payload.name);
    const up = existing
      ? await client.api('PUT', `/api/decks/${existing.id}`, payload)
      : await client.api('POST', '/api/decks', payload);
    return existing ? existing.id : up.json.id;
  };
  const myDeck = await deckFor(me);
  const foeDeck = await deckFor(foe);

  await me.connect();
  await foe.connect();
  me.send({ type: 'room.leave' });
  foe.send({ type: 'room.leave' });
  await sleep(400);

  // Three seats so there is genuinely a choice of defender - the whole point.
  const mk = await me.api('POST', '/api/rooms', {
    name: 'Aim lab', seats: 3, persistent: false, format: 'standard',
  });
  const roomId = mk.json.roomId;
  me.joinRoom(roomId, myDeck);
  await me.expectState((s) => s.players.length === 1, 'seated', 8000);
  foe.joinRoom(roomId, foeDeck);
  await me.expectState((s) => s.players.length === 2, 'opponent seated', 10_000);
  me.send({ type: 'bot.add', style: 'casual' });
  await me.expectState((s) => s.players.length === 3, 'third seat filled', 12_000);
  me.setReady(true);
  foe.setReady(true);
  await sleep(4000);
  me.send({ type: 'room.start' });
  await me.expectState((s) => s.started, 'started', 10_000);
  me.act({ kind: 'mull.keep', bottomIids: [] });
  foe.act({ kind: 'mull.keep', bottomIids: [] });
  await me.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    'hands kept',
    25_000,
  );

  const mine = () => me.lastState().players.find((p) => p.userId === me.userId);
  const seatOf = (name) => me.lastState().players.find((p) => p.username === name)?.seat;
  const attackers = () => me.lastState().combat?.attackers ?? [];

  for (const c of [...mine().hand]) me.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
  await me.expectState(
    (s) => s.players.find((p) => p.userId === me.userId)?.handCount === 0,
    'hand bottomed',
    10_000,
  );
  const mark = me.mark();
  me.act({ kind: 'library.search' });
  const lib = await me.waitFor((m) => m.type === 'library.cards', { since: mark, timeoutMs: 8000 });
  const bear = (lib?.cards ?? []).find((c) => c.name === 'Grizzly Bears');
  t.ok(bear, 'a creature to attack with', '');
  me.act({ kind: 'card.move', iid: bear.iid, to: 'battlefield', x: 0.4, y: 0.6 });
  await me.expectState(
    (s) => s.players.find((p) => p.userId === me.userId).battlefield.some((c) => c.iid === bear.iid),
    'creature on the battlefield',
    8000,
  );

  // ---- 1) Declare with an explicit defending seat.
  const bobSeat = seatOf('pt_bob');
  me.act({ kind: 'combat.begin' });
  await sleep(500);
  me.act({ kind: 'combat.attack', iid: bear.iid, defenderSeat: bobSeat, power: '2', toughness: '2' });
  await me.expectState(
    () => attackers().some((a) => a.iid === bear.iid && a.defenderSeat === bobSeat),
    'an attack can name which opponent it is hitting',
    8000,
  );
  t.eq(attackers().length, 1, 'exactly one attacker');

  // ---- 2) Re-aim at the OTHER opponent. This must not withdraw it.
  const botSeat = me.lastState().players.find((p) => p.isBot)?.seat;
  const aimMark = me.mark();
  me.act({ kind: 'combat.attack', iid: bear.iid, defenderSeat: botSeat, power: '2', toughness: '2' });
  await me.expectState(
    () => attackers().some((a) => a.iid === bear.iid && a.defenderSeat === botSeat),
    're-declaring with a new aim re-points the attacker',
    8000,
  );
  t.eq(attackers().length, 1, 'and it is still attacking, not withdrawn');
  await me.expectLog(/Grizzly Bears now attacks/, 'the table is told it changed target', {
    since: aimMark,
    timeoutMs: 6000,
  });

  // ---- 3) Aim at a CARD, not a player.
  const foeCard = (me.lastState().players.find((p) => p.seat === bobSeat)?.battlefield ?? [])[0];
  if (foeCard) {
    me.act({
      kind: 'combat.attack',
      iid: bear.iid,
      defenderSeat: bobSeat,
      targetIid: foeCard.iid,
      power: '2',
      toughness: '2',
    });
    await me.expectState(
      () => attackers().some((a) => a.iid === bear.iid && a.targetIid === foeCard.iid),
      'an attack can name a defending CARD',
      8000,
    );
    t.eq(attackers().length, 1, 'still one attacker after aiming at a card');
  }

  // ---- 4) A plain re-click (no aim) still takes the attacker back.
  me.act({ kind: 'combat.attack', iid: bear.iid });
  await me.expectState(() => attackers().length === 0, 'a bare re-click withdraws it', 8000);

  await deleteRoom(me, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('attack-aim crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'attack-aim', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
