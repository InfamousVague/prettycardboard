import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GameCard } from './GameCard.tsx';
import { CardDetailsBody, hasInstantDetails, primeDetails } from './cardDetails.tsx';
import './hovercard.css';

/**
 * Global hover-zoom. Resting the pointer on any front-facing card for a beat
 * floats a larger copy of it just above the card (or below, near the top edge),
 * with a readable details panel to one side — the same card data the fullscreen
 * CardPopup shows, so a quick rest reads rules text without a click. Driven
 * entirely by `data-preview-src` / `data-preview-name` attributes that GameCard
 * emits, so every card in the app participates with no per-site wiring.
 *
 * The preview is INTERACTIVE: you can slide the pointer off the card up into
 * the zoom and across to the details panel to scroll long rules text. A short
 * hide-grace timer bridges the small gap between the card and the preview, and
 * the preview keeps itself open while the pointer is over it. Mouse-only (touch
 * keeps tap -> the full CardPopup), and never shown on the login/onboarding
 * screen (its decorative card fan should not pop previews over the form).
 */

const DELAY_MS = 400; // rest this long before the preview appears
const HIDE_GRACE_MS = 220; // keep the preview alive this long after leaving the card, to bridge to it
const MAX_ANCHOR_W = 240; // only zoom cards smaller than this (skip already-big ones)
const PREVIEW_W = 320;
const RATIO = 680 / 488;
const GAP = 12;
const DETAIL_W = 264; // details panel width (matches the side offset in the CSS)

/** Pull the card id (a UUID) back out of its image URL — both the MTG
 *  (cache/cards/<id>.jpg, Scryfall CDN) and Cyberpunk (cache/cyberpunk/<id>.webp)
 *  paths embed it, so the details panel can resolve without extra wiring. */
function idFromSrc(src: string): string | undefined {
  return src.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
}

interface HoverState {
  name: string;
  image: string;
  id?: string;
  x: number;
  y: number;
  /** Placed below the card (near the top edge) rather than above it. */
  below: boolean;
  /** Details panel side: more room to the right vs. left of the zoom. */
  side: 'left' | 'right';
  /** Whether to mount the details panel (resolved without a network flash). */
  details: boolean;
}

export function HoverCardLayer() {
  const [hover, setHover] = useState<HoverState | null>(null);
  const anchorRef = useRef<Element | null>(null);
  const revealTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  // Whether a preview is currently on screen (a ref so the document listeners
  // read the latest value without re-subscribing).
  const shown = useRef(false);

  const clearReveal = useCallback(() => window.clearTimeout(revealTimer.current), []);
  const cancelHide = useCallback(() => window.clearTimeout(hideTimer.current), []);
  const hide = useCallback(() => {
    clearReveal();
    cancelHide();
    anchorRef.current = null;
    shown.current = false;
    setHover(null);
  }, [clearReveal, cancelHide]);
  // Leave the card (or the preview): hide after a short grace so the pointer can
  // bridge the gap between them without the preview vanishing underneath it.
  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimer.current = window.setTimeout(hide, HIDE_GRACE_MS);
  }, [cancelHide, hide]);

  useEffect(() => {
    // Hover-zoom is a fine-pointer affordance; touch keeps tap -> CardPopup.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const reveal = (el: Element) => {
      // The node was captured up to DELAY_MS ago. If the card was played or moved
      // out from under a still pointer during the rest, its .gcPerspective is
      // unmounted - and WebKit fires no fresh pointerover to cancel the timer, so
      // this fires on a detached node. A detached node still returns its
      // attributes (src stays truthy, the portal would mount), but
      // getBoundingClientRect() is all-zeros, which would pin a stray preview to
      // the top-left corner - read by the player as "no preview appeared". Bail.
      if (!(el as HTMLElement).isConnected) {
        anchorRef.current = null;
        return;
      }
      const src = el.getAttribute('data-preview-src');
      if (!src) return;
      const name = el.getAttribute('data-preview-name') ?? '';
      const rect = el.getBoundingClientRect();
      // A collapsed (zero-size) rect means the anchor is detached or hidden mid
      // rest; never place a preview from a degenerate rect.
      if (rect.width === 0 && rect.height === 0) return;
      const previewH = PREVIEW_W * RATIO;
      const x = Math.min(Math.max(rect.left + rect.width / 2, PREVIEW_W / 2 + 8), window.innerWidth - PREVIEW_W / 2 - 8);
      // Prefer floating above the card; drop below when there is no room up top.
      const below = rect.top - previewH - GAP < 8;
      const y = below ? rect.bottom + GAP : rect.top - GAP;
      const id = idFromSrc(src);
      // Prime the details cache for next time; only mount the panel now if we can
      // fill it without a network round-trip (bundled Cyberpunk / cached MTG), so
      // the panel never flashes in empty.
      primeDetails(id);
      const details = hasInstantDetails(id);
      // Put the details panel wherever there's more room next to the zoom.
      const roomRight = window.innerWidth - (x + PREVIEW_W / 2);
      const side: 'left' | 'right' = roomRight >= DETAIL_W + GAP + 8 ? 'right' : 'left';
      shown.current = true;
      setHover({ name, image: src, id, x, y, below, side, details });
    };

    const onOver = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // Over the preview itself (its zoom card or details panel): keep it alive,
      // and never treat the zoom's own card as a fresh anchor.
      if (target?.closest?.('.hoverCard')) {
        cancelHide();
        return;
      }
      const el = target?.closest?.('[data-preview-src]') ?? null;
      // Still resting on the same card: keep it (cancel any pending grace-hide).
      if (el && el === anchorRef.current) {
        cancelHide();
        return;
      }
      clearReveal();
      // A different previewable card. Skip already-big cards, the fullscreen
      // CardPopup, and the login/onboarding fan (decorative). offsetWidth is the
      // true layout width (getBoundingClientRect is rotation-inflated).
      if (
        el &&
        (el as HTMLElement).offsetWidth <= MAX_ANCHOR_W &&
        !el.closest('.cpStage') &&
        !el.closest('.onboarding')
      ) {
        cancelHide();
        anchorRef.current = el;
        shown.current = false;
        setHover(null);
        revealTimer.current = window.setTimeout(() => reveal(el), DELAY_MS);
      } else if (shown.current) {
        // Left the cards but a preview is up: grace-hide so a move toward the
        // preview can catch and keep it.
        scheduleHide();
      } else {
        anchorRef.current = null;
      }
    };

    // Clicking anywhere except inside the preview dismisses it.
    const onDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest?.('.hoverCard')) return;
      hide();
    };

    // A scroll only invalidates the preview when it actually moves the anchored
    // card. Scrolling INSIDE the details panel must keep it open (that is the
    // whole point). The page grid on Browse/Home contains the card (scrolling it
    // slides the card away -> hide), but the table's own scroll panels (move log,
    // library sidebar, pile viewer) do NOT contain a battlefield card, so their
    // scrolling must not cancel a hover. Capture-phase listening catches
    // inner-container scrolls (scroll events do not bubble); then gate on
    // containment (document contains everything).
    const onScroll = (event: Event) => {
      const scrolled = event.target as Node | null;
      if (scrolled instanceof Element && scrolled.closest('.hoverCard')) return;
      const anchor = anchorRef.current;
      if (!anchor || !scrolled || scrolled === document || (scrolled as Node).contains?.(anchor)) {
        hide();
      }
    };

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', hide);
      clearReveal();
      cancelHide();
    };
  }, [hide, cancelHide, scheduleHide, clearReveal]);

  if (!hover) return null;
  return createPortal(
    <div
      className="hoverCard"
      data-below={hover.below || undefined}
      data-side={hover.side}
      style={{
        left: hover.x,
        top: hover.y,
        transform: hover.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
      // Interactive: entering keeps it open, leaving starts the grace-hide.
      onPointerEnter={cancelHide}
      onPointerLeave={scheduleHide}
    >
      <GameCard name={hover.name} imageUrl={hover.image} width={PREVIEW_W} tilt={0} foil={false} />
      {hover.details && (
        <div className="hoverDetails" style={{ width: DETAIL_W }}>
          <CardDetailsBody scryfallId={hover.id} name={hover.name} compact headingLevel={3} />
        </div>
      )}
    </div>,
    document.body,
  );
}
