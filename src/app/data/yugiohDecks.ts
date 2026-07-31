import decksData from '../../data/yugioh-decks.json' with { type: 'json' };

/**
 * The Browse catalog of official Yu-Gi-Oh! deck products — every Starter Deck,
 * Structure Deck, and Speed Duel starter deck, reconstructed from YGOPRODeck's
 * set listings by scripts/sync-yugioh.mjs (the yugioh analogue of catalog.ts's
 * MTGJSON precons). Set listings carry no per-card counts, so every card is
 * qty 1 — a discovery approximation, not a tournament-legal list.
 *
 * IMPORTANT: this is a build-time import of a ~0.5MB JSON, so — exactly like
 * catalog.ts — it must only ever be imported from the lazily-loaded Browse
 * route chunk (BrowsePage and friends), never from shell-loaded modules.
 *
 * Card ids are YGOPRODeck passcodes (the game's `scryfallId` slot, see
 * yugioh.ts); Extra Deck monsters ride the 'commander' board like the bundled
 * starters do.
 */

export type YugiohDeckKind = 'Starter' | 'Structure' | 'Speed Duel' | 'Other';

export interface YugiohDeckCard {
  /** YGOPRODeck passcode, unpadded decimal string. */
  id: string;
  name: string;
  qty: number;
  board: 'main' | 'commander';
}

export interface YugiohDeckProduct {
  /** Slug of the full product set name ("starter-deck-yugi"). */
  id: string;
  /** Product name with the kind affix stripped ("Yugi", "Dragon's Roar"). */
  name: string;
  kind: YugiohDeckKind;
  /** Set-code prefix ("SDY"). */
  code: string;
  /** Exact release date (YYYY-MM-DD), or '' when the set index lacks one. */
  date: string;
  /** Cover card passcode: the product's highest-ATK monster. */
  cover: string;
  cards: YugiohDeckCard[];
}

const DECKS = (decksData as unknown as { decks: YugiohDeckProduct[] }).decks;

/** Every official deck product, sorted oldest → newest, then by name. */
export function yugiohDeckCatalog(): YugiohDeckProduct[] {
  return DECKS;
}
