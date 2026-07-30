/**
 * Builds the real pack data: Wizards' actual booster collation, and every
 * Secret Lair drop as its own openable product.
 *
 * WHY THIS EXISTS
 *
 * The simulator in src/app/data/boosters.ts infers a pack from a set's release
 * DATE - 15 cards before Zendikar Rising, a Play Booster after Karlov Manor,
 * and so on. That is a decent model of the era, but it is still a guess: it
 * cannot know that Foundations puts a Special Guest in 12 packs out of 1000,
 * or which 80 of the set's commons are actually on the common sheet.
 *
 * MTGJSON knows, because it publishes the collation itself: weighted booster
 * configurations over named sheets, each sheet a list of cards with per-card
 * weights. This script distils that into something a browser can hold.
 *
 * It also solves a problem Scryfall cannot: Scryfall has no Secret Lair drop
 * objects at all - all ~2600 cards sit in one flat `sld` set, so "the SpongeBob
 * drop" is unfindable. MTGJSON files each drop as a sealed product with a name
 * and a card list, which is exactly a pack you can open.
 *
 * WHERE THE OUTPUT GOES
 *
 * public/cache/packs/, alongside the bundled card images sync-precons.mjs
 * writes - so this ships with both the web build and the desktop app, needs no
 * server route, and works offline. Nothing here is fetched at runtime except
 * the files themselves.
 *
 * One 169MB tarball rather than ~800 polite HTTP requests, the same trade
 * sync-catalog.mjs makes: MTGJSON publishes every set file in one archive.
 *
 * Run: npm run sync:packs
 *      PC_SETS_DIR=/path/to/AllSetFiles npm run sync:packs   (skip the download)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, 'public', 'cache', 'packs');
const USER_AGENT = 'PrettyCardboard/0.1 (pack collation sync)';
const ARCHIVE = 'https://mtgjson.com/api/v5/AllSetFiles.tar.gz';

/**
 * Which booster to simulate when a set publishes several. Retail first: a Play
 * Booster is what "open a pack" means for a modern set, and a Collector
 * Booster is a different (much more expensive) product that would quietly turn
 * the simulator into a mythic dispenser.
 *
 * `default` is MTGJSON's name for the only booster an older set had.
 */
const KIND_PRIORITY = ['play', 'draft', 'set', 'default', 'collector'];

/**
 * MTGJSON sheet names are per-set marketing ("rareMythicWithShowcase",
 * "specialGuest", "borderlessVoteMythic"), so they cannot be enumerated. The
 * app only needs to know which of its six slots a card came out of - that is
 * what splits "the goods" from "the rest" in the reveal - so the name is
 * classified rather than mapped. Order matters: "foilLand" is a land.
 */
function classifySheet(name) {
  const key = name.toLowerCase();
  if (key.includes('land') && !key.includes('legend')) return 'land';
  if (key.includes('uncommon')) return 'uncommon';
  if (key.includes('mythic') || key.includes('rare')) return 'rare';
  if (key.includes('common')) return 'common';
  if (key.includes('foil')) return 'foil';
  return 'wildcard';
}

/**
 * The app knows four rarities; MTGJSON prints six.
 *
 * `special` is the timeshifted/Mystical Archive band and `bonus` is the
 * masterpiece band - Expeditions, Inventions, Invocations. Both are the card
 * you opened the box for, so they land as rare rather than defaulting to
 * common, which is where they went when this only knew the four.
 */
const RARITY = new Map([
  ['common', 'common'],
  ['uncommon', 'uncommon'],
  ['rare', 'rare'],
  ['mythic', 'mythic'],
  ['special', 'rare'],
  ['bonus', 'rare'],
]);

function toRarity(value) {
  return RARITY.get(value) ?? 'common';
}

/**
 * One card, as a positional tuple. Names and ids dominate the file size, so
 * every set's cards are written ONCE into a dictionary and the sheets address
 * them by index - Foundations' foil and wildcard sheets are the same 341 cards,
 * and its cards appear across several sheets each.
 *
 * [scryfallId, name, rarity, colors, collectorNumber, typeLine]
 */
function cardTuple(card) {
  return [
    card.identifiers?.scryfallId ?? '',
    // Universes Beyond printings carry the Magic card's name plus the name it
    // was actually printed under - the SpongeBob drop is Jodah, the Unifier in
    // `name` and SpongeBob SquarePants in `flavorName`. Show what is on the
    // card, which is also what the art will be.
    card.flavorName ?? card.name,
    toRarity(card.rarity),
    (card.colors ?? []).join(''),
    String(card.number ?? ''),
    card.type ?? '',
  ];
}

/** Distil one set's booster collation, or null when it published none.
 *  `pool` is every card MTGJSON knows, by uuid - see the two-pass note below. */
function collation(data, pool) {
  const boosters = data.booster;
  if (!boosters) return null;
  const kind = KIND_PRIORITY.find((name) => boosters[name]?.boosters?.length);
  if (!kind) return null;
  const source = boosters[kind];

  // Sheets reference cards by MTGJSON uuid, which is meaningless to the app.
  // Resolve them, and drop anything unresolvable rather than emitting a sheet
  // slot that would deal a blank card.
  const cards = [];
  const index = new Map();
  const idFor = (uuid) => {
    if (index.has(uuid)) return index.get(uuid);
    const tuple = pool.get(uuid);
    if (!tuple || !tuple[0]) return -1;
    const at = cards.length;
    cards.push(tuple);
    index.set(uuid, at);
    return at;
  };

  const sheets = {};
  for (const [name, sheet] of Object.entries(source.sheets ?? {})) {
    const picks = [];
    for (const [uuid, weight] of Object.entries(sheet.cards ?? {})) {
      const at = idFor(uuid);
      if (at >= 0) picks.push([at, weight]);
    }
    if (picks.length === 0) continue;
    sheets[name] = { slot: classifySheet(name), foil: sheet.foil === true, picks };
  }

  // A configuration that wants a sheet we could not resolve would deal short
  // packs, so it is dropped and the remaining weights carry the distribution.
  const configs = [];
  for (const booster of source.boosters ?? []) {
    const contents = booster.contents ?? {};
    if (Object.keys(contents).some((name) => !sheets[name])) continue;
    configs.push([booster.weight ?? 1, contents]);
  }
  if (configs.length === 0 || cards.length === 0) return null;

  return { code: String(data.code ?? '').toLowerCase(), kind, cards, sheets, configs };
}

/**
 * Every Secret Lair drop in a set file, as an openable product.
 *
 * A drop is a fixed list of cards plus, since 2021, one weighted bonus card -
 * MTGJSON's `variable` block, which is a real chance table (Command Tower at
 * 171 in 200, and so on) rather than something worth inventing.
 */
function drops(data, pool, missing) {
  const decks = new Map();
  for (const deck of data.decks ?? []) decks.set(deck.name, deck);

  const out = [];
  for (const product of data.sealedProduct ?? []) {
    if (product.subtype !== 'secret_lair') continue;
    const contents = product.contents ?? {};
    const deckRefs = contents.deck ?? [];
    if (deckRefs.length === 0) continue;

    const cards = [];
    for (const ref of deckRefs) {
      const deck = decks.get(ref.name);
      if (!deck) continue;
      for (const entry of [...(deck.commander ?? []), ...(deck.mainBoard ?? [])]) {
        const tuple = pool.get(entry.uuid);
        if (!tuple || !tuple[0]) {
          missing.push(`${product.name}: ${entry.uuid}`);
          continue;
        }
        for (let n = 0; n < (entry.count ?? 1); n += 1) cards.push(tuple);
      }
    }
    if (cards.length === 0) continue;

    // The bonus slot. Every config is one possible card with its own weight;
    // the app rolls once across all of them.
    const bonus = [];
    for (const config of contents.variable?.[0]?.configs ?? []) {
      const pick = config.card?.[0];
      const tuple = pick ? pool.get(pick.uuid) : null;
      if (!tuple || !tuple[0]) continue;
      const weight = config.variable_config?.[0]?.chance ?? 1;
      bonus.push([weight, tuple, pick.foil === true]);
    }

    // The product name repeats the set ("Secret Lair Drop Spongebob
    // Squarepants Legends of Bikini Bottom"); the deck's own name is what the
    // drop was actually called. Foil variants share a deck, so the finish has
    // to come off the product name to tell them apart in a list.
    const foil = /\bfoil\b/i.test(product.name);
    const base = decks.get(deckRefs[0].name)?.name ?? product.name;
    out.push({
      id: product.uuid,
      name: foil ? `${base} (Foil)` : base,
      released: product.releaseDate ?? data.releaseDate ?? '',
      set: String(product.setCode ?? data.code ?? '').toLowerCase(),
      foil,
      cards,
      ...(bonus.length ? { bonus } : {}),
    });
  }
  return out;
}

// PC_SETS_DIR points at an already-extracted AllSetFiles, so iterating on the
// distillation below does not re-download 169MB each time.
const cached = process.env.PC_SETS_DIR;
const work = cached ? null : mkdtempSync(join(tmpdir(), 'pc-sets-'));
let dir = cached;
if (!dir) {
  const archive = join(work, 'sets.tar.gz');
  console.log('downloading every MTGJSON set file (169MB)...');
  const response = await fetch(ARCHIVE, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${ARCHIVE}`);
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  execFileSync('tar', ['xzf', archive, '-C', work]);
  dir = join(work, 'AllSetFiles');
}
const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
console.log(`packs: ${files.length} set files on disk`);

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const specs = {};
const products = [];
const failures = [];
const missing = [];
let specBytes = 0;

/**
 * TWO PASSES, because a booster sheet is not confined to its own set. March of
 * the Machine deals Multiverse Legends out of MUL, Wilds of Eldraine deals
 * Enchanting Tales out of WOT, Foundations deals a Special Guest out of SPG -
 * and those uuids resolve against the OTHER file, which the single-file pass
 * has not read. Resolving locally silently dropped three of the biggest sets
 * in the game, so the first pass indexes every card in Magic (~120k tuples,
 * which is why only the distilled tuple is kept, not the MTGJSON card object)
 * and the second pass distils against it.
 */
function read(file) {
  try {
    return JSON.parse(readFileSync(join(dir, file), 'utf8')).data;
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
    return null;
  }
}

const pool = new Map();
for (const file of files) {
  const data = read(file);
  if (!data || data.isOnlineOnly) continue;
  for (const card of data.cards ?? []) pool.set(card.uuid, cardTuple(card));
}
console.log(`packs: ${pool.size} printings indexed`);

for (const file of files) {
  const data = read(file);
  if (!data || data.isOnlineOnly) continue;

  const spec = collation(data, pool);
  if (spec) {
    const body = JSON.stringify(spec);
    writeFileSync(join(OUT_DIR, `${spec.code}.json`), body);
    specBytes += body.length;
    specs[spec.code] = {
      kind: spec.kind,
      // The nominal pack size, from the heaviest configuration - enough for a
      // "15 cards" caption without the app parsing every config to find out.
      size: Object.values(
        spec.configs.reduce((best, config) => (config[0] > best[0] ? config : best))[1],
      ).reduce((sum, n) => sum + n, 0),
    };
  }

  for (const drop of drops(data, pool, missing)) products.push(drop);
}

if (work) rmSync(work, { recursive: true, force: true });

// Newest first, with a stable tiebreak so a re-sync produces the same file.
products.sort(
  (a, b) => b.released.localeCompare(a.released) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
);

const generatedAt = new Date().toISOString();
const productsBody = JSON.stringify({ generatedAt, products });
writeFileSync(join(OUT_DIR, 'products.json'), productsBody);
writeFileSync(
  join(OUT_DIR, 'index.json'),
  JSON.stringify({ generatedAt, source: ARCHIVE, specs, products: products.length }),
);

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)}MB`;
console.log(`wrote ${Object.keys(specs).length} collation specs, ${mb(specBytes)}`);
console.log(`wrote ${products.length} sealed products, ${mb(productsBody.length)}`);
const byKind = new Map();
for (const spec of Object.values(specs)) byKind.set(spec.kind, (byKind.get(spec.kind) ?? 0) + 1);
console.log([...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${n} ${k}`).join('\n'));
console.log(`drop cards without scryfall ids: ${missing.length}`);
if (missing.length) console.log(missing.slice(0, 5).join('\n'));
if (failures.length) console.log('FAILURES:\n' + failures.slice(0, 10).join('\n'));
