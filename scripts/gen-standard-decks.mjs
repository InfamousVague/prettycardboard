// Build the bots' STANDARD deck pool from the live Standard card pool.
//
// Why this exists: the bots' only decks were the four Final Fantasy Commander
// precons, and deck choice ignored the table's format - so a bot seated at a
// Standard table brought a 100-card Commander deck. This script writes a pool
// of Standard-LEGAL 60-card decks so a Standard table gets a real opponent,
// and so "another bot" means "another deck".
//
// Source: Scryfall's public search API (documented, rate-limited politely
// here). Decks are composed from ARCHETYPE RECIPES rather than netdecked, so
// the output is reproducible from nothing but this file plus Scryfall, with
// no third-party terms to honour and no scraping. Each recipe names its
// colours, how it wants to win, and the shape of its curve; the builder fills
// those slots from the best-ranked legal cards that fit.
//
//   node scripts/gen-standard-decks.mjs            # writes the pool
//   node scripts/gen-standard-decks.mjs --dry      # print, write nothing
//
// Rerun after each Standard rotation. Output:
//   server/src/data/bot_decks_standard.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'server', 'src', 'data', 'bot_decks_standard.json');
const UA = 'PrettyCardboard/1.0 (bot deck builder; +https://prettycardboard.com)';

/** Scryfall asks for ~100ms between calls; be a good citizen and exceed it. */
const THROTTLE_MS = 150;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASICS = {
  W: { name: 'Plains', q: 'type:plains type:basic' },
  U: { name: 'Island', q: 'type:island type:basic' },
  B: { name: 'Swamp', q: 'type:swamp type:basic' },
  R: { name: 'Mountain', q: 'type:mountain type:basic' },
  G: { name: 'Forest', q: 'type:forest type:basic' },
};

const COLOR_WORD = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

/** Two-colour guild names, so the decks read like decks. */
const PAIR_NAME = {
  WU: 'Azorius', UB: 'Dimir', BR: 'Rakdos', RG: 'Gruul', GW: 'Selesnya',
  WB: 'Orzhov', UR: 'Izzet', BG: 'Golgari', RW: 'Boros', GU: 'Simic',
};

/**
 * An archetype recipe: what the deck is trying to do, expressed as slot
 * groups. Each slot is a Scryfall query plus how many DISTINCT cards to take
 * and at what copy count. The builder resolves them in order and stops once
 * the spell count is met, so a thin colour degrades to fewer distinct cards
 * rather than an illegal deck.
 */
const RECIPES = [
  {
    key: 'aggro',
    label: 'Aggro',
    lands: 24,
    slots: [
      { q: 'type:creature mv<=2 pow>=2', take: 4, copies: 4 },
      { q: 'type:creature mv=3 pow>=3', take: 2, copies: 4 },
      { q: '(o:"deals damage" or o:"can\'t block") type:instant mv<=3', take: 2, copies: 4 },
      { q: 'type:creature mv<=4', take: 2, copies: 2 },
    ],
  },
  {
    key: 'midrange',
    label: 'Midrange',
    lands: 24,
    slots: [
      { q: 'type:creature mv=2', take: 2, copies: 4 },
      { q: 'type:creature mv=3', take: 2, copies: 4 },
      { q: 'type:creature mv=4', take: 2, copies: 3 },
      { q: 'type:creature mv=5', take: 1, copies: 2 },
      { q: '(o:destroy or o:exile) (type:instant or type:sorcery) mv<=4', take: 3, copies: 3 },
    ],
  },
  {
    key: 'control',
    label: 'Control',
    lands: 26,
    slots: [
      { q: 'o:"counter target spell" type:instant', take: 3, copies: 4 },
      { q: '(o:destroy or o:exile) (type:instant or type:sorcery) mv<=4', take: 3, copies: 3 },
      { q: 'o:"draw" (type:instant or type:sorcery) mv<=4', take: 2, copies: 3 },
      { q: 'type:creature mv>=4', take: 2, copies: 2 },
    ],
  },
  {
    key: 'ramp',
    label: 'Ramp',
    lands: 25,
    slots: [
      { q: '(o:"search your library for a" o:land) mv<=3', take: 2, copies: 4 },
      { q: 'type:creature mv<=3 o:"add"', take: 2, copies: 4 },
      { q: 'type:creature mv>=6', take: 3, copies: 3 },
      { q: 'type:creature mv=5', take: 2, copies: 2 },
    ],
  },
  {
    key: 'tempo',
    label: 'Tempo',
    lands: 23,
    slots: [
      { q: 'type:creature mv<=2', take: 3, copies: 4 },
      { q: '(o:flying or keyword:flash) type:creature mv<=4', take: 3, copies: 3 },
      { q: '(o:"return target" or o:"counter target") type:instant mv<=3', take: 3, copies: 3 },
      { q: 'type:instant mv<=2', take: 2, copies: 2 },
    ],
  },
];

/** The colour identities each recipe is offered, mono first then the guilds. */
const MONO = ['W', 'U', 'B', 'R', 'G'];
const PAIRS = ['WU', 'UB', 'BR', 'RG', 'GW', 'WB', 'UR', 'BG', 'RW', 'GU'];

/** Responses are cached on disk so a rerun (or a crash halfway through)
 *  costs Scryfall nothing. Delete the file to force a refresh - which is what
 *  you want after a rotation. */
const CACHE_FILE = join(ROOT, 'scripts', '.scryfall-cache.json');
let diskCache = {};
try {
  diskCache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
} catch {
  diskCache = {};
}
function saveCache() {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(diskCache));
  } catch {
    /* a cache that cannot be written is not worth failing a build over */
  }
}

async function scry(query) {
  if (diskCache[query]) return diskCache[query];
  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=edhrec&unique=cards`;
  // Scryfall rate-limits at ~10 req/s and answers 429 when pushed; back off
  // and retry rather than dropping a deck on the floor.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    await sleep(THROTTLE_MS);
    if (res.status === 404) {
      diskCache[query] = [];
      return [];
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after') ?? 0) * 1000 || 2000 * 2 ** attempt;
      process.stderr.write(`\n  ${res.status} - waiting ${Math.round(wait / 1000)}s\n`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`Scryfall ${res.status} for ${query}`);
    const body = await res.json();
    const data = body.data ?? [];
    // Trim to what the builder reads; the raw payload is enormous.
    diskCache[query] = data.map((c) => ({
      id: c.id,
      name: c.name,
      type_line: c.type_line,
      mana_cost: c.mana_cost,
      cmc: c.cmc,
      power: c.power,
      toughness: c.toughness,
      layout: c.layout,
    }));
    saveCache();
    return diskCache[query];
  }
  throw new Error(`Scryfall kept rate-limiting: ${query}`);
}

/** Cards usable in a deck of exactly these colours: no off-colour pips, no
 *  lands (lands are handled separately), nothing banned in the format. */
function colorClause(colors) {
  // `id<=WU` keeps colour identity inside the deck; `-t:land` since the mana
  // base is basics only (see the note in build()).
  return `format:standard -type:land id<=${colors} -is:funny`;
}

const cache = new Map();
async function pool(colors, extra) {
  const key = `${colors}|${extra}`;
  if (cache.has(key)) return cache.get(key);
  const cards = await scry(`${colorClause(colors)} ${extra}`);
  cache.set(key, cards);
  return cards;
}

/** Cards a deck may hold four of; legendaries and one-ofs stay singleton-ish. */
function maxCopies(card, wanted) {
  if (/\bLegendary\b/.test(card.type_line) && /Creature/.test(card.type_line)) {
    return Math.min(wanted, 2);
  }
  return wanted;
}

async function build(recipe, colors) {
  const chosen = new Map();
  let spells = 0;
  const want = 60 - recipe.lands;
  for (const slot of recipe.slots) {
    if (spells >= want) break;
    const cards = await pool(colors, slot.q);
    let taken = 0;
    for (const card of cards) {
      if (taken >= slot.take || spells >= want) break;
      if (chosen.has(card.id)) continue;
      // Scryfall returns every printing shape; skip anything that cannot sit
      // in a 60-card deck as a normal card.
      if (card.layout === 'token' || card.layout === 'emblem') continue;
      const copies = Math.min(maxCopies(card, slot.copies), want - spells);
      if (copies <= 0) continue;
      chosen.set(card.id, { sid: card.id, name: card.name, qty: copies, board: 'main', card });
      spells += copies;
      taken += 1;
    }
  }
  // TOP UP to the recipe's full spell count. The slots express what the deck
  // WANTS; a thin colour will not fill them, and a 47-card deck is not a
  // Standard deck. Anything legal and on-colour finishes the job.
  if (spells < want) {
    const filler = await pool(colors, 'mv<=5');
    for (const card of filler) {
      if (spells >= want) break;
      if (chosen.has(card.id)) continue;
      if (card.layout === 'token' || card.layout === 'emblem') continue;
      const copies = Math.min(maxCopies(card, 3), want - spells);
      if (copies <= 0) continue;
      chosen.set(card.id, { sid: card.id, name: card.name, qty: copies, board: 'main', card });
      spells += copies;
    }
  }
  // Still short (a genuinely tiny pool): raise the copy count of what we have
  // rather than ship an illegal list.
  if (spells < want) {
    for (const c of chosen.values()) {
      if (spells >= want) break;
      const room = Math.min(4, maxCopies(c.card, 4)) - c.qty;
      if (room <= 0) continue;
      const add = Math.min(room, want - spells);
      c.qty += add;
      spells += add;
    }
  }
  if (spells < want) return null; // cannot make a legal deck from this pool

  // The mana base is BASIC LANDS ONLY, split by the deck's pip demand. Duals
  // would be better Magic, but a bot that stumbles on colours is a worse
  // opponent than one with a clean base, and basics can never be off-format.
  const pips = {};
  for (const c of chosen.values()) {
    for (const sym of (c.card.mana_cost ?? '').matchAll(/\{([WUBRG])\}/g)) {
      pips[sym[1]] = (pips[sym[1]] ?? 0) + c.qty;
    }
  }
  const cols = colors.split('');
  const total = cols.reduce((sum, c) => sum + (pips[c] ?? 1), 0);
  // Whatever the spells came to, the lands make the deck exactly 60.
  const landCount = 60 - spells;
  const lands = [];
  let placed = 0;
  cols.forEach((c, i) => {
    const share = i === cols.length - 1
      ? landCount - placed
      : Math.max(1, Math.round((landCount * (pips[c] ?? 1)) / total));
    placed += share;
    lands.push({ color: c, qty: share });
  });

  const cards = [...chosen.values()].map(({ card, ...rest }) => rest);
  return { cards, lands, spells };
}

async function main() {
  const dry = process.argv.includes('--dry');
  const basics = {};
  for (const [color, spec] of Object.entries(BASICS)) {
    const hit = await scry(`${spec.q} format:standard`);
    if (!hit.length) throw new Error(`no basic ${spec.name} found`);
    basics[color] = { sid: hit[0].id, name: spec.name };
  }

  const decks = [];
  const attrs = {};
  const identities = [...MONO, ...PAIRS];
  // Five recipes over five monos and ten guilds = 75 candidates; we keep the
  // first 50 that build cleanly, interleaved so the pool is not five of one
  // archetype before any of the next.
  const combos = [];
  for (const ident of identities) {
    for (const recipe of RECIPES) combos.push({ recipe, colors: ident });
  }
  combos.sort((a, b) => RECIPES.indexOf(a.recipe) - RECIPES.indexOf(b.recipe));

  for (const { recipe, colors } of combos) {
    if (decks.length >= 50) break;
    process.stderr.write(`building ${colors} ${recipe.key}... `);
    let built;
    try {
      built = await build(recipe, colors);
    } catch (err) {
      process.stderr.write(`failed (${err.message})\n`);
      continue;
    }
    if (!built) {
      process.stderr.write('too thin, skipped\n');
      continue;
    }
    const name = colors.length === 1
      ? `Mono-${COLOR_WORD[colors]} ${recipe.label}`
      : `${PAIR_NAME[colors] ?? colors} ${recipe.label}`;
    const cards = [...built.cards];
    for (const { color, qty } of built.lands) {
      if (qty <= 0) continue;
      cards.push({ sid: basics[color].sid, name: basics[color].name, qty, board: 'main' });
      attrs[basics[color].sid] = { mv: 0, t: 'L' };
    }
    decks.push({ code: `STD-${colors}-${recipe.key}`, name, format: 'standard', cards });
    process.stderr.write(`${built.spells} spells + ${cards.length - built.cards.length} land entries\n`);
  }

  // Attributes for every nonland card in the pool, pulled from the cached
  // Scryfall payloads so no extra requests are made.
  const TYPE_LETTERS = [
    ['Land', 'L'], ['Creature', 'C'], ['Instant', 'I'], ['Sorcery', 'S'],
    ['Artifact', 'A'], ['Enchantment', 'E'], ['Planeswalker', 'P'], ['Battle', 'B'],
  ];
  for (const cards of cache.values()) {
    for (const card of cards) {
      if (attrs[card.id]) continue;
      const letters = TYPE_LETTERS.filter(([w]) => (card.type_line ?? '').includes(w))
        .map(([, l]) => l)
        .join('');
      const entry = { mv: card.cmc ?? 0, t: letters || 'O' };
      if (card.power != null) entry.p = String(card.power);
      if (card.toughness != null) entry.tg = String(card.toughness);
      attrs[card.id] = entry;
    }
  }
  // Only keep attributes for cards actually in a deck - the cache holds every
  // search hit, and the server should not carry a pool it never plays.
  const used = new Set(decks.flatMap((d) => d.cards.map((c) => c.sid)));
  for (const id of Object.keys(attrs)) if (!used.has(id)) delete attrs[id];

  const out = { decks, attrs };
  process.stderr.write(`\n${decks.length} decks, ${Object.keys(attrs).length} card attrs\n`);
  if (dry) {
    for (const d of decks) {
      const n = d.cards.reduce((s, c) => s + c.qty, 0);
      process.stdout.write(`${d.code.padEnd(18)} ${String(n).padStart(3)} cards  ${d.name}\n`);
    }
    return;
  }
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(out)}\n`);
  process.stderr.write(`wrote ${OUTPUT}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
