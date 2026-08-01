import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
} from 'react';

/**
 * Places a finger-anchored floating menu (docs/mobile-orientation.md, decision
 * 7) so it opens AT the touch point and stays inside the viewport.
 *
 * This replaces four hand-rolled clamps that each guessed the menu's height
 * with a different unrelated constant and each measured against
 * `window.innerHeight`. Both halves of that were wrong on a landscape phone:
 *
 * - The guesses were bigger than the screen. The card menu's read
 *   `Math.max(8, Math.min(y, window.innerHeight - 440))`; at 375px tall the
 *   inner term is -65, so the whole expression collapses to the constant 8 and
 *   EVERY long-press pinned the menu to the top edge, hundreds of pixels away
 *   from the finger. Nothing here guesses: the menu is measured after layout.
 * - `window.innerHeight` includes area the user cannot see. visualViewport is
 *   the visible rectangle - it excludes system UI and shrinks when the
 *   on-screen keyboard opens - so it is the box a menu must fit inside.
 *
 * The menu opens below the touch point, flips above it when there is no room,
 * and only then falls back to centring on the finger and clamping. Horizontal
 * placement follows the writing direction, so an RTL locale opens the menu
 * toward the inline-start edge the same way an LTR one opens toward inline-end.
 */

/** Breathing room kept between the menu and the viewport edge. */
const EDGE = 8;
/** Gap between the touch point and the menu, so the finger never covers it. */
const GAP = 12;

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));

export interface MenuAnchor<T extends HTMLElement> {
  /** Attach to the menu element - it is what gets measured. */
  ref: React.RefObject<T | null>;
  /** Spread onto the menu's `style`. Hidden for the single layout pass before
   *  the measurement lands, so the menu is never painted in the wrong place. */
  style: CSSProperties;
}

export function useMenuAnchor<T extends HTMLElement = HTMLDivElement>(
  x: number,
  y: number,
): MenuAnchor<T> {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const place = () => {
      const box = node.getBoundingClientRect();
      const view = window.visualViewport;
      const viewW = view?.width ?? window.innerWidth;
      const viewH = view?.height ?? window.innerHeight;

      const maxLeft = viewW - box.width - EDGE;
      const rtl = getComputedStyle(node).direction === 'rtl';
      const left = clamp(rtl ? x - box.width : x, EDGE, maxLeft);

      const below = y + GAP;
      const above = y - GAP - box.height;
      const preferred =
        below + box.height <= viewH - EDGE ? below : above >= EDGE ? above : y - box.height / 2;
      // Clamped unconditionally, not just on the fallback branch: `y` can land
      // outside the visible rectangle (a press captured just before the
      // keyboard opened, or a reflow that moved the pressed element), and a
      // menu placed relative to an off-screen point must still be on screen.
      const top = clamp(preferred, EDGE, viewH - box.height - EDGE);

      setPos((current) =>
        current && current.left === left && current.top === top ? current : { left, top },
      );
    };

    place();
    // A submenu expanding changes the height after the first measurement, and
    // a rotation changes the box to fit inside - both must re-place the menu
    // rather than leave it hanging off an edge.
    const observer = new ResizeObserver(place);
    observer.observe(node);
    window.visualViewport?.addEventListener('resize', place);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', place);
      window.removeEventListener('resize', place);
    };
  }, [x, y]);

  return {
    ref,
    style: pos ? { left: pos.left, top: pos.top } : { left: x, top: y, visibility: 'hidden' },
  };
}

/**
 * The same placement as a plain `<div>`, for the menus that are written inline
 * as conditional JSX and so have nowhere to call the hook themselves.
 */
export function AnchoredMenu({
  x,
  y,
  ...rest
}: { x: number; y: number } & Omit<ComponentPropsWithoutRef<'div'>, 'style'>) {
  const anchor = useMenuAnchor<HTMLDivElement>(x, y);
  return <div ref={anchor.ref} style={anchor.style} {...rest} />;
}
