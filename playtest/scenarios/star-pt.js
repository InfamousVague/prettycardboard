// Scenario: a `*` power is a number, and it moves.
//
// Master of Etherium reads "*/*" on its face and IS a 3/3 on a board with
// three artifacts. The engine already counted that for combat, but the number
// lived nowhere the board could see: the card chip showed the printed string,
// so a card that had just gained two power still read `*/*`, and a player had
// no way to know what it was without counting artifacts by hand.
//
// It is now stamped on the instance and refreshed in the same breath as
// state-based actions, on every Magic table - this is the card telling you
// what it is, not the engine playing for you.
//
//   1. It arrives with its real numbers, not `*`.
//   2. Another artifact entering grows it, and the log says so.
//   3. An artifact leaving shrinks it.
//   4. It works on a freeform table too.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

// Verbatim Scryfall (2026-08-01):
//   Master of Etherium {2}{U} Artifact Creature — Vedalken Wizard  */*
//     "Master of Etherium's power and toughness are each equal to the number
//      of artifacts you control. / Other artifact creatures you control get
//      +1/+1."
//   Ornithopter {0} Artifact Creature — Thopter  0/2
const NAMES = ['Master of Etherium', 'Ornithopter', 'Island'];

async function main() {
  const t = new Assert('star-pt');
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await me.ensureUser();

  const byName = new Map();
  const res0 = await fetch('https://api.scryfall.com/cards/collection', {
    method: 'POST',
    headers: {
      'User-Agent': 'PrettyCardboard/1.0',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ identifiers: NAMES.map((name) => ({ name })) }),
  });
  const json0 = await res0.json();
  for (const c of json0.data ?? []) byName.set(c.name, c.id);
  t.eq(byName.size, NAMES.length, 'every test card resolved');

  const payload = {
    name: 'PT Star PT Lab',
    format: 'standard',
    cards: [
      { scryfallId: byName.get('Master of Etherium'), name: 'Master of Etherium', quantity: 2, board: 'main' },
      { scryfallId: byName.get('Ornithopter'), name: 'Ornithopter', quantity: 6, board: 'main' },
      { scryfallId: byName.get('Island'), name: 'Island', quantity: 52, board: 'main' },
    ],
  };
  const list = await me.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === payload.name);
  const up = existing
    ? await me.api('PUT', `/api/decks/${existing.id}`, payload)
    : await me.api('POST', '/api/decks', payload);
  t.ok([200, 201].includes(up.status), 'star-pt deck uploaded', `status ${up.status}`);
  const deckId = existing ? existing.id : up.json.id;

  await me.connect();
  me.send({ type: 'room.leave' });
  await sleep(300);
  // FREEFORM on purpose: a `*` is a fact about the card, so it should read
  // correctly whether or not an engine is refereeing.
  const mk = await me.api('POST', '/api/rooms', {
    name: 'Star PT lab', seats: 2, persistent: false, format: 'standard',
  });
  const roomId = mk.json.roomId;
  me.joinRoom(roomId, deckId);
  await me.expectState((s) => s.players.length === 1, 'seated', 8000);
  me.setReady(true);
  await sleep(4500); // oracle prefetch
  me.send({ type: 'room.start' });
  await me.expectState((s) => s.started, 'started', 10_000);
  me.act({ kind: 'mull.keep', bottomIids: [] });
  await me.expectState((s) => s.players[0].mulligan?.state === 'kept', 'hand kept', 20_000);
  t.ok(!me.lastState().settings?.enforced, 'this table is freeform');

  const mine = () => me.lastState().players[0];
  const onBoard = (name) => (mine().battlefield ?? []).find((c) => c.name === name);
  for (const c of [...mine().hand]) me.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
  await me.expectState((s) => s.players[0].handCount === 0, 'hand bottomed', 10_000);

  const used = new Set();
  const fetchTo = async (name, zone, x, y) => {
    const mark = me.mark();
    me.act({ kind: 'library.search' });
    const lib = await me.waitFor((m) => m.type === 'library.cards', { since: mark, timeoutMs: 8000 });
    const card = (lib?.cards ?? []).find((c) => c.name === name && !used.has(c.iid));
    t.ok(card, `${name} found`, '');
    if (!card) return null;
    used.add(card.iid);
    me.act({ kind: 'card.move', iid: card.iid, to: zone, ...(x != null ? { x, y } : {}) });
    await me.expectState(
      (s) => s.players[0][zone].some((c) => c.iid === card.iid),
      `${name} -> ${zone}`,
      8000,
    );
    return card.iid;
  };

  // ---- 1) Arrives as a real number. It is the only artifact, so 1/1.
  await fetchTo('Master of Etherium', 'battlefield', 0.4, 0.6);
  await me.expectState(
    () => onBoard('Master of Etherium')?.power === '1',
    'a * creature arrives with its real power, not a star',
    8000,
  );
  t.eq(onBoard('Master of Etherium')?.toughness, '1', 'and its toughness');

  // ---- 2) Another artifact grows it.
  const thopter = await fetchTo('Ornithopter', 'battlefield', 0.55, 0.6);
  await me.expectState(
    () => onBoard('Master of Etherium')?.power === '2',
    'a second artifact grows it to 2/2',
    8000,
  );
  await me.expectLog(/Master of Etherium is now 2\/2/, 'and the table is told', { timeoutMs: 6000 });

  await fetchTo('Ornithopter', 'battlefield', 0.68, 0.6);
  await me.expectState(
    () => onBoard('Master of Etherium')?.power === '3',
    'a third artifact makes it 3/3',
    8000,
  );

  // ---- 3) An artifact leaving shrinks it again.
  me.act({ kind: 'card.move', iid: thopter, to: 'graveyard' });
  await me.expectState(
    () => onBoard('Master of Etherium')?.power === '2',
    'losing an artifact shrinks it back to 2/2',
    8000,
  );

  // ---- A non-artifact must not count.
  await fetchTo('Island', 'battlefield', 0.2, 0.85);
  await sleep(900);
  t.eq(onBoard('Master of Etherium')?.power, '2', 'a land is not an artifact');

  await deleteRoom(me, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('star-pt crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'star-pt', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
