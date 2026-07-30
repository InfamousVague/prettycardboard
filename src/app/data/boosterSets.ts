/**
 * Scryfall client for the booster simulator: the set list, and the per-set
 * card pools a pack is drawn from.
 *
 * Etiquette (Scryfall's published limits): /cards/* endpoints allow 2 requests
 * per second, everything else 10 per second, and a 429 earns a 30-second
 * lockout. Every call here goes through one serial queue with a 550ms floor,
 * and both the set list and each set's pool are cached for the session - a
 * pack is drawn from a pool already in memory, never from live requests.
 *
 * Pool queries pin `unique=prints` and `is:booster` deliberately. The default
 * `unique=cards` rolls printings together and can hand back a printing that
 * was never in a pack (deck-only basics, starter-deck reprints), which would
 * make the simulator pull cards real boosters cannot contain.
 */

import { SERVER_URL } from '../net/api.ts';

const API = 'https://api.scryfall.com';

/** Scryfall's own limit for /cards/*: 2 per second. Leave headroom. */
const CARDS_GAP_MS = 550;
/** Everything else (the set list) allows 10 per second. */
const OTHER_GAP_MS = 120;

/** A paper set that shipped in boosters. */
export interface BoosterSet {
  code: string;
  name: string;
  /** ISO date, e.g. '2008-10-03'. */
  released: string;
  setType: string;
  cardCount: number;
  iconUrl: string;
  /** Not out yet: only spoiler-season previews exist, so pools are partial. */
  preview: boolean;
}

/**
 * The set's marquee art, proxied and cached by our own server so the grid of
 * product shots never fans out into Scryfall's rate limit. The endpoint picks
 * one poster card per set and serves its art crop with immutable caching.
 */
export function boosterArtUrl(code: string): string {
  return `${SERVER_URL}/api/boosters/art/${encodeURIComponent(code)}`;
}

/** One of the set's three showcase cards (rarest first), same cache. */
export function boosterCardUrl(code: string, index: number): string {
  return `${SERVER_URL}/api/boosters/card/${encodeURIComponent(code)}/${index}`;
}

/** One card as the simulator handles it. */
export interface PoolCard {
  id: string;
  name: string;
  rarity: Rarity;
  collectorNumber: string;
  /** WUBRG letters; empty for colorless/lands. Drives common colour balancing. */
  colors: string[];
  typeLine: string;
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';

/** Every card a set's boosters can contain, split by rarity. */
export interface SetPool {
  code: string;
  common: PoolCard[];
  uncommon: PoolCard[];
  rare: PoolCard[];
  mythic: PoolCard[];
  /** Basic lands that actually appear in packs (may be empty for old sets). */
  basic: PoolCard[];
  /** True when `is:booster` had no data (previews, unflagged sets) and the
      pool fell back to every paper printing - close, but not collation-exact. */
  partial: boolean;
}

// --- serial request queue -------------------------------------------------

let chain: Promise<unknown> = Promise.resolve();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run `job` after every previously queued job, honouring the endpoint's gap. */
function queued<T>(job: () => Promise<T>, gapMs: number): Promise<T> {
  const run = chain.then(async () => {
    const result = await job();
    await wait(gapMs);
    return result;
  });
  // Keep the chain alive even when a job rejects, or one failure would wedge
  // every later request behind it.
  chain = run.catch(() => undefined);
  return run;
}

/** Carries the HTTP status so callers can tell "no such thing" (404) apart
    from "ask again later" (429 lockout, 5xx) - see `searchAll`. */
class HttpError extends Error {
  constructor(readonly status: number) {
    super(`scryfall ${status}`);
  }
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new HttpError(response.status);
  return (await response.json()) as Record<string, unknown>;
}

// --- set list -------------------------------------------------------------

/**
 * The set types with nothing to open. Everything else on paper is fair game:
 * boosters first, but also Secret Lair drops (set type `box`), Commander decks,
 * Un-sets and starter products - if it shipped as sealed cardboard, it belongs
 * in the picker.
 *
 * Only these are excluded, and each for a concrete reason: tokens and
 * memorabilia are not cards you own, minigames and Vanguard are not the game,
 * treasure chests are digital-economy artefacts, and `promo` is ~200 one-card
 * "sets" that would bury everything real under noise.
 *
 * Products outside the four true booster types carry no `is:booster` flag, so
 * `loadSetPool` falls back to every paper printing and marks the pool
 * `partial` - a Secret Lair opens as a plausible pack, not a collated one.
 */
const UNOPENABLE_SET_TYPES = new Set([
  'token',
  'memorabilia',
  'minigame',
  'treasure_chest',
  'vanguard',
  'promo',
]);

/**
 * How far back the simulator goes: Limited Edition Alpha, the first Magic set
 * ever printed - and the only place (with Beta and Unlimited) that Black Lotus
 * and the rest of the Power Nine came out of a pack. The classic-era spec in
 * boosters.ts already models 1993 collation (15 cards, no foils), so the cutoff
 * was the only thing keeping those sets out of the rotation.
 */
export const EARLIEST_SET_DATE = '1993-08-05';

let setsPromise: Promise<BoosterSet[]> | null = null;

/** Every paper product worth opening, newest first. Cached per session. */
export function loadBoosterSets(): Promise<BoosterSet[]> {
  if (!setsPromise) {
    setsPromise = queued(() => getJson(`${API}/sets`), OTHER_GAP_MS)
      .then((payload) => {
        const raw = (payload.data ?? []) as Record<string, unknown>[];
        return raw
          .filter((set) => {
            const released = String(set.released_at ?? '');
            return (
              !UNOPENABLE_SET_TYPES.has(String(set.set_type)) &&
              set.digital !== true &&
              released >= EARLIEST_SET_DATE &&
              // Unreleased sets have a date but no cards to draw yet.
              Number(set.card_count ?? 0) > 0
            );
          })
          .map((set) => ({
            code: String(set.code),
            name: String(set.name),
            released: String(set.released_at ?? ''),
            setType: String(set.set_type),
            cardCount: Number(set.card_count ?? 0),
            iconUrl: String(set.icon_svg_uri ?? ''),
            preview: String(set.released_at ?? '') > new Date().toISOString().slice(0, 10),
          }))
          .sort((a, b) => b.released.localeCompare(a.released) || a.name.localeCompare(b.name));
      })
      .catch((error) => {
        // Let the next attempt retry rather than caching the failure forever.
        setsPromise = null;
        throw error;
      });
  }
  return setsPromise;
}

// --- card pools -----------------------------------------------------------

/** The four bands the pack UI groups by. */
const RARITY_BANDS = new Set<string>(['common', 'uncommon', 'rare', 'mythic']);

/**
 * Scryfall's rarity vocabulary is wider than those four bands: it also has
 * 'special' (timeshifted sheets) and 'bonus'. Every rarity pool below is
 * fetched with an explicit `rarity:` filter, so the one query that can hand
 * back an off-band card is the unfiltered basic-land one - and Time Spiral
 * Remastered's only booster basic, Wastes, is rarity 'special'. The pack views
 * group strictly over the four bands, so an off-band card is dealt into the
 * pack and then silently dropped from the display (and sorts as NaN). Fold it
 * onto the sheet it was collated on instead: a basic land rode the commons.
 */
function toRarity(value: unknown): Rarity {
  const rarity = String(value);
  return RARITY_BANDS.has(rarity) ? (rarity as Rarity) : 'common';
}

function toPoolCard(card: Record<string, unknown>): PoolCard {
  const faces = card.card_faces as Record<string, unknown>[] | undefined;
  return {
    id: String(card.id),
    name: String(card.name),
    rarity: toRarity(card.rarity),
    collectorNumber: String(card.collector_number ?? ''),
    colors: ((card.colors ?? faces?.[0]?.colors ?? []) as string[]).slice(),
    typeLine: String(card.type_line ?? ''),
  };
}

/** Page through a /cards/search query, respecting the 2-per-second limit. */
async function searchAll(query: string): Promise<PoolCard[]> {
  const out: PoolCard[] = [];
  let url: string | null =
    `${API}/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=set`;
  while (url) {
    const next: string = url;
    let page: Record<string, unknown>;
    try {
      page = await queued(() => getJson(next), CARDS_GAP_MS);
    } catch (error) {
      // A rarity a set simply does not have (no mythics before 2008) 404s -
      // that is an answer, and an empty list is the right one. Anything else
      // (429 lockout, 5xx, dropped socket) is a failure and must NOT be cached
      // as "this set has no rares": `mythicChance` would then divide by an
      // empty rare sheet and hand out a guaranteed mythic every single pack.
      // Let it propagate to loadSetPool's catch, which evicts the cache entry
      // so the next visit can retry.
      if (error instanceof HttpError && error.status === 404) break;
      throw error;
    }
    for (const card of (page.data ?? []) as Record<string, unknown>[]) out.push(toPoolCard(card));
    url = page.has_more === true ? String(page.next_page) : null;
  }
  return out;
}

const pools = new Map<string, Promise<SetPool>>();

/**
 * Every card in `code` that a booster can contain, by rarity. `is:booster`
 * excludes promos, prerelease stamps and starter-deck-only printings;
 * `-type:basic` keeps basics out of the rarity pools so the land slot owns
 * them. Cached per set for the session.
 */
export function loadSetPool(code: string): Promise<SetPool> {
  const cached = pools.get(code);
  if (cached) return cached;

  const load = (async (): Promise<SetPool> => {
    const fetchPool = async (scope: string) => {
      // Sequential by design: the queue serializes them anyway, and this keeps
      // the request order predictable while a set is loading.
      const common = await searchAll(`${scope} rarity:common -type:basic`);
      const uncommon = await searchAll(`${scope} rarity:uncommon -type:basic`);
      const rare = await searchAll(`${scope} rarity:rare -type:basic`);
      const mythic = await searchAll(`${scope} rarity:mythic -type:basic`);
      const basic = await searchAll(`${scope} type:basic`);
      return { common, uncommon, rare, mythic, basic };
    };

    const strict = await fetchPool(`set:${code} is:booster game:paper`);
    const strictSize =
      strict.common.length + strict.uncommon.length + strict.rare.length + strict.mythic.length;
    if (strictSize > 0) return { code, ...strict, partial: false };

    // Scryfall only flags cards `booster` once a set is actually collated:
    // spoiler-season previews (and a few oddly-flagged sets) return nothing at
    // all. Rather than a dead Open button, fall back to every paper printing -
    // the pack is drawn from what is known so far.
    const loose = await fetchPool(`set:${code} game:paper`);
    return { code, ...loose, partial: true };
  })().catch((error) => {
    pools.delete(code);
    throw error;
  });

  pools.set(code, load);
  return load;
}

/** Whether a set's pool is already in memory (drives the instant-open path). */
export function poolReady(code: string): boolean {
  return pools.has(code);
}
