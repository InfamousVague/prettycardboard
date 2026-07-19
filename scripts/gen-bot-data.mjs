// Distill src/data/precons.json (MTGJSON) into the compact card knowledge the
// server's bot engine embeds: the four precon deck lists plus per-card
// attributes (mana value, type letters, power/toughness). Rerun after
// sync-precons.mjs whenever the precon data changes.
//   node scripts/gen-bot-data.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'src', 'data', 'precons.json');
const OUTPUT = join(ROOT, 'server', 'src', 'data', 'bot_data.json');

const TYPE_LETTERS = [
  ['Land', 'L'],
  ['Creature', 'C'],
  ['Instant', 'I'],
  ['Sorcery', 'S'],
  ['Artifact', 'A'],
  ['Enchantment', 'E'],
  ['Planeswalker', 'P'],
  ['Battle', 'B'],
];

const source = JSON.parse(readFileSync(SOURCE, 'utf8'));
const attrs = {};
const decks = source.decks.map((deck, index) => {
  const cards = deck.cards.map((card) => {
    const letters = TYPE_LETTERS.filter(([word]) => card.typeLine?.includes(word))
      .map(([, letter]) => letter)
      .join('');
    const entry = { mv: card.manaValue ?? 0, t: letters || 'O' };
    if (card.power != null) entry.p = String(card.power);
    if (card.toughness != null) entry.tg = String(card.toughness);
    attrs[card.id] = entry;
    return { sid: card.id, name: card.name, qty: card.quantity, board: card.board ?? 'main' };
  });
  return { code: `FIC-${index + 1}`, name: deck.name, cards };
});

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify({ decks, attrs }));
const kb = (JSON.stringify({ decks, attrs }).length / 1024).toFixed(1);
console.log(`bot_data.json: ${decks.length} decks, ${Object.keys(attrs).length} cards, ${kb} KB`);
