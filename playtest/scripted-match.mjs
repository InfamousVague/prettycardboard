// Set up a SCRIPTED match: your deck, a bot opponent, and a library stacked in
// a known order so every draw is the one the test plan expects.
//
// Why this exists: "play a game and see what breaks" finds bugs but cannot
// tell you whether a card did the wrong thing or simply never showed up. This
// deals a known opening hand and a known draw order, so every step of
// docs/liliana-match-plan.md has one expected result you can check against.
//
//   node playtest/scripted-match.mjs                     # build + set the table
//   node playtest/scripted-match.mjs --deck-only         # upload the deck, stop
//   node playtest/scripted-match.mjs --user matt         # seat a different account
//
// The deck is read from the same import file the app takes, so the list here
// and the list you play are the same list. Curated `[pc-…]` art ids are kept:
// the server resolves their oracle identity from the alt-art catalog, so the
// cards keep their faces AND their rules text.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlaytestClient, Assert, sleep } from './lib.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DECK_FILE = process.env.PC_DECK_FILE
  || join(process.env.HOME ?? '', 'Desktop', 'liliana-goth-mommy-b4.txt');
const DECK_NAME = 'Liliana Goth Mommy — Bracket 4';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const USERNAME = value('user', 'pt_alice');
const PASSWORD = value('password', process.env.PC_PASSWORD ?? 'playtest1');

// ---------------------------------------------------------------- decklist

/** Parse the app's own import format: `2 Card Name [pc-art-id]`, `//` sections. */
function parseDeckFile(path) {
  const text = readFileSync(path, 'utf8');
  const out = { commander: [], main: [] };
  let board = 'main';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (/^about$/i.test(line)) { board = 'about'; continue; }
    if (/^commander$/i.test(line)) { board = 'commander'; continue; }
    if (/^deck$/i.test(line)) { board = 'main'; continue; }
    if (board === 'about') continue;
    const m = line.match(/^(\d+)\s+(.+?)(?:\s+\[([^\]]+)\])?$/);
    if (!m) continue;
    out[board].push({ qty: Number(m[1]), name: m[2].trim(), art: m[3] ?? null });
  }
  return out;
}

const UA = { 'User-Agent': 'PrettyCardboard/1.0 (scripted match)', Accept: 'application/json' };
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve every card name at once. Scryfall's collection endpoint takes 75
 * identifiers per call and accepts names, which is both far faster and far
 * politer than one request per card - a name-at-a-time loop gets rate-limited
 * into silence around card twenty, and a decklist that half-resolves produces
 * a table that looks fine and plays wrong.
 */
async function resolveNames(names) {
  const unique = [...new Set(names)];
  const found = new Map();
  for (let i = 0; i < unique.length; i += 75) {
    const chunk = unique.slice(i, i + 75);
    let attempt = 0;
    for (;;) {
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { ...UA, 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) }),
      });
      // Retry ANY failure, not just 429: a chunk that quietly comes back
      // empty drops every card in it, and a deck missing its Swamps looks
      // like a stacking bug three steps later. (That is exactly how this
      // script first failed: one rate-limited chunk, no lands.)
      if (!res.ok && attempt < 5) {
        attempt += 1;
        const after = Number(res.headers.get('retry-after'));
        await sleepMs(Number.isFinite(after) && after > 0 ? after * 1000 : 1500 * attempt);
        continue;
      }
      if (!res.ok) {
        throw new Error(
          `Scryfall refused a batch of ${chunk.length} names (${res.status}) after ${attempt} retries`,
        );
      }
      const json = await res.json().catch(() => ({}));
      for (const c of json.data ?? []) {
        found.set(c.name.toLowerCase(), {
          id: c.id,
          name: c.name,
          typeLine: c.type_line ?? '',
          mv: c.cmc ?? 0,
        });
        // A double-faced card answers to its front face too, which is how
        // decklists name them ("Liliana, Heretical Healer").
        const front = c.card_faces?.[0]?.name;
        if (front) found.set(front.toLowerCase(), found.get(c.name.toLowerCase()));
      }
      break;
    }
    await sleepMs(150);
  }
  return found;
}

// ------------------------------------------------------------------- table

async function main() {
  const t = new Assert('scripted-match');
  const deck = parseDeckFile(DECK_FILE);
  console.log(`Deck file: ${DECK_FILE}`);
  console.log(`  commander: ${deck.commander.length}  main entries: ${deck.main.length}`);

  // Resolve every name once. The alt-art id (when the line names one) becomes
  // the card's id, so the table shows your art; the server maps it back to the
  // real card for rules.
  const entries = [
    ...deck.commander.map((e) => ({ ...e, board: 'commander' })),
    ...deck.main.map((e) => ({ ...e, board: 'main' })),
  ];
  const found = await resolveNames(entries.map((e) => e.name));
  const resolved = [];
  const unresolved = [];
  for (const entry of entries) {
    const card = found.get(entry.name.toLowerCase());
    if (!card) {
      unresolved.push(entry.name);
      continue;
    }
    resolved.push({ ...entry, card });
  }
  if (unresolved.length) {
    console.log(`\n!! ${unresolved.length} card(s) did not resolve: ${unresolved.join(', ')}`);
    throw new Error('decklist did not fully resolve - refusing to build a partial deck');
  }
  const total = resolved.reduce((s, e) => s + e.qty, 0);
  console.log(`Resolved ${resolved.length} distinct, ${total} cards total.\n`);

  const cards = resolved.map((e) => ({
    scryfallId: e.art ?? e.card.id,
    name: e.card.name,
    quantity: e.qty,
    board: e.board,
  }));

  const me = new PlaytestClient(USERNAME, { password: PASSWORD, assert: t });
  await me.ensureUser();
  const list = await me.api('GET', '/api/decks');
  const existing = list.json?.find((d) => d.name === DECK_NAME);
  const payload = { name: DECK_NAME, format: 'commander', game: 'mtg', cards };
  const res = existing
    ? await me.api('PUT', `/api/decks/${existing.id}`, payload)
    : await me.api('POST', '/api/decks', payload);
  t.ok([200, 201].includes(res.status), 'deck uploaded', `status ${res.status}`);
  const deckId = existing ? existing.id : res.json.id;
  console.log(`Deck ready: ${DECK_NAME} (${deckId})`);
  if (flag('deck-only')) {
    console.log('--deck-only: stopping here.');
    process.exit(0);
  }

  // ---- The scripted opening. Named cards are stacked on top in this order,
  // so the opening seven and the first draws are always the same.
  //
  // Chosen to walk the plan: ramp, a sac outlet, an aristocrat payoff, the
  // edict engine, a wrath, and Sheoldred - every mechanic the engine learned
  // this week, in the order the plan exercises them.
  const SCRIPT = [
    'Swamp', 'Sol Ring', 'Swamp', 'Carrion Feeder', 'Swamp',
    'Blood Artist', 'Bitterblossom',
    // draws, in order
    'Swamp', 'Grave Pact', 'Swamp', 'Zulaport Cutthroat', 'Damnation',
    'Swamp', 'Sheoldred, the Apocalypse', 'Swamp', "Liliana's Triumph",
  ];

  await me.connect();
  me.send({ type: 'room.leave' });
  await sleep(300);
  const mk = await me.api('POST', '/api/rooms', {
    name: 'Liliana scripted match', seats: 2, persistent: false, format: 'commander',
  });
  const roomId = mk.json.roomId;
  me.joinRoom(roomId, deckId);
  await me.expectState((s) => s.players.length === 1, 'seated', 8000);
  const settings = me.lastState().settings ?? {};
  // Enforced: every trigger in this plan only fires when the rules engine is
  // running. A freeform table would sit there silently, which is exactly the
  // confusion this plan exists to rule out.
  me.send({ type: 'room.settings', settings: { ...settings, enforced: true } });
  await me.expectState((s) => s.settings?.enforced === true, 'enforced rules on', 8000);
  me.send({ type: 'bot.add', style: 'casual', difficulty: 'normal' });
  await me.expectState((s) => s.players.filter((p) => p.isBot).length === 1, 'bot seated', 15_000);

  console.log('\nWaiting for the oracle to load both decks (custom art resolves one card at a time)…');
  await sleep(45_000);

  me.setReady(true);
  me.send({ type: 'room.start' });
  await me.expectState((s) => s.started, 'match started', 15_000);
  me.act({ kind: 'mull.keep', bottomIids: [] });
  await me.expectState(
    (s) => s.players.every((p) => p.mulligan?.state === 'kept'),
    'hands kept',
    30_000,
  );

  // ---- Stack the deck. Everything in hand goes back, then the scripted cards
  // are placed on top in reverse (each card.move to index 0 pushes the
  // previous one down).
  const mine = () => me.lastState().players.find((p) => p.userId === me.userId);
  for (const c of [...mine().hand]) me.act({ kind: 'card.move', iid: c.iid, to: 'library', index: -1 });
  await me.expectState(
    (s) => s.players.find((p) => p.userId === me.userId)?.handCount === 0,
    'hand returned to the library',
    12_000,
  );

  const placed = [];
  for (const name of [...SCRIPT].reverse()) {
    const mark = me.mark();
    me.act({ kind: 'library.search' });
    const lib = await me.waitFor((m) => m.type === 'library.cards', { since: mark, timeoutMs: 8000 });
    const card = (lib?.cards ?? []).find((c) => c.name === name && !placed.includes(c.iid));
    if (!card) {
      console.log(`  !! ${name} is not in the library - skipped`);
      continue;
    }
    placed.push(card.iid);
    me.act({ kind: 'card.move', iid: card.iid, to: 'library', index: 0 });
    await sleep(220);
  }
  t.eq(placed.length, SCRIPT.length, 'every scripted card was stacked');

  // Draw the opening seven off the stacked top.
  // Read the library back before drawing: this is the one step that has to be
  // right, and asserting it here is the difference between a scripted match
  // and a shuffled one wearing its name.
  const checkMark = me.mark();
  me.act({ kind: 'library.search' });
  const finalLib = await me.waitFor((m) => m.type === 'library.cards', {
    since: checkMark,
    timeoutMs: 8000,
  });
  const top = (finalLib?.cards ?? []).slice(0, SCRIPT.length).map((c) => c.name);
  t.ok(
    top.join('|') === SCRIPT.join('|'),
    'the library is stacked in the scripted order',
    `top: ${top.join(', ')}`,
  );

  // `since` matters: expectState scans history from the beginning by default,
  // and the ORIGINAL opening hand also had seven cards - without a mark this
  // matches that instead, and prints a hand nobody is holding.
  const drawMark = me.mark();
  me.act({ kind: 'draw', count: 7 });
  const dealt = await me.expectState(
    (s) => ((s.players.find((p) => p.userId === me.userId)?.hand ?? []).length) === 7,
    'opening seven dealt',
    12_000,
    { since: drawMark },
  );
  const hand = (dealt?.players.find((p) => p.userId === me.userId)?.hand ?? []).map((c) => c.name);
  t.ok(
    hand.join('|') === SCRIPT.slice(0, 7).join('|'),
    'the opening hand is the scripted seven',
    `got: ${hand.join(', ')}`,
  );

  const code = mk.json.code;
  console.log('\n=====================================================');
  console.log(`  TABLE READY — join code ${code}`);
  console.log(`  Room: ${roomId}`);
  console.log('=====================================================');
  console.log('\nYour opening hand (in order):');
  hand.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));
  console.log('\nYour next draws, in order:');
  SCRIPT.slice(7).forEach((n, i) => console.log(`  draw ${i + 1}: ${n}`));
  console.log('\nOpen the app, join the table with the code above, and follow');
  console.log('docs/liliana-match-plan.md step by step.\n');

  t.finish();
  // The socket stays open a moment so the last actions flush, then this
  // process exits - the TABLE stays up for you to join.
  await sleep(1500);
  process.exit(0);
}

main().catch((err) => {
  console.error('scripted-match failed:', err);
  process.exit(1);
});
