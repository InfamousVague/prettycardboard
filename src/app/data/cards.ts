import preconData from '../../data/precons.json' with { type: 'json' };
import type { DeckCard } from '../net/types.ts';

/**
 * The bundled Final Fantasy Commander precons plus card-image resolution.
 *
 * Precon card data and art ship with the app (synced by scripts/sync-precons.mjs)
 * so the first launch is instant and offline-capable; anything outside the
 * bundle resolves to Scryfall's image CDN, whose URL is derivable from the
 * card id alone - no API round-trip needed just to show a card.
 */

export interface PreconCard {
  id: string;
  oracleId: string;
  name: string;
  quantity: number;
  board: string;
  manaCost: string;
  manaValue: number;
  typeLine: string;
  oracleText: string;
  colors: string[];
  colorIdentity: string[];
  rarity?: string;
  artist?: string;
  flavorText?: string;
  power?: string;
  toughness?: string;
}

export interface Precon {
  id: string;
  name: string;
  code: string;
  releaseDate: string;
  format: string;
  productType: string;
  strategy: string;
  cards: PreconCard[];
}

export const PRECONS: Precon[] = (preconData as { decks: Precon[] }).decks;

/** Every bundled printing, for cache-aware image resolution. */
const BUNDLED_IDS = new Set<string>(PRECONS.flatMap((deck) => deck.cards.map((card) => card.id)));

const BASE = import.meta.env.BASE_URL;

/** The `normal`-size card front for any Scryfall id: bundled cache first, CDN otherwise. */
export function cardImage(scryfallId: string | undefined): string {
  if (!scryfallId) return '';
  if (BUNDLED_IDS.has(scryfallId)) return `${BASE}cache/cards/${scryfallId}.jpg`;
  return `https://cards.scryfall.io/normal/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`;
}

/** Bundled art crop - commanders only (hero imagery on Profile/Decks). */
export function commanderArt(scryfallId: string): string {
  return `${BASE}cache/art/${scryfallId}.jpg`;
}

const BUNDLED_ART = new Set(
  PRECONS.map((deck) => deck.cards.find((card) => card.board === 'commander')?.id).filter(
    (id): id is string => id !== undefined,
  ),
);

/**
 * The server's deck covers are `api.scryfall.com/cards/{id}?format=image`
 * redirects (full card scans, border included). Pull the id back out so
 * surfaces that want pure artwork can use the art crop instead.
 */
export function coverArtCrop(coverImageUrl: string | undefined): string {
  const match = coverImageUrl?.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
  return match ? artCrop(match[1]) : (coverImageUrl ?? '');
}

/** The wide art-crop for any card: bundled for precon commanders, CDN otherwise. */
export function artCrop(scryfallId: string | undefined): string {
  if (!scryfallId) return '';
  if (BUNDLED_ART.has(scryfallId)) return commanderArt(scryfallId);
  return `https://cards.scryfall.io/art_crop/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`;
}

export function preconCommander(deck: Precon): PreconCard {
  return deck.cards.find((card) => card.board === 'commander') ?? deck.cards[0]!;
}

/** A precon as the protocol's deck-card list, ready to save to the server. */
export function preconDeckCards(deck: Precon): DeckCard[] {
  return deck.cards.map((card) => ({
    scryfallId: card.id,
    name: card.name,
    quantity: card.quantity,
    board: card.board === 'commander' ? 'commander' : 'main',
  }));
}

/** WUBRG order for pips and identity chips. */
export const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'] as const;

export const COLOR_NAMES: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};
