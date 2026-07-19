import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTPUT = join(ROOT, 'src', 'data', 'precons.json');
const IMAGE_DIR = join(ROOT, 'public', 'cache', 'cards');
const ART_DIR = join(ROOT, 'public', 'cache', 'art');
const USER_AGENT = 'PrettyCardboard/0.1 (local-first precon browser)';

const PRECONS = [
  {
    id: 'counter-blitz',
    file: 'CounterBlitzFinalFantasyX_FIC',
    strategy: 'Tidus leads a blitzball tempo squad that piles up counters and attacks in bursts.',
  },
  {
    id: 'limit-break',
    file: 'LimitBreakFinalFantasyVii_FIC',
    strategy: 'Cloud goes tall, stacking Equipment until a single Limit Break swing ends the game.',
  },
  {
    id: 'revival-trance',
    file: 'RevivalTranceFinalFantasyVi_FIC',
    strategy: 'Terra fills the graveyard and tranches back threats in a WBR reanimator engine.',
  },
  {
    id: 'scions-and-spellcraft',
    file: 'ScionsSpellcraftFinalFantasyXiv_FIC',
    strategy: "Y'shtola marshals the Scions, chaining UW noncreature spellcraft into steady value.",
  },
];

function headers(extra = {}) {
  return {
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
    ...extra,
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, headers: headers(options.headers) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function batches(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function cardFaceText(card, field) {
  if (typeof card[field] === 'string') return card[field];
  return (card.card_faces ?? []).map((face) => face[field]).filter(Boolean).join(' // ');
}

function imageUris(card) {
  return card.image_uris ?? (card.card_faces ?? []).find((face) => face.image_uris)?.image_uris ?? {};
}

function imageExtension(url) {
  return new URL(url).pathname.endsWith('.webp') ? 'webp' : 'jpg';
}

function normalizeCard(entry, board, card) {
  const images = imageUris(card);
  const remoteImage = images.normal ?? images.small ?? null;
  const extension = remoteImage ? imageExtension(remoteImage) : null;
  return {
    id: card.id,
    oracleId: card.oracle_id,
    name: card.name,
    quantity: entry.count,
    board,
    manaCost: cardFaceText(card, 'mana_cost'),
    manaValue: card.cmc,
    typeLine: card.type_line,
    oracleText: cardFaceText(card, 'oracle_text'),
    colors: card.colors ?? [],
    colorIdentity: card.color_identity ?? [],
    set: card.set.toUpperCase(),
    setName: card.set_name,
    collectorNumber: card.collector_number,
    rarity: card.rarity,
    keywords: card.keywords ?? [],
    legalities: card.legalities,
    artist: card.artist ?? (card.card_faces ?? []).map((face) => face.artist).filter(Boolean).join(' / '),
    flavorText: cardFaceText(card, 'flavor_text') || null,
    power: card.power ?? (card.card_faces ?? []).find((face) => face.power)?.power ?? null,
    toughness: card.toughness ?? (card.card_faces ?? []).find((face) => face.toughness)?.toughness ?? null,
    image: remoteImage
      ? {
          local: `/cache/cards/${card.id}.${extension}`,
          remote: remoteImage,
        }
      : null,
    art:
      board === 'commander' && images.art_crop
        ? {
            local: `/cache/art/${card.id}.${imageExtension(images.art_crop)}`,
            remote: images.art_crop,
          }
        : null,
    scryfallUri: card.scryfall_uri,
  };
}

const failures = [];

async function downloadTo(directory, spec) {
  const target = join(directory, spec.local.split('/').pop());
  if (existsSync(target)) return false;
  const response = await fetch(spec.remote, { headers: headers({ Accept: 'image/avif,image/webp,image/*,*/*' }) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${spec.remote}`);
  writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  await sleep(100);
  return true;
}

async function downloadImage(card) {
  if (!card.image) {
    failures.push(`No image URI for ${card.name} (${card.id})`);
    return false;
  }
  try {
    return await downloadTo(IMAGE_DIR, card.image);
  } catch (error) {
    failures.push(`Card image failed for ${card.name}: ${error.message}`);
    return false;
  }
}

async function downloadArt(card) {
  if (!card.art) {
    failures.push(`No art_crop for commander ${card.name} (${card.id})`);
    return false;
  }
  try {
    return await downloadTo(ART_DIR, card.art);
  } catch (error) {
    failures.push(`Art crop failed for ${card.name}: ${error.message}`);
    return false;
  }
}

async function runPool(items, limit, worker) {
  let cursor = 0;
  let completed = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (await worker(item)) completed += 1;
    }
  });
  await Promise.all(runners);
  return completed;
}

async function main() {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  mkdirSync(IMAGE_DIR, { recursive: true });
  mkdirSync(ART_DIR, { recursive: true });

  console.log('Fetching MTGJSON preconstructed decks...');
  const sourceDecks = await Promise.all(
    PRECONS.map(async (precon) => {
      const payload = await fetchJson(`https://mtgjson.com/api/v5/decks/${precon.file}.json`);
      return { precon, payload };
    }),
  );

  const entries = sourceDecks.flatMap(({ payload }) => [
    ...(payload.data.commander ?? []).map((entry) => ({ entry, board: 'commander' })),
    ...(payload.data.mainBoard ?? []).map((entry) => ({ entry, board: 'main' })),
    ...(payload.data.sideBoard ?? []).map((entry) => ({ entry, board: 'sideboard' })),
  ]);
  const ids = [...new Set(entries.map(({ entry }) => entry.identifiers?.scryfallId).filter(Boolean))];

  console.log(`Resolving ${ids.length} printings through Scryfall...`);
  const cardsById = new Map();
  for (const [index, batch] of batches(ids, 75).entries()) {
    const payload = await fetchJson('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
    });
    for (const card of payload.data) cardsById.set(card.id, card);
    if (payload.not_found?.length) {
      for (const missing of payload.not_found) failures.push(`Scryfall did not resolve ${JSON.stringify(missing)}`);
    }
    if (index < Math.ceil(ids.length / 75) - 1) await sleep(550);
  }

  const decks = sourceDecks.map(({ precon, payload }) => {
    const normalizeEntries = (items, board) =>
      items.flatMap((entry) => {
        const id = entry.identifiers?.scryfallId;
        const card = cardsById.get(id);
        if (!card) {
          failures.push(`Missing Scryfall card ${entry.name} (${id ?? 'no id'})`);
          return [];
        }
        return [normalizeCard(entry, board, card)];
      });
    const cards = [
      ...normalizeEntries(payload.data.commander ?? [], 'commander'),
      ...normalizeEntries(payload.data.mainBoard ?? [], 'main'),
      ...normalizeEntries(payload.data.sideBoard ?? [], 'sideboard'),
    ];
    return {
      id: precon.id,
      name: payload.data.name,
      code: payload.data.code,
      releaseDate: payload.data.releaseDate,
      format: 'Commander',
      productType: payload.data.type,
      strategy: precon.strategy,
      cards,
    };
  });

  const output = {
    generatedAt: new Date().toISOString(),
    mtgjsonVersion: sourceDecks[0]?.payload.meta.version ?? 'unknown',
    sources: {
      decks: 'https://mtgjson.com/api/v5/',
      cards: 'https://api.scryfall.com',
      images: 'https://scryfall.com/docs/api/images',
    },
    decks,
  };
  writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);

  const uniqueCards = [...new Map(decks.flatMap((deck) => deck.cards).map((card) => [card.id, card])).values()];
  console.log(`Caching ${uniqueCards.length} full-card images locally...`);
  const downloaded = await runPool(uniqueCards, 4, downloadImage);

  const commanders = uniqueCards.filter((card) => card.board === 'commander');
  console.log(`Caching ${commanders.length} commander art crops locally...`);
  const artDownloaded = await runPool(commanders, 2, downloadArt);

  console.log(`Wrote ${decks.length} decks to ${OUTPUT}`);
  console.log(`Downloaded ${downloaded} new card images; ${uniqueCards.length - downloaded} already cached or failed.`);
  console.log(`Downloaded ${artDownloaded} new commander art crops.`);
  if (failures.length) {
    console.warn(`${failures.length} issue(s) encountered:`);
    for (const failure of failures) console.warn(`  - ${failure}`);
  } else {
    console.log('No failures.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
