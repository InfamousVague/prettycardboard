import catalogData from '../../data/catalog.json' with { type: 'json' };
import type { DeckCard } from '../net/types.ts';

/**
 * The Browse catalog: every Commander precon since 2020 (synced from MTGJSON
 * by scripts/sync-catalog.mjs). Deck data ships in the bundle; artwork
 * resolves through the Scryfall CDN via cardImage()/artCrop() at view time.
 */

export interface CatalogCommander {
  sid: string;
  name: string;
  ci: string[];
}

export interface CatalogDeck {
  id: string;
  name: string;
  code: string;
  date: string;
  commanders: CatalogCommander[];
  cards: [sid: string, name: string, qty: number][];
}

export const CATALOG: CatalogDeck[] = (catalogData as unknown as { decks: CatalogDeck[] }).decks;

/** Newest first, grouped by release year. */
export function catalogByYear(): { year: string; decks: CatalogDeck[] }[] {
  const groups = new Map<string, CatalogDeck[]>();
  for (const deck of CATALOG) {
    const year = deck.date.slice(0, 4);
    const list = groups.get(year);
    if (list) list.push(deck);
    else groups.set(year, [deck]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, decks]) => ({ year, decks }));
}

/**
 * Hand-picked shelf: the Bloomburrow (Ms. Bumbleflower) cycle and the Final
 * Fantasy cycle. Avatar: The Last Airbender shipped no official Commander
 * precons (only 6-card Scene Boxes and a reprint bundle), so it has no entry.
 */
const FEATURED_IDS = [
  'peace-offering-blc',
  'animated-army-blc',
  'family-matters-blc',
  'squirreled-away-blc',
  'scions-spellcraft-final-fantasy-xiv-fic',
  'limit-break-final-fantasy-vii-fic',
  'counter-blitz-final-fantasy-x-fic',
  'revival-trance-final-fantasy-vi-fic',
];

export function featuredDecks(): CatalogDeck[] {
  return FEATURED_IDS.map((id) => CATALOG.find((deck) => deck.id === id)).filter(
    (deck): deck is CatalogDeck => deck !== undefined,
  );
}

export function catalogCardCount(deck: CatalogDeck): number {
  return (
    deck.commanders.length + deck.cards.reduce((sum, [, , qty]) => sum + qty, 0)
  );
}

/** A catalog deck as the protocol's card list, ready for api.createDeck. */
export function catalogDeckCards(deck: CatalogDeck): DeckCard[] {
  return [
    ...deck.commanders.map((commander) => ({
      scryfallId: commander.sid,
      name: commander.name,
      quantity: 1,
      board: 'commander' as const,
    })),
    ...deck.cards.map(([sid, name, qty]) => ({
      scryfallId: sid,
      name,
      quantity: qty,
      board: 'main' as const,
    })),
  ];
}

/** Deck-wide color identity: the union of its commanders'. */
export function catalogIdentity(deck: CatalogDeck): string[] {
  return [...new Set(deck.commanders.flatMap((commander) => commander.ci))];
}
