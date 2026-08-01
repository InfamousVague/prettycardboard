import { useEffect, useState } from 'react';

/**
 * The desktop title bar's three portal slots. In the Tauri shell the in-match
 * top strip does not get its own row: the table portals its clusters into the
 * window chrome instead - identity into the start slot, the phase ribbon into
 * the center, the table actions into the end - so the board keeps the height a
 * second bar would have spent.
 *
 * The ids live here rather than in App.tsx because TablePage needs them too,
 * and importing App from a page App renders is a cycle.
 */
export const TITLEBAR_DOCK_START_ID = 'pc-titlebar-start';
export const TITLEBAR_DOCK_CENTER_ID = 'pc-titlebar-center';
export const TITLEBAR_DOCK_END_ID = 'pc-titlebar-end';

/** Resolve a dock slot after mount. The TitleBar commits in the same React
 *  pass as the page, so the element exists by the time effects run; state (not
 *  a ref) so the portal renders once it is found. */
export function useDockElement(id: string, want: boolean): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(want ? document.getElementById(id) : null);
  }, [id, want]);
  return want ? el : null;
}

/* The bar is one fixed-height row with no wrap, so unlike the strip it
   replaces it cannot grow a second line when a match's chrome outgrows the
   window. Below this width the table keeps its own wrapping row instead -
   docking must never make End turn unreachable. 64rem is the Tauri window's
   own minWidth, so in practice every desktop window docks; the floor only
   bites if the shell ever allows narrower. The dock-side shedding rules in
   table.css (labels, code text, chips, clock, phase stops) are what make the
   bar actually fit down at that floor. */
const WIDE_QUERY = '(min-width: 64rem)';

/** True while the window is wide enough for the strip to ride the title bar. */
export function useWideChrome(): boolean {
  const [wide, setWide] = useState<boolean>(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(WIDE_QUERY);
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return wide;
}
