import { useSyncExternalStore } from 'react';
import { usePreference } from './usePreference.ts';

/**
 * Phone-layout detection for the adaptive mobile UI. Auto mode keys off
 * viewport width (700px covers phones in both orientations without catching
 * small desktop windows people play windowed in), and the preference can
 * force it either way - research note: never trust auto-detection alone
 * (Hearthstone famously served its tablet UI to phones).
 */
export const PHONE_QUERY = '(max-width: 700px), (max-height: 480px)';

const query = typeof window !== 'undefined' ? window.matchMedia(PHONE_QUERY) : null;

/**
 * matchMedia change is the primary signal, but some engines miss it when the
 * viewport changes without a real device rotation (desktop window resizes,
 * embedded webviews). resize/orientationchange backstop it; useSyncExternalStore
 * only re-renders when the boolean actually flips, so the extra traffic is free.
 */
function listen(mql: MediaQueryList | null, onChange: () => void): () => void {
  mql?.addEventListener('change', onChange);
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  return () => {
    mql?.removeEventListener('change', onChange);
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
  };
}

function subscribe(onChange: () => void): () => void {
  return listen(query, onChange);
}

function snapshot(): boolean {
  return query?.matches ?? false;
}

/** Raw media-query state (no preference override) - for non-table surfaces. */
export function usePhoneViewport(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** The table's effective mobile mode: preference override, else the viewport. */
export function useMobileLayout(): boolean {
  const pref = usePreference('mobileLayout');
  const viewport = usePhoneViewport();
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return viewport;
}

const portraitQuery = typeof window !== 'undefined' ? window.matchMedia('(orientation: portrait)') : null;

function subscribePortrait(onChange: () => void): () => void {
  return listen(portraitQuery, onChange);
}

/** Portrait orientation - the live board asks phones to rotate to landscape. */
export function usePortrait(): boolean {
  return useSyncExternalStore(subscribePortrait, () => portraitQuery?.matches ?? false, () => false);
}
