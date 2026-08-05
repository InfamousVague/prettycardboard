// Build the bots' MOOD SWINGS box pool from the bundled card catalog.
//
// Why this exists: bots were refused outright at a Mood Swings table ("bots
// play Magic and Yu-Gi-Oh tables"), so a game whose whole pitch is "five
// minutes, no deckbuilding" had no opponent you could sit down against alone.
//
// Mood Swings is sold as a BOX: "forty-five randomized cards from a possible
// one hundred thirty-three". The real game deals those 45 as ONE shared pile
// everyone draws from; the freeform engine has no shared zone, so every seat
// brings a box of its own - which is already what a human seat does here (the
// account is seeded one at sign-in, and the new-deck wizard rolls another).
// This script rolls a handful more for the bots to bring.
//
// The boxes are rolled from a FIXED seed, so the pool is stable across reruns
// and a diff only moves when the catalog does. Bots at one table are handed
// different codes (ws::pick_unused), which is why there are more boxes than
// seats.
//
//   node scripts/gen-mood-decks.mjs            # writes the pool
//   node scripts/gen-mood-decks.mjs --dry      # print, write nothing
//
// Rerun after scripts/sync-moodswings.mjs. Output:
//   server/src/data/bot_decks_moodswings.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'src', 'app', 'data', 'moodswingsCards.json');
const OUTPUT = join(ROOT, 'server', 'src', 'data', 'bot_decks_moodswings.json');

/** A box is 45 distinct cards off the 133 - the product, not an approximation
 *  of it. Mirrors BOX_SIZE in src/app/data/moodswings.ts. */
const BOX_SIZE = 45;
/** More boxes than a table has seats (2-4), so four bots never collide. */
const BOX_COUNT = 8;

/** Must match moodSlug() in src/app/data/moodswings.ts: ids ride the protocol's
 *  scryfallId slot, and the client resolves art from this exact string. */
const moodSlug = (name) =>
  `msw-${name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;

/** mulberry32: a seeded PRNG, so the pool is the same every run. Rolling boxes
 *  with Math.random would rewrite all eight of them on every sync. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, rand) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const raw = JSON.parse(readFileSync(CATALOG, 'utf8'));
const cards = raw.cards.map((card) => ({ ...card, id: moodSlug(card.name) }));

const rand = rng(0x4d5357); // "MSW"
const decks = [];
for (let i = 0; i < BOX_COUNT; i += 1) {
  const box = shuffled(cards, rand).slice(0, Math.min(BOX_SIZE, cards.length));
  decks.push({
    code: `MSW-${i + 1}`,
    name: `Mood Swings Box ${i + 1}`,
    game: 'moodswings',
    format: 'standard',
    cards: box.map((card) => ({ sid: card.id, name: card.name, qty: 1, board: 'main' })),
  });
}

// One attribute row per card in the set. `v` is the PRINTED value the bot plays
// by - the first of the two, the same read moodValue() takes client-side. The
// second value is conditional text the server has no oracle for, so the bot
// never pretends to know it. Frame colour is not here: several moods refer to
// colours, but nothing the bot decides turns on one.
const attrs = {};
for (const card of cards) {
  attrs[card.id] = { v: card.values[0] ?? 0 };
}

const out = { decks, attrs };
const dry = process.argv.includes('--dry');

for (const deck of decks) {
  const total = deck.cards.reduce((sum, c) => sum + c.qty, 0);
  const value = deck.cards.reduce((sum, c) => sum + (attrs[c.sid]?.v ?? 0), 0);
  console.log(
    `${deck.code.padEnd(8)} cards=${String(total).padStart(2)} ` +
      `printed value=${String(value).padStart(4)}  ${deck.name}`,
  );
}
console.log(`\n${decks.length} boxes, ${Object.keys(attrs).length} card attrs`);

if (dry) {
  console.log('(dry run - nothing written)');
} else {
  writeFileSync(OUTPUT, `${JSON.stringify(out)}\n`);
  console.log(`wrote ${OUTPUT}`);
}
