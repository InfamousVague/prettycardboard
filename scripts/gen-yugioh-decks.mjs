// Build the bots' YU-GI-OH! deck pool from the cached YGOPRODeck catalog.
//
// Why this exists: bots were refused outright at a Yu-Gi-Oh table ("bots only
// play Magic tables"), so the game had no practice opponent at all. A bot
// needs a deck before it can duel, and the two bundled starter decks are far
// too thin a pool - "another bot" would always mean the same duelist.
//
// Source: public/cache/yugioh/catalog.json, the ~14.5k-card catalog that
// scripts/sync-yugioh.mjs already writes for the client. This script does no
// network I/O at all: run sync-yugioh first if the catalog is missing.
//
// Decks are built from ARCHETYPE RECIPES, the same approach the Standard MTG
// pool uses: pick an archetype, take its own monsters/spells/traps, and top up
// the remaining slots with generic cards that fit the slot's shape. The result
// is a coherent 40-card Main Deck with a workable level curve - not a
// netdecked competitive list, and not trying to be one.
//
//   node scripts/gen-yugioh-decks.mjs            # writes the pool
//   node scripts/gen-yugioh-decks.mjs --dry      # print, write nothing
//
// Rerun after a catalog sync. Output:
//   server/src/data/bot_decks_yugioh.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'public', 'cache', 'yugioh', 'catalog.json');
const STARTERS = join(ROOT, 'src', 'data', 'yugioh-starters.json');
const OUTPUT = join(ROOT, 'server', 'src', 'data', 'bot_decks_yugioh.json');

/** How many archetype decks to emit, on top of the bundled starters. */
const DECK_COUNT = 50;

/** Main Deck shape. 40 is the constructed floor and what the deck builder
 *  targets; the monster/spell/trap split is the classic beginner ratio. */
const MAIN_SIZE = 40;
const WANT_MONSTERS = 20;
const WANT_SPELLS = 12;
const WANT_TRAPS = 8;
const MAX_EXTRA = 15;
/** At most three copies of a card name, the game's own limit. */
const MAX_COPIES = 3;

/** Extra Deck frames. Everything else (including ritual and the non-Extra
 *  pendulum frames) is a Main Deck card. */
const EXTRA_FRAMES = new Set([
  'fusion',
  'synchro',
  'xyz',
  'link',
  'fusion_pendulum',
  'synchro_pendulum',
  'xyz_pendulum',
]);

/** Never playable in a duel deck. */
const SKIP_FRAMES = new Set(['token', 'skill']);

// ---------------------------------------------------------------- catalogue

function loadCatalog() {
  let raw;
  try {
    raw = readFileSync(CATALOG, 'utf8');
  } catch {
    console.error(
      `No card catalog at ${CATALOG}.\nRun: node scripts/sync-yugioh.mjs`,
    );
    process.exit(1);
  }
  return JSON.parse(raw).cards.filter((c) => !SKIP_FRAMES.has(c.frameType));
}

const isExtra = (card) => EXTRA_FRAMES.has(card.frameType);
const isMonster = (card) => card.atk != null || card.type.includes('Monster');
const isSpell = (card) => card.frameType === 'spell';
const isTrap = (card) => card.frameType === 'trap';

/** A Link monster has no DEF and no Level; its Link Rating stands in for both
 *  when a deck needs one number to sort by. */
const defOf = (card) => (card.frameType.startsWith('link') ? 0 : (card.def ?? 0));
const levelOf = (card) => card.level ?? card.linkval ?? 0;

/** How many tributes a Normal Summon of this monster costs. The bot's summon
 *  logic reads the same rule off the level it is given here. */
const tributesFor = (level) => (level >= 7 ? 2 : level >= 5 ? 1 : 0);

// ------------------------------------------------------------------ recipes

/**
 * Generic filler, used when an archetype cannot fill a slot from its own
 * cards. Deliberately conservative: low-level beaters that are worth
 * Normal Summoning, and backrow whose subtype the bot can actually act on.
 */
function genericPools(cards) {
  const generic = cards.filter((c) => !c.archetype && !isExtra(c));
  return {
    // Level <=4 with real ATK: the monsters a bot can summon for free and
    // still attack into something.
    lowBeaters: generic
      .filter((c) => isMonster(c) && levelOf(c) <= 4 && (c.atk ?? 0) >= 1500)
      .sort((a, b) => (b.atk ?? 0) - (a.atk ?? 0)),
    // Level 5-6, one tribute.
    midBeaters: generic
      .filter((c) => isMonster(c) && levelOf(c) >= 5 && levelOf(c) <= 6 && (c.atk ?? 0) >= 1800)
      .sort((a, b) => (b.atk ?? 0) - (a.atk ?? 0)),
    // Level 7+, two tributes: only worth it for a real finisher.
    highBeaters: generic
      .filter((c) => isMonster(c) && levelOf(c) >= 7 && (c.atk ?? 0) >= 2400)
      .sort((a, b) => (b.atk ?? 0) - (a.atk ?? 0)),
    spells: generic
      .filter((c) => isSpell(c) && ['Normal', 'Quick-Play', 'Continuous'].includes(c.race ?? ''))
      .sort((a, b) => a.name.localeCompare(b.name)),
    traps: generic
      .filter((c) => isTrap(c) && ['Normal', 'Counter', 'Continuous'].includes(c.race ?? ''))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * YGOPRODeck files a handful of editorial tags in the same `archetype` field
 * as real archetypes ("Recolored counterpart" groups alternate artworks). They
 * name no deck a duelist would build, so they never become one.
 */
const NOT_AN_ARCHETYPE = /\b(counterpart|Signature move|PaniK's monsters)\b|^(Book of|Swarm of|with )/;

/**
 * The archetypes worth building, best-supported first. An archetype needs
 * enough Main Deck monsters to carry a deck; spells, traps and an Extra Deck
 * are topped up generically when it is short.
 */
function rankArchetypes(cards) {
  const byName = new Map();
  for (const card of cards) {
    if (!card.archetype) continue;
    const bucket = byName.get(card.archetype) ?? { monsters: 0, backrow: 0, extra: 0 };
    if (isExtra(card)) bucket.extra += 1;
    else if (isMonster(card)) bucket.monsters += 1;
    else bucket.backrow += 1;
    byName.set(card.archetype, bucket);
  }
  return [...byName.entries()]
    .filter(([name, b]) => b.monsters >= 10 && !NOT_AN_ARCHETYPE.test(name))
    // Support depth, then name, so the pool is stable run to run.
    .sort((a, b) => {
      const score = (x) => x.monsters * 2 + x.backrow + x.extra;
      return score(b[1]) - score(a[1]) || a[0].localeCompare(b[0]);
    })
    .map(([name]) => name);
}

// ------------------------------------------------------------------ builder

/**
 * Fill `want` slots from `pool`, up to MAX_COPIES of a card, appending to
 * `into`. Returns how many slots were actually filled - a caller that asked
 * for more than the pool can give gets the shortfall back rather than a
 * silently short deck.
 */
function fill(into, pool, want, copies = MAX_COPIES) {
  let placed = 0;
  for (const card of pool) {
    if (placed >= want) break;
    if (into.some((e) => e.id === card.id)) continue;
    const qty = Math.min(copies, want - placed);
    into.push({ id: card.id, name: card.name, qty, board: 'main', card });
    placed += qty;
  }
  return placed;
}

function buildDeck(name, cards, generic) {
  const own = cards.filter((c) => c.archetype === name);
  const ownMain = own.filter((c) => !isExtra(c));
  const ownExtra = own.filter((c) => isExtra(c));

  // Monsters, split by what a Normal Summon costs. A deck of nothing but
  // Level 8s cannot put a monster on the board before turn three.
  const byTribute = (list, t) =>
    list
      .filter((c) => isMonster(c) && tributesFor(levelOf(c)) === t)
      .sort((a, b) => (b.atk ?? 0) - (a.atk ?? 0));
  const slots = [
    // [own pool, generic fallback, how many]
    [byTribute(ownMain, 0), generic.lowBeaters, 12],
    [byTribute(ownMain, 1), generic.midBeaters, 5],
    [byTribute(ownMain, 2), generic.highBeaters, 3],
  ];

  const entries = [];
  let monsters = 0;
  for (const [ownPool, genericPool, want] of slots) {
    const placed = fill(entries, ownPool, want);
    monsters += placed + fill(entries, genericPool, want - placed);
  }
  // Whatever the curve came up short on, make up with free-summon beaters:
  // the deck must reach its monster count or it bricks.
  monsters += fill(entries, generic.lowBeaters, WANT_MONSTERS - monsters);

  let spells = fill(entries, ownMain.filter(isSpell), WANT_SPELLS);
  spells += fill(entries, generic.spells, WANT_SPELLS - spells);
  let traps = fill(entries, ownMain.filter(isTrap), WANT_TRAPS);
  traps += fill(entries, generic.traps, WANT_TRAPS - traps);

  // Round the Main Deck to exactly MAIN_SIZE. Short decks take more backrow
  // (adding monsters would skew the curve the slots just set); a long one
  // trims copies off the tail.
  let total = monsters + spells + traps;
  if (total < MAIN_SIZE) {
    total += fill(entries, generic.traps, MAIN_SIZE - total);
    total += fill(entries, generic.spells, MAIN_SIZE - total);
  }
  for (let i = entries.length - 1; i >= 0 && total > MAIN_SIZE; i -= 1) {
    const take = Math.min(entries[i].qty, total - MAIN_SIZE);
    entries[i].qty -= take;
    total -= take;
  }
  const main = entries.filter((e) => e.qty > 0);
  if (total !== MAIN_SIZE) return null;

  const extra = [];
  fill(extra, ownExtra.sort((a, b) => (b.atk ?? 0) - (a.atk ?? 0)), MAX_EXTRA, 1);
  for (const e of extra) e.board = 'commander';

  return {
    code: `YGO-${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    // Some archetype tags carry the hyphen that joins them to a card name
    // ("Gem-" for the Gem-Knights); it reads as a typo on a deck plate.
    name: name.replace(/[\s-]+$/, ''),
    game: 'yugioh',
    cards: [...main, ...extra].map(({ id, name: cardName, qty, board }) => ({
      sid: id,
      name: cardName,
      qty,
      board,
    })),
    used: [...main, ...extra].map((e) => e.card),
  };
}

// ------------------------------------------------------------------ starters

/**
 * The two hand-authored starter decks that already ship for new players. They
 * are real product lists rather than generated ones, so they lead the pool.
 */
function starterDecks(byId) {
  const { starters } = JSON.parse(readFileSync(STARTERS, 'utf8'));
  return starters.map((s) => ({
    code: `YGO-${s.id.replace(/^ygo-/, '')}`,
    name: s.name,
    game: 'yugioh',
    cards: s.cards.map((c) => ({ sid: c.id, name: c.name, qty: c.qty, board: c.board })),
    used: s.cards.map((c) => byId.get(c.id)).filter(Boolean),
  }));
}

// ---------------------------------------------------------------------- run

const cards = loadCatalog();
const byId = new Map(cards.map((c) => [c.id, c]));
const generic = genericPools(cards);
const decks = starterDecks(byId);

for (const archetype of rankArchetypes(cards)) {
  if (decks.length >= DECK_COUNT + 2) break;
  const deck = buildDeck(archetype, cards, generic);
  if (deck) decks.push(deck);
}

// One attribute row per card any deck actually uses. `k` is the kind the bot
// branches on (M/S/T), `lv` the Level (tribute cost), `atk`/`def` the battle
// numbers, `x` marks an Extra Deck card the bot must not try to Normal Summon.
const attrs = {};
for (const deck of decks) {
  for (const card of deck.used) {
    if (!card || attrs[card.id]) continue;
    const row = { k: isMonster(card) ? 'M' : isSpell(card) ? 'S' : 'T' };
    if (row.k === 'M') {
      row.lv = levelOf(card);
      row.atk = card.atk ?? 0;
      row.def = defOf(card);
      if (isExtra(card)) row.x = true;
    } else {
      // Spell/Trap subtype: the bot only ever needs to know whether a card
      // belongs in the Field Zone, which is its own single slot.
      row.sub = card.race ?? 'Normal';
    }
    attrs[card.id] = row;
  }
  delete deck.used;
}

const out = { decks, attrs };
const dry = process.argv.includes('--dry');

for (const deck of decks) {
  const main = deck.cards.filter((c) => c.board === 'main').reduce((s, c) => s + c.qty, 0);
  const extra = deck.cards.filter((c) => c.board === 'commander').reduce((s, c) => s + c.qty, 0);
  const monsters = deck.cards
    .filter((c) => c.board === 'main' && attrs[c.sid]?.k === 'M')
    .reduce((s, c) => s + c.qty, 0);
  console.log(
    `${deck.code.padEnd(28)} main=${String(main).padStart(2)} ` +
      `mon=${String(monsters).padStart(2)} extra=${String(extra).padStart(2)}  ${deck.name}`,
  );
}
console.log(`\n${decks.length} decks, ${Object.keys(attrs).length} card attrs`);

if (dry) {
  console.log('(dry run - nothing written)');
} else {
  writeFileSync(OUTPUT, `${JSON.stringify(out)}\n`);
  console.log(`wrote ${OUTPUT}`);
}
