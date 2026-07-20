import { resolveCardImage } from './games.ts';
import { coverArtCrop } from './cards.ts';

/** The cover fields a DeckSummary carries. */
interface CoverLike {
  coverImageUrl?: string | null;
  coverCardId?: string | null;
  game: string;
}

/**
 * The full-card cover image for a deck summary (tiles, stacks, GameCard). MTG
 * ships a Scryfall scan URL; Cyberpunk resolves its bundled art from the cover
 * card id.
 */
export function deckSummaryCover(deck: CoverLike): string | undefined {
  if (deck.coverImageUrl) return deck.coverImageUrl;
  if (deck.coverCardId) return resolveCardImage(deck.game, deck.coverCardId);
  return undefined;
}

/**
 * Wide art for a deck summary (hero backgrounds, thumbs). MTG uses the Scryfall
 * art crop; Cyberpunk has no crop, so it falls back to the full rendered card.
 */
export function deckSummaryArt(deck: CoverLike): string {
  if (deck.coverImageUrl) return coverArtCrop(deck.coverImageUrl);
  if (deck.coverCardId) return resolveCardImage(deck.game, deck.coverCardId);
  return '';
}
