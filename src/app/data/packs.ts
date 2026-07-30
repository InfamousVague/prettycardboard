/**
 * Real pack data: Wizards' published booster collation, and every Secret Lair
 * drop as an openable product.
 *
 * WHY THIS EXISTS ALONGSIDE boosters.ts
 *
 * boosters.ts models a pack from its set's release DATE - a good approximation
 * of the era, but still an inference. This module carries the actual thing:
 * MTGJSON publishes each set's weighted booster configurations over named
 * sheets, so a Foundations pack drawn from here really does hit a Special
 * Guest 12 times in 1000, off the real ten-card sheet.
 *
 * It also carries the drops. Scryfall has no Secret Lair drop objects - all
 * ~2600 cards sit in one flat `sld` set - so "the SpongeBob drop" simply does
 * not exist as anything you can search for or open. MTGJSON files each drop as
 * a sealed product with a name and a card list, which is exactly a pack.
 *
 * The files are built by scripts/sync-packs.mjs into public/cache/packs/ and
 * ship with the build, so nothing here talks to a third party at runtime: one
 * fetch of a static file that the browser then caches.
 *
 * Cards are stored as positional tuples, and each set's cards are written once
 * with the sheets addressing them by index - Foundations' foil and wildcard
 * sheets are the same 341 printings, and every card sits on several sheets. In
 * full JSON objects the 181 sets would be several times the 6MB they cost.
 */

import type { PackCard } from './boosters.ts';
import type { PoolCard, Rarity } from './boosterSets.ts';

const BASE = `${import.meta.env.BASE_URL}cache/packs/`;

/** [scryfallId, name, rarity, colors, collectorNumber, typeLine] */
type CardTuple = [string, string, string, string, string, string];

interface RawSheet {
  /** Which of the app's six slots this sheet's cards came out of. */
  slot: PackCard['slot'];
  foil: boolean;
  /** [index into `cards`, weight] */
  picks: [number, number][];
}

interface RawSpec {
  code: string;
  kind: string;
  cards: CardTuple[];
  sheets: Record<string, RawSheet>;
  /** [weight, sheet name -> how many cards]. One is rolled per pack. */
  configs: [number, Record<string, number>][];
}

interface RawProduct {
  id: string;
  name: string;
  released: string;
  set: string;
  foil: boolean;
  cards: CardTuple[];
  /** [weight, card, foil] - the drop's one bonus slot. */
  bonus?: [number, CardTuple, boolean][];
}

/** What the picker needs to know before anyone opens anything. */
export interface PackIndexEntry {
  /** MTGJSON's name for the booster: play, draft, set, default, collector. */
  kind: string;
  /** Cards in the most common configuration. */
  size: number;
}

export interface PackIndex {
  specs: Record<string, PackIndexEntry>;
  products: number;
}

/** One Secret Lair drop, ready to open. */
export interface SealedProduct {
  id: string;
  name: string;
  released: string;
  /** Parent set code (`sld`), for artwork and collection records. */
  set: string;
  /** The rainbow-foil printing of the drop. */
  foil: boolean;
}

function toCard(tuple: CardTuple): PoolCard {
  return {
    id: tuple[0],
    name: tuple[1],
    rarity: tuple[2] as Rarity,
    collectorNumber: tuple[4],
    // Stored joined ('WU') because a five-element array per card, 100k times
    // over, is mostly punctuation.
    colors: tuple[3] ? tuple[3].split('') : [],
    typeLine: tuple[5],
  };
}

// --- loading --------------------------------------------------------------

async function getJson<T>(file: string): Promise<T> {
  const response = await fetch(`${BASE}${file}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`packs ${response.status}: ${file}`);
  return (await response.json()) as T;
}

let indexPromise: Promise<PackIndex> | null = null;

/**
 * Which sets have real collation and how many drops exist. Small enough
 * (~10KB) to load with the dock, and it is what lets the app avoid firing a
 * request for a spec that was never published.
 */
export function loadPackIndex(): Promise<PackIndex> {
  indexPromise ??= getJson<PackIndex>('index.json').catch((error) => {
    // A missing index is not fatal: everything falls back to the date-inferred
    // simulator. Clear the cache so a later attempt can still succeed.
    indexPromise = null;
    throw error;
  });
  return indexPromise;
}

const specs = new Map<string, Promise<RawSpec>>();

/** One set's collation, cached for the session. */
function loadSpec(code: string): Promise<RawSpec> {
  const key = code.toLowerCase();
  let pending = specs.get(key);
  if (!pending) {
    pending = getJson<RawSpec>(`${encodeURIComponent(key)}.json`).catch((error: unknown) => {
      specs.delete(key);
      throw error;
    });
    specs.set(key, pending);
  }
  return pending;
}

let productsPromise: Promise<{ list: SealedProduct[]; raw: Map<string, RawProduct> }> | null = null;

function loadRawProducts() {
  productsPromise ??= getJson<{ products: RawProduct[] }>('products.json')
    .then((data) => ({
      list: data.products.map((product) => ({
        id: product.id,
        name: product.name,
        released: product.released,
        set: product.set,
        foil: product.foil,
      })),
      raw: new Map(data.products.map((product) => [product.id, product])),
    }))
    .catch((error: unknown) => {
      productsPromise = null;
      throw error;
    });
  return productsPromise;
}

/** Every Secret Lair drop, newest first. */
export async function loadSealedProducts(): Promise<SealedProduct[]> {
  return (await loadRawProducts()).list;
}

// --- opening --------------------------------------------------------------

/** Index of the first entry whose cumulative weight passes a random roll. */
function rollWeighted<T>(entries: T[], weightOf: (entry: T) => number): T | undefined {
  let total = 0;
  for (const entry of entries) total += weightOf(entry);
  if (total <= 0) return entries[0];
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= weightOf(entry);
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}

/**
 * Deal a pack from a set's real collation.
 *
 * Roll one booster configuration by weight, then fill each of its slots off
 * the named sheet, weighted per card. `used` keeps a pack from dealing the
 * same printing twice, which matters because the foil and wildcard sheets
 * overlap heavily - without it a Foundations pack regularly doubles up.
 */
export async function openCollated(code: string): Promise<PackCard[]> {
  const spec = await loadSpec(code);
  const config = rollWeighted(spec.configs, ([weight]) => weight);
  if (!config) return [];

  const used = new Set<number>();
  const out: PackCard[] = [];
  for (const [name, count] of Object.entries(config[1])) {
    const sheet = spec.sheets[name];
    if (!sheet) continue;
    for (let n = 0; n < count; n += 1) {
      // Re-roll a handful of times before accepting a duplicate: rejection is
      // cheaper and less biased than rebuilding the weighted list per draw,
      // and a ten-card sheet asked for two cards must not spin forever.
      let pick: [number, number] | undefined;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        pick = rollWeighted(sheet.picks, ([, weight]) => weight);
        if (!pick || !used.has(pick[0])) break;
      }
      if (!pick) continue;
      used.add(pick[0]);
      const card = spec.cards[pick[0]];
      if (!card) continue;
      out.push({ ...toCard(card), foil: sheet.foil, slot: sheet.slot });
    }
  }
  return out;
}

/**
 * Deal a Secret Lair drop: its fixed card list, plus the one bonus card if the
 * drop shipped with a chance table (Command Tower at 171 in 200, and so on -
 * Wizards' real numbers, not an invented split).
 */
export async function openSealed(id: string): Promise<PackCard[]> {
  const product = (await loadRawProducts()).raw.get(id);
  if (!product) return [];
  const out: PackCard[] = product.cards.map((tuple) => ({
    ...toCard(tuple),
    foil: product.foil,
    // A drop has no rarity structure to speak of, so every card is the reason
    // you bought it - which is what `rare` means to the reveal's "the goods".
    slot: 'rare' as const,
  }));
  const bonus = product.bonus?.length ? rollWeighted(product.bonus, ([weight]) => weight) : undefined;
  if (bonus) out.push({ ...toCard(bonus[1]), foil: bonus[2], slot: 'foil' });
  return out;
}
