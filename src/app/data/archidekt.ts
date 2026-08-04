import type { ArchidektHit, DeckCard } from '../net/types.ts';
import * as api from '../net/api.ts';
import { ApiError } from '../net/api.ts';
import { rememberCard, type ScryCard } from './scryfall.ts';

/**
 * Archidekt deck search and import.
 *
 * This is the SEARCHABLE source. Moxfield's API root says out loud that it "is
 * not intended for public use" and its search endpoints answer a Cloudflare
 * challenge, so searching it would mean building on something its owners have
 * asked people not to build on. Archidekt answers a plain request, so the
 * in-app deck browser is Archidekt's; Moxfield keeps its import-by-URL path
 * for anyone who already has a link.
 *
 * Both go through our server (see api::import_archidekt) so import has one
 * shape whichever site a deck came from.
 *
 * Boards come from Archidekt's CATEGORIES rather than separate lists: a card
 * tagged "Commander" is the commander, anything in a category the deck marks
 * `includedInDeck: false` (Maybeboard, Sideboard) is a sideboard card, and
 * everything else is maindeck. Every field access is defensive - categories
 * are user-authored and a deck may have none at all.
 */

export class ArchidektError extends Error {}

export type { ArchidektHit };

const DECK_URL = /archidekt\.com\/decks\/(\d+)/u;
const BARE_ID = /^\d{1,24}$/u;

/** Accepts a full deck URL or a bare numeric id; null when neither. */
export function parseArchidektRef(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fromUrl = DECK_URL.exec(trimmed);
  if (fromUrl?.[1]) return fromUrl[1];
  if (BARE_ID.test(trimmed)) return trimmed;
  return null;
}

export interface ArchidektDeck {
  name: string;
  cards: DeckCard[];
}

export async function searchArchidekt(term: string, page = 1): Promise<ArchidektHit[]> {
  return (await searchArchidektPage(term, page)).results;
}

/**
 * The same search, plus what the Discover browser needs to page it: the total
 * Archidekt reports for the query, and how many rows this page actually held.
 * The size is reported rather than assumed because Archidekt answers 60 rows
 * regardless of what page size is requested.
 */
export async function searchArchidektPage(
  term: string,
  page = 1,
): Promise<{ results: ArchidektHit[]; total: number | null; pageSize: number | null }> {
  try {
    const body = await api.searchArchidektDecks(term, page);
    const results = Array.isArray(body?.results) ? body.results : [];
    return {
      results,
      total: typeof body?.total === 'number' ? body.total : null,
      pageSize: typeof body?.pageSize === 'number' && body.pageSize > 0 ? body.pageSize : null,
    };
  } catch {
    throw new ArchidektError('archidekt-unreachable');
  }
}

/** Archidekt's format enum, for the labels the picker shows. Unknown numbers
 *  fall through to nothing rather than a wrong name. */
const FORMATS: Record<number, string> = {
  1: 'Standard',
  2: 'Modern',
  3: 'Commander',
  4: 'Legacy',
  5: 'Vintage',
  6: 'Pauper',
  7: 'Custom',
  8: 'Frontier',
  9: 'Future Standard',
  10: 'Penny Dreadful',
  11: 'One-of-a-Kind',
  12: 'Duel Commander',
  13: 'Brawl',
  14: 'Oathbreaker',
  15: 'Pioneer',
  16: 'Historic',
  17: 'Pauper EDH',
  18: 'Alchemy',
  19: 'Explorer',
  20: 'Historic Brawl',
  21: 'Gladiator',
  22: 'Premodern',
  23: 'Predh',
};

export function archidektFormatName(format: number | null | undefined): string | null {
  return format != null ? (FORMATS[format] ?? null) : null;
}

interface RawEntry {
  quantity?: unknown;
  categories?: unknown;
  card?: unknown;
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Categories the deck says do NOT count toward it - Archidekt's Maybeboard
 *  and Sideboard are modelled this way rather than as separate lists. */
function excludedCategories(deck: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  const cats = deck.categories;
  if (!Array.isArray(cats)) return out;
  for (const cat of cats) {
    if (typeof cat !== 'object' || cat === null) continue;
    const record = cat as { name?: unknown; includedInDeck?: unknown };
    if (record.includedInDeck === false && typeof record.name === 'string') out.add(record.name);
  }
  return out;
}

function boardOf(categories: string[], excluded: Set<string>): DeckCard['board'] {
  if (categories.some((c) => c.toLowerCase() === 'commander')) return 'commander';
  if (categories.some((c) => excluded.has(c))) return 'side';
  // Archidekt also lets a deck carry these without declaring them excluded.
  if (categories.some((c) => /^(maybeboard|sideboard)$/i.test(c))) return 'side';
  return 'main';
}

export async function fetchArchidektDeck(deckId: string): Promise<ArchidektDeck> {
  let body: unknown;
  try {
    body = await api.archidektDeck(deckId);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) throw new ArchidektError('archidekt-not-found');
    throw new ArchidektError('archidekt-unreachable');
  }
  if (typeof body !== 'object' || body === null) throw new ArchidektError('archidekt-bad-shape');
  const deck = body as Record<string, unknown>;
  const excluded = excludedCategories(deck);
  const raw = Array.isArray(deck.cards) ? deck.cards : [];

  const cards: DeckCard[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as RawEntry;
    const card = typeof entry.card === 'object' && entry.card !== null
      ? (entry.card as Record<string, unknown>)
      : null;
    if (!card) continue;
    // `uid` is the Scryfall id of the exact printing the author picked, which
    // is what keeps alternate art through an import.
    const scryfallId = typeof card.uid === 'string' && card.uid ? card.uid : null;
    const oracle = typeof card.oracleCard === 'object' && card.oracleCard !== null
      ? (card.oracleCard as Record<string, unknown>)
      : {};
    const name = typeof oracle.name === 'string' && oracle.name
      ? oracle.name
      : typeof card.displayName === 'string' && card.displayName
        ? card.displayName
        : null;
    if (!scryfallId || !name) continue;
    const quantity = typeof entry.quantity === 'number' && entry.quantity > 0 ? entry.quantity : 1;

    // Feed the card registry while we have the data: Archidekt splits the type
    // line into types/subTypes, so rebuild the Scryfall-shaped string.
    const types = stringsOf(oracle.types);
    const subTypes = stringsOf(oracle.subTypes);
    const superTypes = stringsOf(oracle.superTypes);
    const head = [...superTypes, ...types].join(' ');
    rememberCard({
      id: scryfallId,
      name,
      type_line: head ? (subTypes.length ? `${head} — ${subTypes.join(' ')}` : head) : undefined,
      mana_cost: typeof oracle.manaCost === 'string' ? oracle.manaCost : undefined,
      cmc: typeof oracle.cmc === 'number' ? oracle.cmc : undefined,
      // Archidekt writes colour identity as full words ("Black"); the registry
      // wants Scryfall's letters.
      color_identity: stringsOf(oracle.colorIdentity)
        .map((c) => c.charAt(0).toUpperCase())
        .filter((c) => 'WUBRGC'.includes(c)),
    } satisfies ScryCard);

    cards.push({ scryfallId, name, quantity, board: boardOf(stringsOf(entry.categories), excluded) });
  }

  if (cards.length === 0) throw new ArchidektError('archidekt-empty');
  return {
    name: typeof deck.name === 'string' && deck.name ? deck.name : 'Archidekt import',
    cards,
  };
}
