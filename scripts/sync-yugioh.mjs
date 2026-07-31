// Pull the Yu-Gi-Oh! TCG card catalog into the repo, the yugioh-game analogue
// of sync-cyberpunk.mjs — with one structural difference forced by scale: the
// pool is ~14,500 cards, so the catalog is NOT a src/data static import (that
// would ride the JS bundle). It lands in public/cache/yugioh/catalog.json and
// the client fetches it lazily at runtime (the packs.ts pattern).
//
// Source: YGOPRODeck's public API (https://ygoprodeck.com/api-guide/).
//   GET https://db.ygoprodeck.com/api/v7/cardinfo.php        (full dump, ~21MB)
//   GET https://db.ygoprodeck.com/api/v7/cardsets.php        (set index, tiny)
// (The set index carries each product's exact tcg_date, which dates the deck
// products below. NOT misc=yes on the dump: that flips some cards' primary id
// to an alt-artwork passcode — Dark Magician 46986414 → 46986420 — which would
// silently re-id the catalog out from under existing decks.)
// Image policy: YGOPRODeck forbids hotlinking images.ygoprodeck.com from apps
// (IP blacklist), so faces are self-hosted: the STARTER deck faces are bundled
// here under public/cache/yugioh/cards/, and everything else is served by our
// API's caching proxy (GET /api/ygo/img/{passcode}), which downloads a face
// from the CDN once, stores it on disk, and serves it forever after.
//
// Card identity is the YGOPRODeck passcode as an UNPADDED decimal string
// (e.g. "46986414" — the API strips leading zeros and its CDN paths use the
// stripped form). It rides the protocol's `scryfallId` slot like cyberpunk's
// Netdeck UUIDs do.
//
//   node scripts/sync-yugioh.mjs          # sync (skips already-cached images)
//   node scripts/sync-yugioh.mjs --force  # re-download every image
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CATALOG_OUT = join(ROOT, 'public', 'cache', 'yugioh', 'catalog.json');
const STARTERS_OUT = join(ROOT, 'src', 'data', 'yugioh-starters.json');
const DECKS_OUT = join(ROOT, 'src', 'data', 'yugioh-decks.json');
const IMAGE_DIR = join(ROOT, 'public', 'cache', 'yugioh', 'cards');
const BACK_OUT = join(ROOT, 'public', 'backs', 'yugioh-classic.jpg');
const API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const SETS_API = 'https://db.ygoprodeck.com/api/v7/cardsets.php';
const IMG_CDN = 'https://images.ygoprodeck.com/images/cards';
const BACK_URL = 'https://images.ygoprodeck.com/images/cards/back_high.jpg';
const FORCE = process.argv.includes('--force');

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

/** frameTypes whose cards live in the Extra Deck. Note the traps: 'ritual' and
 * the plain pendulum frames (normal/effect/ritual_pendulum) are MAIN deck. */
export const EXTRA_FRAMES = new Set([
  'fusion',
  'synchro',
  'xyz',
  'link',
  'fusion_pendulum',
  'synchro_pendulum',
  'xyz_pendulum',
]);

// The two bundled starter decks: classic, beginner-friendly lists built from
// each protagonist's era. Names resolve against the live dump below; a name
// the API no longer knows is reported and dropped (drift tolerance, like the
// cyberpunk OFFICIAL_PRECONS builder).
const STARTERS = [
  {
    id: 'ygo-white-dragon',
    name: 'Legend of the White Dragon',
    cover: 'Blue-Eyes White Dragon',
    main: [
      ['Blue-Eyes White Dragon', 3],
      ['The White Stone of Legend', 2],
      ['Lord of D.', 2],
      ['Alexandrite Dragon', 2],
      ['Luster Dragon', 2],
      ['Vorse Raider', 2],
      ['Kaiser Sea Horse', 2],
      ['Summoned Skull', 1],
      ['Kaibaman', 1],
      ['Polymerization', 2],
      ['Monster Reborn', 1],
      ['Dark Hole', 1],
      ['Mystical Space Typhoon', 2],
      ['Swords of Revealing Light', 1],
      ['Burst Stream of Destruction', 2],
      ["Silver's Cry", 2],
      ['Trade-In', 2],
      ['Mirror Force', 1],
      ['Call of the Haunted', 1],
      ['Waboku', 2],
      ['Compulsory Evacuation Device', 2],
      ['Dust Tornado', 2],
      ['Negate Attack', 2],
    ],
    extra: [
      ['Blue-Eyes Ultimate Dragon', 1],
      ['Blue-Eyes Twin Burst Dragon', 1],
      ['Azure-Eyes Silver Dragon', 1],
    ],
  },
  {
    id: 'ygo-dark-magic',
    name: 'Spellbound Shadows',
    cover: 'Dark Magician',
    main: [
      ['Dark Magician', 3],
      ['Dark Magician Girl', 2],
      ['Skilled Dark Magician', 3],
      ["Magician's Rod", 2],
      ['Breaker the Magical Warrior', 1],
      ['Apprentice Illusion Magician', 2],
      ['Magician of Dark Illusion', 1],
      ['Summoned Skull', 2],
      ['Buster Blader', 1],
      ['Old Vindictive Magician', 1],
      ['Dark Magical Circle', 2],
      ['Thousand Knives', 2],
      ['Dark Magic Attack', 2],
      ["Sage's Stone", 1],
      ['Dark Magic Curtain', 1],
      ['Polymerization', 2],
      ['Monster Reborn', 1],
      ['Dark Hole', 1],
      ['Mystical Space Typhoon', 1],
      ['Magician Navigation', 2],
      ['Eternal Soul', 2],
      ['Mirror Force', 1],
      ['Magic Cylinder', 2],
      ['Call of the Haunted', 1],
      ['Trap Hole', 1],
    ],
    extra: [
      ['Dark Paladin', 1],
      ['The Dark Magicians', 1],
      ['Ebon Illusion Magician', 1],
    ],
  },
];

async function fetchAllCards() {
  const res = await fetch(API, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`cardinfo.php ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body.data)) throw new Error('unexpected cardinfo.php shape (no data array)');
  return body.data;
}

/** set_name → release date (YYYY-MM-DD), from the ~1000-row set index. This is
 * the products' EXACT tcg_date — no need to approximate it from card dates. */
async function fetchSetDates() {
  const res = await fetch(SETS_API, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`cardsets.php ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error('unexpected cardsets.php shape (not an array)');
  return new Map(body.filter((s) => s?.set_name && s.tcg_date).map((s) => [s.set_name, s.tcg_date]));
}

/** Download one image URL to `target`, unless it is already cached. */
async function cacheImage(url, target) {
  if (existsSync(target) && !FORCE) return true;
  const res = await fetch(url, { headers: { Accept: 'image/avif,image/webp,image/*,*/*' } });
  if (!res.ok) {
    console.log(c.red(`  ! image ${res.status} -> ${target.split('/').pop()}`));
    return false;
  }
  writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  return true;
}

/** Small concurrency limiter, well under YGOPRODeck's 20 req/s ceiling. */
async function pool(items, size, worker) {
  let i = 0;
  let done = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
      done++;
      if (done % 15 === 0) process.stdout.write(c.dim(`  …${done}/${items.length}\n`));
    }
  });
  await Promise.all(runners);
}

/** Trim a raw API card to our stable catalog shape. Omitted keys stay omitted
 * (Link monsters send `def: null`; XYZ `level` is printed Rank; pendulum text
 * blocks stay merged in `desc`). Skill/token frames never reach a deck list
 * but stay in the catalog so any id resolves. */
function toCatalog(raw) {
  const card = {
    id: String(raw.id),
    name: raw.name,
    type: raw.type,
    frameType: raw.frameType,
    desc: raw.desc,
    race: raw.race ?? null,
  };
  if (raw.attribute) card.attribute = raw.attribute;
  if (typeof raw.atk === 'number') card.atk = raw.atk;
  if (typeof raw.def === 'number') card.def = raw.def;
  if (typeof raw.level === 'number' && !String(raw.frameType).startsWith('link')) card.level = raw.level;
  if (typeof raw.linkval === 'number') card.linkval = raw.linkval;
  if (typeof raw.scale === 'number') card.scale = raw.scale;
  if (raw.archetype) card.archetype = raw.archetype;
  return card;
}

function buildStarter(def, byName, misses) {
  const resolve = (list, board) =>
    list.flatMap(([name, qty]) => {
      const card = byName.get(name.toLowerCase());
      if (!card) {
        misses.push(`${def.name}: ${name}`);
        return [];
      }
      return [{ id: card.id, name: card.name, qty, board }];
    });
  const cards = [...resolve(def.main, 'main'), ...resolve(def.extra, 'commander')];
  const cover = byName.get(def.cover.toLowerCase());
  return { id: def.id, name: def.name, cover: cover?.id ?? cards[0]?.id ?? '', cards };
}

// --- official deck products ------------------------------------------------
// The Browse page's discover catalog: every official preconstructed deck
// (Starter Decks, Structure Decks, Speed Duel starter decks), rebuilt from the
// same dump — each card carries a card_sets list of its printings, so grouping
// printings by set_name reconstructs each product's card list. Set listings
// carry no per-card counts, so every card is qty 1 (fine for discovery).
//
// YGOPRODeck has named the same product lines both ways over the years
// ("Structure Deck: Fire Kings" but "Machina Mayhem Structure Deck"), so both
// shapes match. Deliberately NOT matched: Speed Duel boxes and boosters
// ("Speed Duel GX: …", "Speed Duel: Battle City Box", "Speed Duel: Arena of
// Lost Souls", tournament/event/demo packs) — those are 200-card boxes or
// booster sets, not pick-up-and-play decks.
const PRODUCT_KINDS = [
  [/^speed duel starter decks?\b/i, 'Speed Duel'],
  [/^structure deck\b/i, 'Structure'],
  [/^starter deck\b/i, 'Starter'],
  [/^2-player starter\b/i, 'Other'],
  [/ structure deck$/i, 'Structure'],
  [/ starter deck$/i, 'Starter'],
  [/^super starter: /i, 'Starter'],
];

/** Promo one-offs ride real product set_names ("Starter Deck 2006: Special
 * Edition" is a single card; "Structure Deck: Deluxe Edition" is two); a
 * listing this thin is a variant printing, not a playable deck. */
const MIN_PRODUCT_CARDS = 10;

function productKind(setName) {
  for (const [re, kind] of PRODUCT_KINDS) if (re.test(setName)) return kind;
  return null;
}

/** "Structure Deck: Dragon's Roar" → "Dragon's Roar"; "Machina Mayhem
 * Structure Deck" → "Machina Mayhem" (the kind column keeps the stripped
 * words). Names with no affix to strip ("Starter Deck 2006") stay whole. */
function productName(setName) {
  const cleaned = setName
    .replace(/^(?:speed duel starter decks?|2-player starter deck|structure deck|starter deck|super starter)\s*:\s*/i, '')
    .replace(/\s+(?:structure|starter) deck$/i, '')
    .trim();
  return cleaned || setName;
}

function slugify(setName) {
  return setName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildDeckProducts(raw, setDates) {
  const bySet = new Map();
  for (const card of raw) {
    if (!Array.isArray(card.card_sets)) continue;
    for (const set of card.card_sets) {
      const setName = set?.set_name;
      if (!setName) continue;
      const kind = productKind(setName);
      if (!kind) continue;
      let product = bySet.get(setName);
      if (!product) {
        product = { setName, kind, cards: new Map(), codes: new Map() };
        bySet.set(setName, product);
      }
      // Product code = the set_code prefix ("SDY-006" → "SDY"); rarity rows
      // repeat cards, so tally prefixes and keep the most common one.
      const prefix = String(set.set_code ?? '').split('-')[0];
      if (prefix) product.codes.set(prefix, (product.codes.get(prefix) ?? 0) + 1);
      if (!product.cards.has(String(card.id))) product.cards.set(String(card.id), card);
    }
  }

  const decks = [];
  for (const product of bySet.values()) {
    const members = [...product.cards.values()];
    // Tokens and Speed Duel skill cards never belong in a deck list.
    const playable = members.filter((card) => card.frameType !== 'token' && card.frameType !== 'skill');
    if (playable.length < MIN_PRODUCT_CARDS) continue;
    // Cover: the beatstick on the box — highest ATK monster, ties alphabetical.
    const monsters = playable
      .filter((card) => typeof card.atk === 'number')
      .sort((a, b) => b.atk - a.atk || a.name.localeCompare(b.name));
    const cover = monsters[0] ?? playable[0];
    const cards = playable
      .map((card) => ({
        id: String(card.id),
        name: card.name,
        qty: 1,
        board: EXTRA_FRAMES.has(card.frameType) ? 'commander' : 'main',
      }))
      .sort((a, b) => (a.board === b.board ? a.name.localeCompare(b.name) : a.board === 'main' ? -1 : 1));
    decks.push({
      id: slugify(product.setName),
      name: productName(product.setName),
      kind: product.kind,
      code: [...product.codes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '',
      date: setDates.get(product.setName) ?? '',
      cover: String(cover.id),
      cards,
    });
  }
  decks.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  // set_name slugs should never collide, but a stale dump must not produce
  // duplicate React keys / deck ids — suffix any repeat.
  const seen = new Map();
  for (const deck of decks) {
    const n = (seen.get(deck.id) ?? 0) + 1;
    seen.set(deck.id, n);
    if (n > 1) deck.id = `${deck.id}-${n}`;
  }
  return decks;
}

async function main() {
  console.log(c.bold('\nSyncing Yu-Gi-Oh! TCG cards from YGOPRODeck\n'));
  mkdirSync(IMAGE_DIR, { recursive: true });
  mkdirSync(dirname(STARTERS_OUT), { recursive: true });

  const raw = await fetchAllCards();
  console.log(`  fetched ${c.bold(String(raw.length))} cards`);

  const cards = raw.map(toCatalog).sort((a, b) => a.name.localeCompare(b.name));
  const byName = new Map(cards.map((card) => [card.name.toLowerCase(), card]));

  // Resolve the starter decks against the live dump.
  const misses = [];
  const starters = STARTERS.map((def) => buildStarter(def, byName, misses));
  for (const miss of misses) console.log(c.red(`  ! unresolved starter card — ${miss}`));

  // Bundle the starter faces (everything else is served by the API img proxy).
  const bundledIds = [...new Set(starters.flatMap((s) => s.cards.map((card) => card.id)))].sort();
  let faces = 0;
  await pool(bundledIds, 4, async (id) => {
    if (await cacheImage(`${IMG_CDN}/${id}.jpg`, join(IMAGE_DIR, `${id}.jpg`))) faces++;
  });
  console.log(`  cached ${c.green(String(faces))}/${bundledIds.length} starter faces`);

  // The classic brown-swirl card back, from the same CDN.
  if (await cacheImage(BACK_URL, BACK_OUT)) console.log(`  cached ${c.green('yugioh-classic')} card back`);

  const catalog = {
    game: 'yugioh',
    source: 'db.ygoprodeck.com',
    fetchedAt: new Date().toISOString(),
    count: cards.length,
    types: [...new Set(cards.map((x) => x.type))].sort(),
    races: [...new Set(cards.map((x) => x.race).filter(Boolean))].sort(),
    attributes: [...new Set(cards.map((x) => x.attribute).filter(Boolean))].sort(),
    cards,
  };
  // Minified on purpose: this file is fetched at runtime, not read by humans.
  writeFileSync(CATALOG_OUT, JSON.stringify(catalog));
  console.log(`\n  wrote ${c.bold('public/cache/yugioh/catalog.json')} (${cards.length} cards)`);

  writeFileSync(STARTERS_OUT, `${JSON.stringify({ starters, bundledIds }, null, 2)}\n`);
  console.log(`  wrote ${c.bold('src/data/yugioh-starters.json')} (${starters.length} starters, ${bundledIds.length} bundled faces)`);

  // The official deck products for the Browse page (see buildDeckProducts).
  const decks = buildDeckProducts(raw, await fetchSetDates());
  const deckPayload = {
    source: 'db.ygoprodeck.com',
    fetchedAt: new Date().toISOString(),
    count: decks.length,
    decks,
  };
  // Pretty while it stays reviewable; minified if it ever balloons.
  const prettyDecks = JSON.stringify(deckPayload, null, 2);
  writeFileSync(DECKS_OUT, prettyDecks.length <= 1_500_000 ? `${prettyDecks}\n` : JSON.stringify(deckPayload));
  console.log(`  wrote ${c.bold('src/data/yugioh-decks.json')} (${decks.length} deck products)`);
  console.log(c.green('\n✓ Yu-Gi-Oh sync complete\n'));
}

main().catch((e) => {
  console.error(c.red(`\n✗ sync failed: ${e.message}\n`));
  process.exit(1);
});
