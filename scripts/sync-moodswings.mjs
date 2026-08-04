// Build the Mood Swings card catalog from Wizards' own two public pages.
//
// Mood Swings is Mark Rosewater's 2-4 player Secret Lair game (set code MSW).
// It is NOT a Magic set, so Scryfall has never heard of it and none of the
// card pipelines this repo already has apply. What it does have is two
// machine-readable pages:
//
//   card-image-gallery/mood-swings  ->  <magic-card face= caption=> per card,
//                                       grouped into colour sections. Art URLs.
//   feature/mood-swings-card-notes  ->  a courier <p> per card carrying
//                                       "Name (Colour Rarity)", the value line,
//                                       and the rules text, followed by a <ul>
//                                       of rulings.
//
// Joining them on the card name gives a complete catalog. Neither page is an
// API, so this script is deliberately loud when the shape it expects moves:
// a silent partial catalog would ship a game missing a third of its cards.
//
//   node scripts/sync-moodswings.mjs           # writes the catalog
//   node scripts/sync-moodswings.mjs --dry     # parse + report, write nothing
//
// Output: src/app/data/moodswingsCards.json
//
// Art is referenced by URL, not downloaded - the same way mtg (Scryfall),
// cyberpunk (CloudFront) and yugioh (YGOPRODeck) art is handled. Nothing
// copyrighted is vendored into the repo.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'src', 'app', 'data', 'moodswingsCards.json');
const GALLERY = 'https://magic.wizards.com/en/news/card-image-gallery/mood-swings';
const NOTES = 'https://magic.wizards.com/en/news/feature/mood-swings-card-notes';
const DRY = process.argv.includes('--dry');
const COLORS = new Set(['white', 'blue', 'black', 'red', 'green']);

/** The gallery stars the headliner ("Love*"); the notes do not. Join on the
 *  plain name and keep the star as a flag rather than part of the identity. */
function splitName(caption) {
  const headliner = caption.endsWith('*');
  return { name: headliner ? caption.slice(0, -1).trim() : caption, headliner };
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (PrettyCardboard card sync)' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

const decode = (s) =>
  s
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');

const strip = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/**
 * Values print as dice faces, which the notes write as bracketed digits. A
 * single die is one digit ("[3]" -> 3) and adjacent dice read as one numeral,
 * not a sum: Altruism's "[6][1]" is sixty-one and Love's "[6][6]" is
 * sixty-six. That reading is what makes them the round-enders their rarity and
 * their conditions imply - a rare that swung a score by seven would not be
 * worth the text on it.
 *
 * "[3]/[6][1]" is a card with a base value and a conditional one; the slash
 * separates them and the first is what it is worth on the table.
 */
function parseValues(line) {
  const parts = line.split('/').map((p) => p.trim()).filter(Boolean);
  const nums = parts.map((part) => {
    const digits = [...part.matchAll(/\[(\d)\]/g)].map((m) => m[1]);
    return digits.length ? Number(digits.join('')) : null;
  });
  return nums.filter((n) => n != null);
}

async function main() {
  console.log('Fetching the card image gallery...');
  const galleryHtml = await fetchText(GALLERY);
  // Each colour lives in its own block, so the section id is the card's colour.
  const art = new Map();
  const groups = new Map();
  const headliners = new Set();
  const blocks = galleryHtml.split(/<div style="display:(?:block|none)" class="activecardblock" id="div([a-z]+)">/);
  for (let i = 1; i < blocks.length; i += 2) {
    const group = blocks[i];
    for (const m of blocks[i + 1].matchAll(/<magic-card face="([^"]+)" caption="([^"]*)"/g)) {
      const { name, headliner } = splitName(decode(m[2]).trim());
      art.set(name, m[1]);
      groups.set(name, group);
      if (headliner) headliners.add(name);
    }
  }
  console.log(`  ${art.size} card images across ${new Set(groups.values()).size} sections`);

  console.log('Fetching the card notes...');
  const notesHtml = await fetchText(NOTES);
  // "<strong>Name (Colour Rarity)</strong><br> value<br> rules text</p>", except
  // where it isn't: Hope brackets its parenthetical and Frustration and Glee
  // write the rarity first. Hand-written pages have hand-written exceptions, so
  // accept either delimiter and pick the colour out by name rather than by
  // position.
  const entryRe =
    /<p style="margin-left:\.5in;font-family:courier"><strong>([^<]+?)\s*[([]([^)\]]*)[)\]]<\/strong><br\s*\/?>([\s\S]*?)<\/p>/g;
  const cards = [];
  const seen = new Set();
  for (const m of notesHtml.matchAll(entryRe)) {
    const name = decode(m[1]).trim();
    if (seen.has(name)) continue; // the notes re-show a card when it is referenced
    seen.add(name);
    const words = strip(m[2]).split(/\s+/);
    const color = words.find((w) => COLORS.has(w.toLowerCase())) ?? '';
    const rarityWords = words.filter((w) => w.toLowerCase() !== color.toLowerCase());
    // The body is "<value line><br>rules text". Split on the FIRST break only:
    // rules text carries its own breaks between ability paragraphs.
    const body = m[3].split(/<br\s*\/?>/);
    const valueLine = strip(body[0] ?? '');
    const text = strip(body.slice(1).join('\n')).trim();
    cards.push({
      name,
      color: (color ?? '').toLowerCase(),
      rarity: rarityWords.join(' ').toLowerCase() || null,
      values: parseValues(valueLine),
      valueText: valueLine,
      text,
      art: art.get(name) ?? null,
      headliner: headliners.has(name) || undefined,
    });
  }

  const missingArt = cards.filter((c) => !c.art).map((c) => c.name);
  const missingCard = [...art.keys()].filter((n) => !seen.has(n));
  console.log(`  ${cards.length} cards parsed from the notes`);
  if (missingArt.length) console.warn(`  ! no art for ${missingArt.length}: ${missingArt.slice(0, 8).join(', ')}`);
  if (missingCard.length) console.warn(`  ! in the gallery but not the notes (${missingCard.length}): ${missingCard.join(', ')}`);

  // Both pages moving at once is unlikely; either one going quiet is not, and a
  // catalog that silently lost its rules text would look fine until someone
  // tried to read a card.
  if (cards.length < 100) throw new Error(`only ${cards.length} cards parsed - the notes page shape has changed`);
  const noValue = cards.filter((c) => c.values.length === 0);
  if (noValue.length > 10) throw new Error(`${noValue.length} cards parsed with no value - check the value line format`);

  const byColor = {};
  for (const c of cards) byColor[c.color] = (byColor[c.color] ?? 0) + 1;
  const byRarity = {};
  for (const c of cards) byRarity[c.rarity ?? '?'] = (byRarity[c.rarity ?? '?'] ?? 0) + 1;
  console.log('  by colour:', byColor);
  console.log('  by rarity:', byRarity);
  console.log('  values seen:', [...new Set(cards.flatMap((c) => c.values))].sort((a, b) => a - b).join(', '));

  // Hurt Feelings is in the gallery and not the notes because it is not a deck
  // card - it is the catch-up marker that passes to whoever scored lowest, and
  // the notes only cover cards you can draw. Its text is transcribed from the
  // card face; everything else about it comes off the gallery like the rest.
  const markers = [];
  if (art.has('Hurt Feelings')) {
    markers.push({
      name: 'Hurt Feelings',
      art: art.get('Hurt Feelings'),
      reminder:
        'In a 3+ player game, at the end of each round, the player with the lowest score this round gets Hurt Feelings for the next round. If there’s a tie, whoever took a turn latest this round wins the tie.',
      text: 'This round, you may play an additional mood during your turn.',
    });
  } else {
    console.warn('  ! Hurt Feelings is missing from the gallery - the 3+ player marker will be absent');
  }

  if (DRY) return;
  cards.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(OUTPUT, `${JSON.stringify({ set: 'MSW', cards, markers }, null, 1)}\n`);
  console.log(`\nwrote ${OUTPUT} (${cards.length} cards, ${markers.length} marker)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
