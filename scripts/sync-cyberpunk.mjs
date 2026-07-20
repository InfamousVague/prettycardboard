// Pull the official Cyberpunk TCG card set (data + artwork) into the repo, the
// cyberpunk-game analogue of sync-precons.mjs.
//
// Source: Netdeck.gg's public card API (the same backend cyberpunktcg.com uses).
//   GET https://api.netdeck.gg/api/cards/cyberpunk?limit=100&offset=0
// It returns { items, total, limit, offset }. Card art lives on a CloudFront
// CDN behind SIGNED, short-lived URLs (image_url / source_image_url carry
// ?Expires=&Signature=), so we download every image in the same run the listing
// was fetched and cache it locally under public/cache/cyberpunk/. The catalog we
// write (src/data/cyberpunk-cards.json) stores only the LOCAL paths, never the
// expiring signed URLs.
//
//   node scripts/sync-cyberpunk.mjs          # sync (skips already-cached images)
//   node scripts/sync-cyberpunk.mjs --force  # re-download every image
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTPUT = join(ROOT, 'src', 'data', 'cyberpunk-cards.json');
const IMAGE_DIR = join(ROOT, 'public', 'cache', 'cyberpunk');
const ART_DIR = join(ROOT, 'public', 'cache', 'cyberpunk', 'art');
const API = 'https://api.netdeck.gg/api/cards/cyberpunk';
const FORCE = process.argv.includes('--force');

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

/** Fetch every card, following limit/offset paging until the set is exhausted. */
async function fetchAllCards() {
  const all = [];
  let offset = 0;
  const limit = 100;
  for (let guard = 0; guard < 50; guard++) {
    const res = await fetch(`${API}?limit=${limit}&offset=${offset}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`card list ${res.status} at offset ${offset}`);
    const body = await res.json();
    const items = body.items ?? [];
    all.push(...items);
    const total = body.total ?? all.length;
    offset += items.length;
    if (items.length === 0 || all.length >= total) break;
  }
  return all;
}

/** Download one signed image URL to `target`, unless it is already cached. */
async function cacheImage(url, target) {
  if (!url) return false;
  if (existsSync(target) && !FORCE) return true;
  const res = await fetch(url, { headers: { Accept: 'image/avif,image/webp,image/*,*/*' } });
  if (!res.ok) {
    console.log(c.red(`  ! image ${res.status} -> ${target.split('/').pop()}`));
    return false;
  }
  writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  return true;
}

/** Small concurrency limiter so we are polite to the CDN. */
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

/** Map a raw Netdeck card to our trimmed, stable catalog shape (local art paths). */
function toCatalog(raw) {
  return {
    id: raw.id,
    externalId: raw.external_id ?? null,
    name: raw.name,
    subname: raw.subname ?? null,
    displayName: raw.display_name ?? raw.name,
    slug: raw.slug ?? null,
    type: raw.card_type ?? null, // Legend | Unit | Gear | Program
    color: raw.color ?? null, // Red | Yellow | Green | Blue
    cost: raw.cost ?? null,
    power: raw.power ?? null,
    ram: raw.ram ?? null,
    isEddiable: !!raw.is_eddiable,
    classifications: raw.classifications ?? [],
    keywords: raw.keywords ?? [],
    rulesText: raw.rules_text ?? null,
    flavorText: raw.flavor_text ?? null,
    rarity: raw.rarity ?? null,
    set: raw.set ?? null,
    printNumber: raw.print_number ?? null,
    artist: raw.artist ?? null,
    legality: raw.legality ?? null,
    image: `/cache/cyberpunk/${raw.id}.webp`,
    // Only reference a raw-art file that actually downloaded; the CDN 403s the
    // source_image_url for most cards, and the rendered face is what we display.
    art: existsSync(join(ART_DIR, `${raw.id}.webp`)) ? `/cache/cyberpunk/art/${raw.id}.webp` : null,
  };
}

async function main() {
  console.log(c.bold('\nSyncing Cyberpunk TCG cards from Netdeck.gg\n'));
  mkdirSync(IMAGE_DIR, { recursive: true });
  mkdirSync(ART_DIR, { recursive: true });
  mkdirSync(dirname(OUTPUT), { recursive: true });

  const raw = await fetchAllCards();
  console.log(`  fetched ${c.bold(String(raw.length))} cards`);

  // Download rendered card faces + raw art in parallel (signed URLs expire soon).
  let faces = 0;
  let arts = 0;
  await pool(raw, 6, async (card) => {
    if (await cacheImage(card.image_url, join(IMAGE_DIR, `${card.id}.webp`))) faces++;
    if (card.source_image_url && (await cacheImage(card.source_image_url, join(ART_DIR, `${card.id}.webp`)))) arts++;
  });
  console.log(`  cached ${c.green(String(faces))} card faces, ${c.green(String(arts))} art crops`);

  const cards = raw.map(toCatalog);
  const setMap = new Map();
  for (const card of cards) if (card.set?.code) setMap.set(card.set.code, card.set.name);

  const output = {
    game: 'cyberpunk',
    source: 'netdeck.gg',
    fetchedAt: new Date().toISOString(),
    count: cards.length,
    sets: [...setMap].map(([code, name]) => ({ code, name })),
    colors: [...new Set(cards.map((x) => x.color).filter(Boolean))],
    types: [...new Set(cards.map((x) => x.type).filter(Boolean))],
    classifications: [...new Set(cards.flatMap((x) => x.classifications))].sort(),
    cards,
  };
  writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\n  wrote ${c.bold('src/data/cyberpunk-cards.json')} (${cards.length} cards, ${output.sets.length} sets)`);
  console.log(c.dim(`  types: ${output.types.join(', ')}  |  colors: ${output.colors.join(', ')}`));
  console.log(c.green('\n✓ Cyberpunk sync complete\n'));
}

main().catch((e) => {
  console.error(c.red(`\n✗ sync failed: ${e.message}\n`));
  process.exit(1);
});
