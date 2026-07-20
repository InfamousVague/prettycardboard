import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GameCard } from './GameCard.tsx';
import { CardDetailsBody, primeDetails } from './cardDetails.tsx';
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

/** A card is previewable if it is small enough (skip already-big cards), and not
 *  the fullscreen CardPopup nor the decorative login fan. offsetWidth is the true
 *  layout width (getBoundingClientRect is rotation-inflated). */
function previewable(el: Element | null): el is Element {
  return (
    !!el &&
    (el as HTMLElement).offsetWidth <= MAX_ANCHOR_W &&
    !el.closest('.cpStage') &&
    !el.closest('.onboarding')
  );
}

export function HoverCardLayer() {
  const [hover, setHover] = useState<HoverState | null>(null);
  // The card currently on screen (null = nothing shown). Used to switch targets
  // and to gate the scroll handler.
  const shownEl = useRef<Element | null>(null);
  const revealTimer = useRef<number | undefined>(undefined);
  const revealPending = useRef(false);
  const hideTimer = useRef<number | undefined>(undefined);
  // The last previewable card the pointer was over — a fallback for elementFromPoint.
  const currentCard = useRef<Element | null>(null);
  // Live pointer position, so the reveal fires on whatever card is ACTUALLY under
  // the pointer when the rest completes - not whichever element a churny
  // pointerover last named. This is what makes the fanned hand work: its dock
  // magnification constantly re-stacks overlapping cards under a resting pointer.
  const pointer = useRef({ x: 0, y: 0 });

  const clearReveal = useCallback(() => {
    window.clearTimeout(revealTimer.current);
    revealPending.current = false;
  }, []);
  const cancelHide = useCallback(() => window.clearTimeout(hideTimer.current), []);
  const hide = useCallback(() => {
    clearReveal();
    cancelHide();
    shownEl.current = null;
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
      if (!(el as HTMLElement).isConnected) return;
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
      // Mount the details panel whenever the card has an id. Cyberpunk and cached
      // MTG fill instantly; an uncached MTG card shows its name right away and the
      // rules fill in a beat later (primeDetails + the panel's own fetch), so the
      // details are always there to read/scroll rather than withheld on first rest.
      primeDetails(id);
      const details = !!id;
      // Put the details panel wherever there's more room next to the zoom.
      const roomRight = window.innerWidth - (x + PREVIEW_W / 2);
      const side: 'left' | 'right' = roomRight >= DETAIL_W + GAP + 8 ? 'right' : 'left';
      shownEl.current = el;
      setHover({ name, image: src, id, x, y, below, side, details });
    };

    // Begin (or leave running) the rest countdown. It reveals whatever card is
    // under the pointer WHEN IT FIRES - read fresh from elementFromPoint - so the
    // hand fan's dock magnification churning the element under a resting pointer
    // never prevents the reveal.
    const startReveal = () => {
      window.clearTimeout(revealTimer.current);
      revealPending.current = true;
      revealTimer.current = window.setTimeout(() => {
        revealPending.current = false;
        // Prefer whatever is ACTUALLY under the pointer now (so the hand's
        // magnification churn is irrelevant). A null result means a degenerate
        // zero-size viewport (only in tests) - trust the tracked card there.
        const under = document.elementFromPoint(pointer.current.x, pointer.current.y);
        const el = under ? (under.closest?.('[data-preview-src]') ?? null) : currentCard.current;
        if (previewable(el)) reveal(el);
      }, DELAY_MS);
    };

    const onMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };

    const onOver = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // Over the preview itself (its zoom card or details panel): keep it alive.
      if (target?.closest?.('.hoverCard')) {
        cancelHide();
        return;
      }
      const el = target?.closest?.('[data-preview-src]') ?? null;
      if (previewable(el)) {
        cancelHide();
        currentCard.current = el;
        if (shownEl.current) {
          // A preview is up. Switch only for a genuinely different card (the
          // magnification churn re-fires this for the same one).
          if (el !== shownEl.current) {
            shownEl.current = null;
            setHover(null);
            startReveal();
          }
          return;
        }
        // No preview yet: start the countdown once, and do NOT restart it while it
        // runs - that is what lets a rest on the fanned hand actually complete.
        if (!revealPending.current) startReveal();
        return;
      }
      // Not over a previewable card and not over the preview.
      if (shownEl.current) {
        // Preview up: grace-hide so a move toward it can catch and keep it.
        scheduleHide();
      } else if (!revealPending.current) {
        // Nothing pending: idle. (A pending countdown is left alone - it self-gates
        // on elementFromPoint at fire time, so a transient off-card blip is fine.)
        window.clearTimeout(revealTimer.current);
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
      const anchor = shownEl.current;
      if (!anchor || !scrolled || scrolled === document || (scrolled as Node).contains?.(anchor)) {
        hide();
      }
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('pointermove', onMove, true);
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
