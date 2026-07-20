import preconData from '../../data/precons.json' with { type: 'json' };
import type { DeckCard } from '../net/types.ts';
import type { Precon, PreconCard } from './cards.ts';

/**
 * The full bundled Final Fantasy Commander precon decklists (~850KB).
 *
 * This is the HEAVY half of the precon data and is deliberately kept out of the
 * always-loaded shell: import it only from lazy routes (Home, Browse, Profile,
 * Onboarding, the table), or dynamically (appStore seeding, the card-detail
 * popup). The light image-resolution helpers - which the whole app calls during
 * render - live in cards.ts and read only the tiny precon-ids manifest instead.
 */
export const PRECONS: Precon[] = (preconData as { decks: Precon[] }).decks;

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
