// Build the bots' COMMANDER deck pool from every Commander precon ever printed.
//
// Why this exists: the pool was the four Final Fantasy precons that ship in
// src/data/precons.json, and a roulette pod is five seats. Four decks for five
// seats meant a duplicate was unavoidable and the same four decks came up every
// single game - "it doesn't feel like we're going through all the precons",
// because we were going through all four of them.
//
// SERVER-ONLY, and that is the point of it being a separate file from
// sync-precons.mjs. That script writes src/data/precons.json, which carries the
// full card record the deck browser renders from - roughly 210KB per deck. At
// 170-odd decks that is ~37MB shipped to every browser. The bots and the
// roulette dealer need only ids, names, counts and boards, which is about 9KB
// per deck, so this writes its own compact pool and leaves precons.json alone.
//
//   node scripts/sync-commander-pool.mjs            # writes the pool
//   node scripts/sync-commander-pool.mjs --dry      # counts only, writes nothing
//   node scripts/sync-commander-pool.mjs --limit 20 # a quick partial run
//
// Output: server/src/data/bot_decks_commander.json
//
// Source is MTGJSON, the same place sync-precons.mjs already pulls from, so
// there is no new dependency and no scraping. Its DeckList index names every
// deck it has; we take the ones typed "Commander Deck".
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'server', 'src', 'data', 'bot_decks_commander.json');
const ATTR_SOURCE = join(ROOT, 'server', 'src', 'data', 'bot_data.json');
const USER_AGENT = 'PrettyCardboard/0.1 (precon pool sync)';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || Infinity;

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A stable, unique, readable deck code.
 *
 * MTGJSON's own `code` is the SET code, which several decks share - the five
 * 2022 Commander decks are all "NCC" - so it cannot identify a deck. The FILE
 * name is unique, so that is the source.
 *
 * The set suffix is KEPT. Stripping it read better and collided: eight pairs of
 * decks share a base name across printings, and the server keys a dealt deck as
 * `precon:<code>` and avoids duplicates by comparing codes - so two decks under
 * one code are one deck as far as the dealer is concerned, and a reroll off
 * either of them could hand back the other.
 */
function deckCode(fileName) {
  return fileName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The decklist itself, for spotting the same deck under two names. */
function decklistSignature(cards) {
  return cards
    .map((card) => `${card.sid}x${card.qty}`)
    .sort()
    .join('|');
}

/** MTGJSON board -> the board name the server's build_zones understands. */
function cardsFrom(deck) {
  const out = [];
  const take = (list, board) => {
    for (const card of list ?? []) {
      const sid = card.identifiers?.scryfallId;
      // A card with no Scryfall id cannot be rendered or looked up, and a deck
      // that is short a few cards still plays - so skip the card, not the deck.
      if (!sid) continue;
      out.push({ sid, name: card.name, qty: card.count ?? 1, board });
    }
  };
  take(deck.commander, 'commander');
  take(deck.mainBoard, 'main');
  // Sideboards are deliberately dropped: Commander has no sideboard, and what
  // MTGJSON records there for these products is usually the display commander
  // or a foil variant already counted in the main board.
  return out;
}

async function main() {
  console.log('Fetching the MTGJSON deck index...');
  const index = await fetchJson('https://mtgjson.com/api/v5/DeckList.json');
  const all = index.data.filter((deck) => deck.type === 'Commander Deck');

  // Collector's Editions are the same decklist in different printings. Keeping
  // both would put two decks in the pool that play identically, which is
  // exactly the sameness this is meant to cure.
  const wanted = all
    .filter((deck) => !/Collector'?s Edition/i.test(deck.name))
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))
    .slice(0, LIMIT);

  console.log(`  ${all.length} Commander decks, ${wanted.length} after dropping Collector's Editions`);
  if (DRY) return;

  const decks = [];
  const seenLists = new Set();
  let failed = 0;
  let duplicates = 0;
  for (const [index_, entry] of wanted.entries()) {
    try {
      const payload = await fetchJson(`https://mtgjson.com/api/v5/decks/${entry.fileName}.json`);
      const cards = cardsFrom(payload.data);
      // A "Commander deck" with no commander is a data oddity, not a deck the
      // dealer should hand anyone - it would seat a player with no general.
      if (!cards.some((card) => card.board === 'commander')) {
        console.warn(`  skip ${entry.name}: no commander`);
        failed += 1;
        continue;
      }
      // Reprints carry the same decklist under a new product name, and the
      // four bundled Final Fantasy precons are in this index too - so the pool
      // would otherwise hold several decks that play identically, which is the
      // sameness this whole exercise is meant to cure.
      const signature = decklistSignature(cards);
      if (seenLists.has(signature)) {
        duplicates += 1;
        continue;
      }
      seenLists.add(signature);
      decks.push({
        code: deckCode(entry.fileName),
        name: entry.name,
        format: 'commander',
        game: 'mtg',
        released: entry.releaseDate,
        cards,
      });
    } catch (error) {
      console.warn(`  skip ${entry.name}: ${error.message}`);
      failed += 1;
    }
    if ((index_ + 1) % 20 === 0) console.log(`  ${index_ + 1}/${wanted.length}`);
    // MTGJSON is a free static host; this is a courtesy, not a rate limit.
    await sleep(120);
  }

  // Card attributes are shared across every deck and keyed by Scryfall id, so
  // they grow with UNIQUE cards rather than with decks. The four bundled precons
  // already contribute theirs; anything new is simply absent, and the bot falls
  // back to reading the card at the table the same way it does for a human's
  // deck. Carried forward rather than regenerated so this script never has to
  // fetch card data at all.
  const attrs = JSON.parse(readFileSync(ATTR_SOURCE, 'utf8')).attrs ?? {};

  const payload = { decks, attrs };
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(payload));
  const bytes = readFileSync(OUTPUT).length;
  const unique = new Set(decks.flatMap((deck) => deck.cards.map((card) => card.sid))).size;
  console.log(`\nwrote ${OUTPUT}`);
  console.log(`  ${decks.length} decks, ${failed} skipped, ${duplicates} duplicate decklists dropped`);
  const codes = new Set(decks.map((deck) => deck.code));
  if (codes.size !== decks.length) {
    throw new Error(`deck codes are not unique: ${decks.length} decks, ${codes.size} codes`);
  }
  console.log(`  ${unique} unique cards, ${(bytes / 1024 / 1024).toFixed(2)}MB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
