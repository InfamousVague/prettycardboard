import type { CardInst, DeckCard } from '../net/types.ts';

/**
 * Which cards wear the holo-foil sheen (GameCard's `foil` layer).
 *
 * The rule lives here rather than being re-decided at each render site, so a
 * card that shimmers in the deck editor also shimmers in hand, on the
 * battlefield, in a pile and in the lightbox. It used to be hardcoded per
 * call site, which is why the table showed none at all.
 *
 * Today "marked as foil" means an explicit `foil` flag when something set one
 * (booster pulls carry theirs), otherwise the card's role: commanders and
 * Cyberpunk legends are a deck's showcase card and have always been drawn
 * foil. When a persisted per-card foil flag lands, this is the one place that
 * needs to learn about it.
 */
export function isFoil(card: { foil?: boolean; isCommander?: boolean; board?: string } | null | undefined): boolean {
  if (!card) return false;
  if (card.foil !== undefined) return card.foil;
  return card.isCommander === true || card.board === 'commander';
}

/** Convenience for the table, where cards arrive as instances. */
export function isFoilInst(card: CardInst | null | undefined): boolean {
  return isFoil(card as { foil?: boolean; isCommander?: boolean } | null | undefined);
}

/** Convenience for deck lists, where foil follows the board a card sits on. */
export function isFoilDeckCard(card: DeckCard | null | undefined): boolean {
  return isFoil(card as { board?: string } | null | undefined);
}
