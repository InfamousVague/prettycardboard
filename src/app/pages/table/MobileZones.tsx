import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useT } from '../../i18n.ts';

/** How far a finger must travel sideways before it counts as a swipe. */
const SWIPE_PX = 32;
/** Movement under this still counts as a tap on the deck. */
const TAP_PX = 8;

/**
 * The phone home for the zone piles: a row anchored to the bottom-inline start
 * of the board. The library sits on the floor; swiping right off it deals the
 * graveyard, exile and command piles out beside it, and swiping left gathers
 * them back in.
 *
 * The deck's own tap still draws - the swipe surface forwards a tap straight to
 * the library button underneath - so opening the zones never costs the most
 * common action on the board.
 *
 * The piles inside are the same <ZonePiles> the desktop board renders, so their
 * behaviour - draw, drag a card out, drop one back in, long-press menus - can
 * never drift; this only chooses where they live on a phone.
 */
export function MobileZones({
  piles,
  peek,
  open,
  onOpenChange,
}: {
  piles: ReactNode;
  peek: number;
  /** Controlled by the board, which also opens the row when a dragged card
   *  rests on the deck and closes it on a leftward swipe across the piles. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const setOpen = onOpenChange;
  const dealt = open;
  const rootRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (event: ReactPointerEvent) => {
    // Primary/left only: a right-press would otherwise fall through onPointerUp
    // to .pileBtn.click() and draw a card, and a second finger would rewrite the
    // first one's swipe origin (start is a single ref).
    if (!event.isPrimary || event.button !== 0) return;
    start.current = { x: event.clientX, y: event.clientY };
    // The surface is only a card wide: without capture the finger leaves it
    // before the swipe threshold is met and the moves stop arriving.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const from = start.current;
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    // Sideways intent only: a vertical drag is reaching for something else.
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dy) > Math.abs(dx)) return;
    setOpen(dx > 0);
    start.current = null;
  };

  const onPointerUp = (event: ReactPointerEvent) => {
    const from = start.current;
    start.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!from) return;
    // A tap, not a swipe: hand it to the deck so it still draws a card.
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) <= TAP_PX) {
      rootRef.current?.querySelector<HTMLButtonElement>('.zonePiles > :first-child .pileBtn')?.click();
    }
  };

  return (
    <div
      ref={rootRef}
      className="mobileZones"
      data-open={dealt || undefined}
      style={{ ['--pc-zone-peek' as string]: `${peek}px` }}
    >
      {piles}
      {/* The swipe surface over the deck's face: swipe right to deal the zones
          out, left to gather them back, tap to draw. */}
      <div
        className="mobileZonesSwipe"
        role="button"
        tabIndex={0}
        aria-label={dealt ? t('tblZonesHide') : t('tblZonesOpen')}
        aria-expanded={dealt}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          start.current = null;
        }}
        onKeyDown={(event) => {
          // Keyboard parity for the swipe.
          if (event.key === 'ArrowRight') setOpen(true);
          else if (event.key === 'ArrowLeft') setOpen(false);
        }}
      />
    </div>
  );
}
