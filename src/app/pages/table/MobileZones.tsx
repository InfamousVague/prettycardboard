import type { ReactNode } from 'react';

/**
 * The phone home for the zone piles: a rail along the bottom-inline start of
 * the board carrying all four zones at once - library, graveyard, exile and
 * command - with the deck at full card size and the rest at a narrower
 * secondary width.
 *
 * It used to be a cascade you swiped the deck to deal out. That failed for a
 * reason no amount of polish fixes: the three hidden zones render nothing at
 * all when they are empty, which is exactly the state a game starts in, so at
 * the moment a player first needs to find them there was no deck-plus-something
 * to hint that anything was stacked behind the library - only a lone deck and
 * an invisible gesture. Dropping a card into the graveyard needed that gesture
 * first (or a half-second dwell over the deck, which is just as unfindable).
 *
 * Every zone being on screen makes each one a standing drop target and a
 * standing tap target, which is what the piles already wanted to be: the piles
 * inside are the same <ZonePiles> the desktop board renders, so draw, drag out,
 * drop back and the long-press menus are the desktop behaviours unchanged. This
 * only chooses where they live on a phone.
 */
export function MobileZones({ piles, peek }: { piles: ReactNode; peek: number }) {
  return (
    <div className="mobileZones" style={{ ['--pc-zone-peek' as string]: `${peek}px` }}>
      {piles}
    </div>
  );
}
