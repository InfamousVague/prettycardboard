import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/* ===========================================================================
   Deck-builder scrolling (decision 11)
   ===========================================================================

   Measured on a landscape phone the editor was thirty-one screens tall with
   nothing pinned: the search field - the one control you use over and over -
   scrolled away after the first flick and never came back without a trip to
   the top. Decision 11 is "sticky search plus a virtualized list, hero
   collapses on scroll", explicitly NOT the split pane.

   The sticky part is pure CSS (decks.css). This file is the two measured
   pieces: when the hero should give its height back, and which slice of a card
   grid actually needs to exist in the DOM.

   Everything here is layout maths off the live scroller, so a rotation is just
   another measurement - no component swaps, nothing unmounts because the
   orientation changed (decision 6).
   =========================================================================== */

/**
 * The element that actually scrolls this subtree. In the app shell that is
 * `.appContent` ("the only thing that scrolls"), but the walk is by computed
 * style rather than class name so a deck editor rendered anywhere else - a
 * modal, a future docked panel - still finds its own scrollport.
 *
 * `null` means the document itself scrolls; every caller reads the viewport
 * instead in that case.
 */
export function findScrollParent(node: Element | null): HTMLElement | null {
  for (let el = node?.parentElement ?? null; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return el;
  }
  return null;
}

/**
 * Run `read` whenever the scroller moves or the viewport changes shape.
 *
 * Deliberately NOT rAF-coalesced. Browsers already fire at most one scroll
 * event per frame, so a rAF hop buys nothing and costs correctness: a rAF
 * queued in a hidden page (an embedded preview, a background tab) never runs,
 * which would leave the window frozen at whatever it measured last.
 */
function onScrollFrame(
  scroller: HTMLElement | null,
  read: () => void,
  /** Watched for WIDTH only. Height is deliberately ignored: a windowed grid
      changes its own height as it re-windows, and reacting to that would be a
      loop with no fixed point. */
  widthOf?: HTMLElement | null,
): () => void {
  const target: EventTarget = scroller ?? window;
  target.addEventListener('scroll', read, { passive: true });
  window.addEventListener('resize', read);
  window.addEventListener('orientationchange', read);
  // A resize the window never hears about still changes the answer: the shell
  // sidebar opening re-flows the column count, the phone rail arriving on a
  // rotation changes the scrollport height.
  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    let lastWidth = widthOf?.clientWidth ?? -1;
    observer = new ResizeObserver((entries) => {
      const onlyWidthTarget = widthOf && entries.every((entry) => entry.target === widthOf);
      if (onlyWidthTarget) {
        if (widthOf.clientWidth === lastWidth) return;
        lastWidth = widthOf.clientWidth;
      }
      read();
    });
    if (scroller) observer.observe(scroller);
    if (widthOf) observer.observe(widthOf);
  }
  return () => {
    target.removeEventListener('scroll', read);
    window.removeEventListener('resize', read);
    window.removeEventListener('orientationchange', read);
    observer?.disconnect();
  };
}

/* ---------- hero collapse ---------- */

/**
 * Dead band between the two thresholds. Small, because the thresholds are
 * already a whole hero apart; it only has to absorb sub-pixel rounding.
 */
const HERO_DEADBAND = 8;

/**
 * True once the reader has scrolled past the hero, so its art band, its
 * floating commander and its stats shelf can hand back the height they are
 * costing - measured at 352px against a 375px landscape viewport.
 *
 * Both thresholds are the hero's OWN height rather than some small constant,
 * and that is the whole design:
 *
 *   collapse when scrollTop > expanded height  (the hero is off screen)
 *   expand   when scrollTop <= collapsed height (the band is fully back)
 *
 * Collapsing something still on screen would yank every row below it upwards
 * by 268px mid-read. Collapsing it once it is out of view is invisible, and
 * the payoff is on the way back: the return trip to the top costs a band
 * instead of a billboard, and the whole page is 268px shorter.
 *
 * Two things then have to be true or it oscillates.
 *
 * 1. The scroll offset has to be corrected by the height that vanished, or the
 *    rows below jump. Chrome and Firefox do this themselves (scroll anchoring);
 *    Safari - which is every iPhone - does not. So the layout effect below
 *    checks whether the browser already moved us and does it by hand when it
 *    has not, instead of assuming either way and being wrong on half the fleet.
 *
 * 2. After that correction the offset must land inside the dead band. It does,
 *    by construction: collapsing from T > E lands at T - (E - C) > C, and
 *    expanding from T <= C lands at T + (E - C) <= E. Neither can trip the
 *    other, so a single flick cannot start a loop.
 *
 * The `runway` guard covers the remaining case - a deck short enough that
 * losing the hero leaves less scrollable distance than we are scrolled by,
 * where the browser would clamp us back to the top and re-expand.
 */
export function useHeroCollapse(hero: HTMLElement | null, enabled: boolean): boolean {
  const [collapsed, setCollapsed] = useState(false);
  // Measured on the way through, so the thresholds are the real heights rather
  // than guesses: `expanded` seeds from the first read, `collapsed` from the
  // first collapse. Until then the expand threshold is 0, which just means
  // "only at the very top" - correct, if conservative.
  const heights = useRef({ expanded: 0, collapsed: 0 });
  // Set by the read that flipped the state, consumed by the layout effect that
  // has to repair the scroll offset. Null when the flip came from anywhere
  // else (a rotation, a preference change) and there is nothing to repair.
  const pending = useRef<{ scroller: HTMLElement | null; top: number; height: number } | null>(null);
  // The scroll handler needs the live value and must not read it through a
  // state updater: the decision writes both refs above, and an updater is not
  // allowed to have side effects (React calls it twice under StrictMode).
  const isCollapsed = useRef(false);

  useEffect(() => {
    if (!enabled || !hero) {
      pending.current = null;
      isCollapsed.current = false;
      setCollapsed(false);
      return;
    }
    const scroller = findScrollParent(hero);
    const read = () => {
      const top = scroller ? scroller.scrollTop : window.scrollY;
      const view = scroller ? scroller.clientHeight : window.innerHeight;
      const full = scroller ? scroller.scrollHeight : document.documentElement.scrollHeight;
      const runway = full - view;
      const height = hero.offsetHeight;
      const was = isCollapsed.current;
      // Re-measure whichever height we are currently wearing, so a rotation
      // that re-wraps the meta row moves the threshold with it.
      heights.current[was ? 'collapsed' : 'expanded'] = height;
      const next = was
        ? top > heights.current.collapsed
        : top > heights.current.expanded + HERO_DEADBAND && runway > height + 64;
      if (next === was) return;
      isCollapsed.current = next;
      pending.current = { scroller, top, height };
      setCollapsed(next);
    };
    read();
    return onScrollFrame(scroller, read);
  }, [hero, enabled]);

  useLayoutEffect(() => {
    const flip = pending.current;
    pending.current = null;
    if (!hero) return;
    const height = hero.offsetHeight;
    heights.current[collapsed ? 'collapsed' : 'expanded'] = height;
    if (!flip) return;
    const scroller = flip.scroller;
    const now = scroller ? scroller.scrollTop : window.scrollY;
    // The browser compensated already (scroll anchoring) if we are no longer
    // where the read left us; only step in when nothing moved.
    if (Math.abs(now - flip.top) > 1) return;
    const want = Math.max(0, now - (flip.height - height));
    if (scroller) scroller.scrollTop = want;
    else window.scrollTo(0, want);
  }, [collapsed, hero]);

  return enabled && collapsed;
}

/* ---------- windowed card grid ---------- */

/** Print ratio of a card face, which is exactly what a grid cell is tall. */
const CARD_RATIO = 680 / 488;
/** Rows kept mounted above and below the visible band, so a fast flick has
    something to show before the next measurement lands - and so a long-press
    menu opened on a visible card cannot be unmounted by a small nudge. */
const OVERSCAN_ROWS = 2;
/**
 * Below this a grid is cheaper to render whole than to measure. A Commander
 * list's biggest bucket (lands, creatures) runs 35-40 cards; the type groups
 * under it are single screens and stay untouched, animations and all.
 */
export const WINDOW_MIN_CARDS = 30;

export interface CardWindow {
  /** First card index to mount. */
  start: number;
  /** One past the last card index to mount. */
  end: number;
  /** Height of the filler row standing in for the rows above `start`. */
  padStart: number;
  /** Height of the filler row standing in for the rows below `end`. */
  padEnd: number;
  /** False when the whole grid is mounted (small groups, or pre-measurement). */
  active: boolean;
}

function wholeGrid(total: number): CardWindow {
  return { start: 0, end: total, padStart: 0, padEnd: 0, active: false };
}

function same(a: CardWindow, b: CardWindow): boolean {
  return (
    a.start === b.start &&
    a.end === b.end &&
    a.active === b.active &&
    Math.abs(a.padStart - b.padStart) < 0.5 &&
    Math.abs(a.padEnd - b.padEnd) < 0.5
  );
}

/**
 * Which slice of a `.deckCardGrid` to mount, plus the two filler heights that
 * keep the grid exactly as tall as if all of it were there.
 *
 * The geometry, for a grid of `rows` rows of height `h` separated by gap `g`:
 * a full-width filler occupies one grid row, so standing in for `n` leading
 * rows costs `n * (h + g) - g` - the trailing gap is the grid's own. The same
 * expression covers the trailing filler, and the two together reproduce
 * `rows * h + (rows - 1) * g` exactly, which is why the scrollbar never
 * twitches as the window slides.
 *
 * Cell height comes from the resolved column track times the print ratio, so
 * it is known before a single card has painted and stays known when the window
 * has scrolled past the end of the grid and there is no cell left to measure.
 * A real cell, when one exists, wins - it is the truth if the styles ever move.
 */
export function useCardWindow(grid: HTMLElement | null, total: number): CardWindow {
  const [win, setWin] = useState<CardWindow>(() => wholeGrid(total));
  // Read on every commit as well as on every scroll: the hero collapsing, a
  // filter chip firing or a sibling group changing all move this grid without
  // anybody scrolling.
  const readRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!grid || total < WINDOW_MIN_CARDS) {
      setWin((prev) => (prev.active || prev.end !== total ? wholeGrid(total) : prev));
      readRef.current = null;
      return;
    }
    const scroller = findScrollParent(grid);
    const read = () => {
      const style = getComputedStyle(grid);
      const cols = style.gridTemplateColumns.split(' ').filter(Boolean).length;
      const gap = Number.parseFloat(style.rowGap) || 0;
      const track = Number.parseFloat(style.gridTemplateColumns) || 0;
      // The resolved track times the print ratio is the cell height to the
      // sub-pixel, because a cell holds nothing but a `fluid` GameCard
      // (width: 100%, aspect-ratio: 488/680). offsetHeight would round, and a
      // rounding error multiplied by twenty rows is a drifting scrollbar. The
      // measurement is kept as a tripwire: if a cell ever grows something the
      // ratio does not know about, it disagrees by more than a rounding and
      // wins.
      const derived = track * CARD_RATIO;
      const measured = grid.querySelector<HTMLElement>('.deckCardCell')?.offsetHeight ?? 0;
      const cellH = derived > 0 && (measured === 0 || Math.abs(measured - derived) <= 1) ? derived : measured;
      if (cols < 1 || cellH <= 0) {
        setWin((prev) => (same(prev, wholeGrid(total)) ? prev : wholeGrid(total)));
        return;
      }

      const rowH = cellH + gap;
      const rows = Math.ceil(total / cols);
      // Where the visible band sits inside this grid's own box.
      const bandTop = (scroller ? scroller.getBoundingClientRect().top : 0) - grid.getBoundingClientRect().top;
      const bandHeight = scroller ? scroller.clientHeight : window.innerHeight;

      const first = Math.min(rows, Math.max(0, Math.floor(bandTop / rowH) - OVERSCAN_ROWS));
      const last = Math.max(first, Math.min(rows, Math.ceil((bandTop + bandHeight) / rowH) + OVERSCAN_ROWS));
      const trailing = rows - last;
      const next: CardWindow = {
        start: first * cols,
        end: Math.min(total, last * cols),
        padStart: first > 0 ? first * rowH - gap : 0,
        padEnd: trailing > 0 ? trailing * rowH - gap : 0,
        active: true,
      };
      setWin((prev) => (same(prev, next) ? prev : next));
    };
    readRef.current = read;
    read();
    const stop = onScrollFrame(scroller, read, grid);
    return () => {
      readRef.current = null;
      stop();
    };
  }, [grid, total]);

  // No dependency array on purpose - see readRef above.
  useEffect(() => {
    readRef.current?.();
  });

  return win;
}
