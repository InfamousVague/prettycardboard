/**
 * Builds the Browse catalog: every preconstructed deck Wizards has ever put in
 * a box, from the 1996 theme decks to whatever shipped last month, committed as
 * src/data/catalog.json.
 *
 * Unlike the four bundled Final Fantasy precons (sync-precons.mjs - data AND
 * artwork on disk), catalog decks bundle data only; art resolves through the
 * Scryfall image CDN at view time, so ~1850 decks cost a few MB of JSON, not
 * gigabytes of images.
 *
 * One 240MB tarball rather than ~1850 polite HTTP requests: MTGJSON publishes
 * every deck file in a single archive, which turns a twenty-minute crawl into
 * one download and makes a re-sync cheap enough to actually run.
 *
 * Run: npm run sync:catalog
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTPUT = join(ROOT, 'src', 'data', 'catalog.json');
const USER_AGENT = 'PrettyCardboard/0.1 (precon catalog sync)';
const ARCHIVE = 'https://mtgjson.com/api/v5/AllDeckFiles.tar.gz';

/**
 * MTGJSON files a lot of things as "decks" that nobody can sit down and play.
 * Everything NOT in this list ships; these are the products that are a box, a
 * pile of lands, or a piece of art rather than a deck:
 *
 *   Secret Lair Drop    art drops - four cards in a box, no deck
 *   MTGO Redemption     a set redeemed from Magic Online, not a product deck
 *   Bundle Land Pack    the basic lands out of a bundle
 *   Box Set             a whole set (Chronicles, Renaissance...), not a deck
 *   Sample Deck         partial demo piles, mostly 10-20 cards with no shape
 *   Welcome Booster     a booster pack
 *   San Diego Comic Con Promos   promo cards
 */
const NOT_A_DECK = new Set([
  'Secret Lair Drop',
  'MTGO Redemption',
  'Bundle Land Pack',
  'Box Set',
  'Sample Deck',
  'Welcome Booster',
  'San Diego Comic Con Promos',
]);

/** A deck with fewer real cards than this is a fragment, not a product. */
const MIN_CARDS = 12;

function slug(name, code) {
  return `${name}-${code}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function compactCards(list, missing, deckName) {
  const out = [];
  for (const card of list ?? []) {
    const sid = card.identifiers?.scryfallId;
    if (!sid) {
      missing.push(`${deckName}: ${card.name}`);
      continue;
    }
    out.push([sid, card.name, card.count ?? 1]);
  }
  return out;
}

const BASIC = /^(snow-covered )?(plains|island|swamp|mountain|forest|wastes)$/i;

/** The deck's colour identity, for the browse filter. Commander decks get it
 *  from their commander; everything else is the union of what it plays. */
function deckIdentity(data) {
  const colors = new Set();
  for (const card of data.commander ?? []) for (const c of card.colorIdentity ?? []) colors.add(c);
  if (colors.size > 0) return ['W', 'U', 'B', 'R', 'G'].filter((c) => colors.has(c));
  for (const card of data.mainBoard ?? []) for (const c of card.colorIdentity ?? []) colors.add(c);
  return ['W', 'U', 'B', 'R', 'G'].filter((c) => colors.has(c));
}

/** The card that gets to be the deck's face: its commander, else the first
 *  thing in the list that is not a basic land - MTGJSON keeps mainBoard in
 *  roughly the order the product prints it, so that lands on something real. */
function faceCard(data) {
  const commander = (data.commander ?? []).find((card) => card.identifiers?.scryfallId);
  if (commander) return null; // commanders[] already carries it
  const card = (data.mainBoard ?? []).find(
    (entry) => entry.identifiers?.scryfallId && !BASIC.test(entry.name ?? ''),
  );
  return card ? { sid: card.identifiers.scryfallId, name: card.name } : null;
}

// PC_DECKS_DIR points at an already-extracted AllDeckFiles, so iterating on
// the mapping below does not re-download a quarter-gigabyte each time.
const cached = process.env.PC_DECKS_DIR;
const work = cached ? null : mkdtempSync(join(tmpdir(), 'pc-decks-'));
let dir = cached;
if (!dir) {
  const archive = join(work, 'decks.tar.gz');
  console.log('downloading every MTGJSON deck file...');
  const response = await fetch(ARCHIVE, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${ARCHIVE}`);
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  execFileSync('tar', ['xzf', archive, '-C', work]);
  dir = join(work, 'AllDeckFiles');
}
const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
console.log(`catalog: ${files.length} deck files on disk`);

const decks = [];
const missing = [];
const failures = [];
const skipped = new Map();
for (const file of files) {
  try {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf8')).data;
    const type = data.type ?? 'Deck';
    if (NOT_A_DECK.has(type)) {
      skipped.set(type, (skipped.get(type) ?? 0) + 1);
      continue;
    }
    const commanders = (data.commander ?? [])
      .map((card) => ({
        sid: card.identifiers?.scryfallId ?? null,
        name: card.name,
        ci: card.colorIdentity ?? [],
      }))
      .filter((commander) => commander.sid);
    const cards = compactCards(data.mainBoard, missing, data.name);
    const total = cards.reduce((sum, [, , qty]) => sum + qty, 0) + commanders.length;
    if (total < MIN_CARDS) {
      skipped.set('too small', (skipped.get('too small') ?? 0) + 1);
      continue;
    }
    const face = faceCard(data);
    decks.push({
      id: slug(data.name, data.code),
      name: data.name,
      code: data.code,
      type,
      date: data.releaseDate ?? '',
      ci: deckIdentity(data),
      ...(face ? { face } : {}),
      commanders,
      cards,
    });
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
  }
}
if (work) rmSync(work, { recursive: true, force: true });

// Newest first, and a stable tiebreak so a re-sync produces the same file.
decks.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

writeFileSync(
  OUTPUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), source: 'https://mtgjson.com/api/v5/', decks }),
);
const bytes = JSON.stringify({ decks }).length;
console.log(`wrote ${decks.length} decks, ${(bytes / 1024 / 1024).toFixed(2)}MB`);
const byType = new Map();
for (const deck of decks) byType.set(deck.type, (byType.get(deck.type) ?? 0) + 1);
console.log([...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `  ${n} ${t}`).join('\n'));
console.log('skipped: ' + [...skipped.entries()].map(([t, n]) => `${n} ${t}`).join(', '));
console.log(`cards without scryfall ids: ${missing.length}`);
if (missing.length) console.log(missing.slice(0, 10).join('\n'));
if (failures.length) console.log('FAILURES:\n' + failures.slice(0, 10).join('\n'));
