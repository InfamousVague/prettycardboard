// Scenario: a card wearing CURATED ART is still the card it is.
//
// This is the bug behind "Sheoldred is in play but the AI didn't take damage
// for drawing". Every fix to the draw trigger was real and none of it helped,
// because the Sheoldred on the table was `pc-sheoldred-the-apocalypse` - a
// synthetic printing id from the alt-art pipeline. The oracle skipped any id
// that was not Scryfall-shaped, so that card arrived with no type line, no
// keywords and no triggers. A deck of custom art played as a deck of blanks:
// no ETB, no deathtouch, no enforcement, nothing.
//
// The alt-art catalog has carried the oracle identity of every art all along
// (it is what the client uses to find the paper printing). The server now
// reads the same file and fetches rules by that identity, caching the parse
// under the art's own id.
import { PlaytestClient, Assert, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

/** Curated art ids and the cards they are. Must exist in the alt-art catalog
 *  the server serves; a fresh install with no catalog skips this scenario. */
const ART = {
  sheoldred: { id: 'pc-sheoldred-the-apocalypse', name: 'Sheoldred, the Apocalypse' },
  pact: { id: 'pc-grave-pact', name: 'Grave Pact' },
  artist: { id: 'pc-blood-artist', name: 'Blood Artist' },
};
const SWAMP = { id: 'f66094ef-059b-4511-aa6e-835906736de4', name: 'Swamp' };

async function main() {
  const t = new Assert('alt-art-oracle');
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await me.ensureUser();

  // The catalog is the whole premise: without it there are no art ids to map.
  const cat = await me.api('GET', '/api/art/catalog');
  const arts = cat.json?.arts ?? [];
  const known = new Set(arts.map((a) => a.id));
  if (!known.has(ART.sheoldred.id)) {
    console.log('no curated art published on this server - nothing to check');
    console.log(`##RESULT## ${JSON.stringify({ name: 'alt-art-oracle', passed: 0, failed: 0, durationMs: 0 })}`);
    process.exit(0);
  }
  t.ok(
    arts.every((a) => a.oracleId),
    'every published art carries the oracle identity the server maps by',
    `${arts.filter((a) => !a.oracleId).length} without one`,
  );

  const payload = {
    name: 'PT Alt Art Lab',
    format: 'commander',
    game: 'mtg',
    cards: [
      ...Object.values(ART).map((a) => ({
        scryfallId: a.id,
        name: a.name,
        quantity: 1,
        board: 'main',
      })),
      { scryfallId: SWAMP.id, name: 'Swamp', quantity: 20, board: 'main' },
    ],
  };
  const list = await me.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === payload.name);
  const res = existing
    ? await me.api('PUT', `/api/decks/${existing.id}`, payload)
    : await me.api('POST', '/api/decks', payload);
  t.ok([200, 201].includes(res.status), 'custom-art deck uploaded', `status ${res.status}`);
  const deckId = existing ? existing.id : res.json.id;

  await me.connect();
  me.send({ type: 'room.leave' });
  await sleep(300);
  const mk = await me.api('POST', '/api/rooms', {
    name: 'Alt art lab', seats: 2, persistent: false, format: 'commander',
  });
  const roomId = mk.json.roomId;
  me.joinRoom(roomId, deckId);
  await me.expectState((s) => s.players.length === 1, 'seated', 8000);
  const settings = me.lastState().settings ?? {};
  me.send({ type: 'room.settings', settings: { ...settings, enforced: true } });
  await me.expectState((s) => s.settings?.enforced === true, 'enforced on', 8000);
  me.setReady(true);
  // Curated art resolves one request per card (there is no batch endpoint for
  // oracle ids), so give the prefetch room.
  await sleep(14_000);
  me.send({ type: 'room.start' });
  await me.expectState((s) => s.started, 'started', 10_000);
  me.act({ kind: 'mull.keep', bottomIids: [] });
  await me.expectState((s) => s.players[0].mulligan?.state === 'kept', 'hand kept', 20_000);

  const mine = () => me.lastState().players[0];
  for (const c of [...mine().hand]) me.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
  await me.expectState((s) => s.players[0].handCount === 0, 'opening hand bottomed', 10_000);

  const fetchTo = async (name, zone, x, y) => {
    const mark = me.mark();
    me.act({ kind: 'library.search' });
    const lib = await me.waitFor((m) => m.type === 'library.cards', { since: mark, timeoutMs: 8000 });
    // A singleton can already have been drawn - the scenario draws a card to
    // fire Sheoldred - so the hand is the second place to look.
    const card = (lib?.cards ?? []).find((c) => c.name === name)
      ?? (me.lastState().players[0].hand ?? []).find((c) => c.name === name);
    t.ok(card, `${name} found`, '');
    if (!card) return null;
    me.act({ kind: 'card.move', iid: card.iid, to: zone, ...(x != null ? { x, y } : {}) });
    await me.expectState(
      (s) => s.players[0][zone].some((c) => c.iid === card.iid),
      `${name} -> ${zone}`,
      8000,
    );
    return card.iid;
  };

  // ---- The headline: the art-id Sheoldred triggers on a draw.
  await fetchTo(ART.sheoldred.name, 'battlefield', 0.4, 0.6);
  const mark = me.mark();
  me.act({ kind: 'draw', count: 1 });
  const state = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === ART.sheoldred.name),
    'a curated-art Sheoldred fires on a draw',
    10_000,
    { since: mark },
  );
  const prompt = (state?.pendingTriggers ?? []).find((p) => p.sourceName === ART.sheoldred.name);
  t.eq(prompt?.when, 'youDraw', 'with the right event');
  t.ok(prompt?.auto, 'and the engine can apply it');
  const life = mine().life;
  me.act({ kind: 'trigger.answer', id: prompt.id, apply: true });
  await me.expectState(
    (s) => s.players[0].life === life + 2,
    'the custom-art card gained me the 2 life it prints',
    8000,
  );

  // ---- ...and so does a curated-art trigger that watches the board.
  for (const p of me.lastState().pendingTriggers ?? []) {
    me.act({ kind: 'trigger.answer', id: p.id, apply: p.auto });
  }
  await me.expectState((s) => (s.pendingTriggers ?? []).length === 0, 'prompts cleared', 10_000);
  await fetchTo(ART.pact.name, 'battlefield', 0.2, 0.5);
  for (const p of me.lastState().pendingTriggers ?? []) {
    me.act({ kind: 'trigger.answer', id: p.id, apply: p.auto });
  }
  await sleep(600);
  const artistIid = await fetchTo(ART.artist.name, 'battlefield', 0.6, 0.6);
  for (const p of me.lastState().pendingTriggers ?? []) {
    me.act({ kind: 'trigger.answer', id: p.id, apply: p.auto });
  }
  await sleep(600);
  const dieMark = me.mark();
  me.act({ kind: 'card.move', iid: artistIid, to: 'graveyard' });
  const died = await me.expectState(
    (s) => (s.pendingTriggers ?? []).some((p) => p.sourceName === ART.pact.name),
    'a curated-art Grave Pact sees a creature die',
    10_000,
    { since: dieMark },
  );
  const pactPrompt = (died?.pendingTriggers ?? []).find((p) => p.sourceName === ART.pact.name);
  t.eq(pactPrompt?.when, 'creatureDies', 'with the right event');

  await me.api('DELETE', `/api/rooms/${roomId}`).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('alt-art-oracle crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'alt-art-oracle', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
