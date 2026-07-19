import type { DeckCard } from '../net/types.ts';
import * as api from '../net/api.ts';
import { ApiError } from '../net/api.ts';
import { rememberCard, type ScryCard } from './scryfall.ts';

/**
 * Moxfield deck import. This talks to Moxfield's UNOFFICIAL v3 API
 * (https://api2.moxfield.com/v3/decks/all/<id>), fetched THROUGH our server
 * (Moxfield blocks direct browser calls behind Cloudflare). Every field access
 * is defensive: boards may be missing, card maps may be objects or arrays, and
 * the Scryfall id has been seen as both `scryfall_id` and `scryfallId`. The
 * per-card `scryfall_id` is the exact printing the deck author chose, so
 * alternate art (Secret Lair, etc.) is preserved verbatim.
 */

export class MoxfieldError extends Error {}

const DECK_URL = /moxfield\.com\/decks\/([A-Za-z0-9_-]+)/u;
const BARE_ID = /^[A-Za-z0-9_-]{8,}$/u;

/** Accepts a full deck URL or a bare deck id; null when neither. */
export function parseMoxfieldRef(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fromUrl = DECK_URL.exec(trimmed);
  if (fromUrl?.[1]) return fromUrl[1];
  if (BARE_ID.test(trimmed) && !trimmed.includes('/')) return trimmed;
  return null;
}

export interface MoxfieldDeck {
  name: string;
  cards: DeckCard[];
}

interface MoxEntry {
  quantity: number;
  card: Record<string, unknown>;
}

/** A board's cards arrive as an object map (v3) or an array; normalize both. */
function boardEntries(board: unknown): MoxEntry[] {
  if (typeof board !== 'object' || board === null) return [];
  const cards = (board as { cards?: unknown }).cards;
  const raw: unknown[] =
    Array.isArray(cards) ? cards
    : typeof cards === 'object' && cards !== null ? Object.values(cards)
    : [];
  const entries: MoxEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const card = (item as { card?: unknown }).card;
    if (typeof card !== 'object' || card === null) continue;
    const quantity = (item as { quantity?: unknown }).quantity;
    entries.push({
      quantity: typeof quantity === 'number' && quantity > 0 ? quantity : 1,
      card: card as Record<string, unknown>,
    });
  }
  return entries;
}

function scryfallIdOf(card: Record<string, unknown>): string | null {
  const id = card.scryfall_id ?? card.scryfallId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function toDeckCards(entries: MoxEntry[], board: DeckCard['board']): DeckCard[] {
  const cards: DeckCard[] = [];
  for (const entry of entries) {
    const scryfallId = scryfallIdOf(entry.card);
    const name = typeof entry.card.name === 'string' ? entry.card.name : null;
    if (!scryfallId || !name) continue;

    // Opportunistically feed the metadata registry from Moxfield's card blob -
    // its field names mirror Scryfall's, so a partial ScryCard is safe.
    rememberCard({
      id: scryfallId,
      name,
      type_line: typeof entry.card.type_line === 'string' ? entry.card.type_line : undefined,
      mana_cost: typeof entry.card.mana_cost === 'string' ? entry.card.mana_cost : undefined,
      cmc: typeof entry.card.cmc === 'number' ? entry.card.cmc : undefined,
      color_identity: Array.isArray(entry.card.color_identity)
        ? (entry.card.color_identity as string[]).filter((c) => typeof c === 'string')
        : undefined,
    } satisfies ScryCard);

    cards.push({ scryfallId, name, quantity: entry.quantity, board });
  }
  return cards;
}

export async function fetchMoxfieldDeck(deckId: string): Promise<MoxfieldDeck> {
  let body: unknown;
  try {
    body = await api.moxfieldDeck(deckId);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) throw new MoxfieldError('moxfield-not-found');
    throw new MoxfieldError('moxfield-unreachable');
  }
  if (typeof body !== 'object' || body === null) throw new MoxfieldError('moxfield-bad-shape');

  const deck = body as { name?: unknown; boards?: unknown };
  const boards =
    typeof deck.boards === 'object' && deck.boards !== null
      ? (deck.boards as Record<string, unknown>)
      : {};

  const cards: DeckCard[] = [
    ...toDeckCards(boardEntries(boards.commanders), 'commander'),
    ...toDeckCards(boardEntries(boards.mainboard), 'main'),
    ...toDeckCards(boardEntries(boards.sideboard), 'side'),
  ];
  if (cards.length === 0) throw new MoxfieldError('moxfield-empty');

  return {
    name: typeof deck.name === 'string' && deck.name ? deck.name : 'Moxfield import',
    cards,
  };
}
