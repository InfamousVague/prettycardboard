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
