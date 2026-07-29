import catalogData from '../../data/catalog.json' with { type: 'json' };
import type { DeckCard } from '../net/types.ts';

/**
 * The Browse catalog: every preconstructed deck Wizards has ever boxed, from
 * the 1996 theme decks onward (synced from MTGJSON by scripts/sync-catalog.mjs).
 * Deck data ships in the bundle; artwork resolves through the Scryfall CDN via
 * cardImage()/artCrop() at view time.
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
  /** MTGJSON's product type: "Commander Deck", "Duel Deck", "Theme Deck"... */
  type?: string;
  date: string;
  /** The deck's colour identity: its commander's, or what the list plays. */
  ci?: string[];
  /** The card that stands in as the deck's face when it has no commander. */
  face?: { sid: string; name: string };
  commanders: CatalogCommander[];
  cards: [sid: string, name: string, qty: number][];
}

export const CATALOG: CatalogDeck[] = (catalogData as unknown as { decks: CatalogDeck[] }).decks;

/**
 * Thirty-odd MTGJSON product types is too many to put on a filter row, and
 * most of the distinctions are marketing rather than gameplay. These are the
 * families a player actually picks between.
 */
export type DeckFamily = 'commander' | 'duel' | 'starter' | 'competitive' | 'multiplayer' | 'jumpstart' | 'other';

const FAMILY: Record<string, DeckFamily> = {
  'Commander Deck': 'commander',
  'MTGO Commander Deck': 'commander',
  'Brawl Deck': 'commander',
  'Historic Brawl Precon Deck': 'commander',
  'Duel Deck': 'duel',
  'MTGO Duel Deck': 'duel',
  'Duel Of The Planeswalkers Deck': 'duel',
  'Premium Deck': 'duel',
  'Theme Deck': 'starter',
  'MTGO Theme Deck': 'starter',
  'Intro Pack': 'starter',
  'Welcome Deck': 'starter',
  'Starter Deck': 'starter',
  'Starter Kit': 'starter',
  'Arena Starter Deck': 'starter',
  'Arena Starter Kit': 'starter',
  'Spellslinger Starter Kit': 'starter',
  'Planeswalker Deck': 'starter',
  'Deck Builder\u2019s Toolkit': 'starter',
  "Deck Builder's Toolkit": 'starter',
  'Guild Kit': 'starter',
  'Demo Deck': 'starter',
  'Halfdeck': 'starter',
  'Challenger Deck': 'competitive',
  'Pioneer Challenger Deck': 'competitive',
  'Event Deck': 'competitive',
  'Modern Event Deck': 'competitive',
  'Clash Pack': 'competitive',
  'Pro Tour Deck': 'competitive',
  'World Championship Deck': 'competitive',
  'Advanced Deck': 'competitive',
  'Advanced Pack': 'competitive',
  'Enhanced Deck': 'competitive',
  'Planechase Deck': 'multiplayer',
  'Archenemy Deck': 'multiplayer',
  'Game Night Deck': 'multiplayer',
  'Challenge Deck': 'multiplayer',
  Jumpstart: 'jumpstart',
};

export function deckFamily(type: string | undefined): DeckFamily {
  return (type && FAMILY[type]) || 'other';
}

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
  const fromCommanders = [...new Set(deck.commanders.flatMap((commander) => commander.ci))];
  // Most of the catalogue has no commander at all - a theme deck, a duel deck -
  // so fall back to the identity the sync computed from the whole list.
  return fromCommanders.length > 0 ? fromCommanders : (deck.ci ?? []);
}

/** The card that represents a deck on a tile: its commander, else the face the
 *  sync picked (the first non-basic-land it prints). */
export function catalogFace(deck: CatalogDeck): { sid: string; name: string } | undefined {
  const commander = deck.commanders[0];
  if (commander) return { sid: commander.sid, name: commander.name };
  return deck.face;
}
