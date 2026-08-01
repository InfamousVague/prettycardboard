import { useEffect, useState } from 'react';

/**
 * Back / forward for the desktop title bar. The app routes by hash, so the
 * browser history already holds the trail - what it does not expose is WHERE
 * in the trail we are, and without that the arrows cannot dim at the ends.
 *
 * So each entry gets numbered: the first time we land on an unstamped entry it
 * is stamped (via replaceState, which creates no entry of its own) with one
 * more than the entry we came from, and the highest number seen is kept in
 * sessionStorage. Traveling lands on already-stamped entries, so position and
 * high-water mark together give canBack / canForward. sessionStorage is per
 * tab and survives reload, exactly the lifetime of the tab's history.
 */

const CUR_KEY = 'pc.nav.cur';
const MAX_KEY = 'pc.nav.max';

function stampedIdx(): number | null {
  const state: unknown = window.history.state;
  if (state && typeof state === 'object' && 'pcNavIdx' in state) {
    const idx = (state as { pcNavIdx: unknown }).pcNavIdx;
    if (typeof idx === 'number') return idx;
  }
  return null;
}

export function useHistoryNav(enabled: boolean): {
  canBack: boolean;
  canForward: boolean;
  back: () => void;
  forward: () => void;
} {
  const [can, setCan] = useState({ canBack: false, canForward: false });

  useEffect(() => {
    if (!enabled) return;
    const sync = () => {
      let idx = stampedIdx();
      if (idx === null) {
        // A NEW entry (fresh load, or a navigation that pushed one): number it
        // past the entry we came from. Pushing also destroyed any forward
        // branch, so the high-water mark resets here too.
        const prev = Number(sessionStorage.getItem(CUR_KEY) ?? '-1');
        idx = prev + 1;
        const state = window.history.state;
        window.history.replaceState(
          { ...(typeof state === 'object' && state !== null ? state : {}), pcNavIdx: idx },
          '',
        );
        sessionStorage.setItem(MAX_KEY, String(idx));
      }
      sessionStorage.setItem(CUR_KEY, String(idx));
      const max = Number(sessionStorage.getItem(MAX_KEY) ?? String(idx));
      setCan({ canBack: idx > 0, canForward: idx < max });
    };
    sync();
    // Both fire for a hash navigation; sync is idempotent (the second call
    // finds the entry already stamped).
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [enabled]);

  return {
    ...can,
    back: () => window.history.back(),
    forward: () => window.history.forward(),
  };
}
