/**
 * Builds the Browse catalog: every Commander precon MTGJSON knows from 2020
 * onward, with full compact decklists, committed as src/data/catalog.json.
 *
 * Unlike the four bundled Final Fantasy precons (sync-precons.mjs - data AND
 * artwork on disk), catalog decks bundle data only; art resolves through the
 * Scryfall image CDN at view time, so 130+ decks cost ~1MB of JSON, not
 * gigabytes of images.
 *
 * Run: npm run sync:catalog
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTPUT = join(ROOT, 'src', 'data', 'catalog.json');
const USER_AGENT = 'PrettyCardboard/0.1 (precon catalog sync)';
const SINCE = '2020-01-01';

// Commander precons MTGJSON types as something other than "Commander Deck".
// (Avatar: The Last Airbender is deliberately absent - its TLA "decks" are
// 6-card Scene Boxes and a reprint bundle, not real precons.)
const EXTRA_FILENAMES = new Set([]);

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const list = await fetchJson('https://mtgjson.com/api/v5/DeckList.json');
const wanted = list.data.filter(
  (deck) =>
    (deck.type === 'Commander Deck' || EXTRA_FILENAMES.has(deck.fileName)) &&
    deck.releaseDate >= SINCE &&
    !/collector.s edition/i.test(deck.name),
);
console.log(`catalog: ${wanted.length} decks`);

const decks = [];
const missing = [];
const failures = [];
for (const [index, entry] of wanted.entries()) {
  try {
    const file = await fetchJson(`https://mtgjson.com/api/v5/decks/${entry.fileName}.json`);
    const data = file.data;
    const commanders = (data.commander ?? [])
      .map((card) => ({
        sid: card.identifiers?.scryfallId ?? null,
        name: card.name,
        ci: card.colorIdentity ?? [],
      }))
      .filter((commander) => commander.sid);
    const cards = compactCards(data.mainBoard, missing, entry.name);
    if (commanders.length === 0 && cards.length === 0) {
      failures.push(`${entry.fileName}: empty`);
      continue;
    }
    decks.push({
      id: slug(entry.name, entry.code),
      name: entry.name,
      code: entry.code,
      date: entry.releaseDate,
      commanders,
      cards,
    });
    if ((index + 1) % 20 === 0) console.log(`  ${index + 1}/${wanted.length}`);
    await sleep(180);
  } catch (error) {
    failures.push(`${entry.fileName}: ${error.message}`);
  }
}

decks.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));

writeFileSync(
  OUTPUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), source: 'https://mtgjson.com/api/v5/', decks }),
);
const bytes = JSON.stringify({ decks }).length;
console.log(`wrote ${decks.length} decks, ${(bytes / 1024 / 1024).toFixed(2)}MB`);
console.log(`cards without scryfall ids: ${missing.length}`);
if (missing.length) console.log(missing.slice(0, 10).join('\n'));
if (failures.length) console.log('FAILURES:\n' + failures.join('\n'));
