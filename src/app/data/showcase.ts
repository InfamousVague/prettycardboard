import { useEffect, useState } from 'react';
import { useApp } from '../state/appStore.ts';

/**
 * The player's showcase deck: the one they've chosen to represent them. It is a
 * per-account local preference (nothing on the server cares which deck you're
 * showing off), read by the profile band's picker and by the home page's
 * backdrop.
 *
 * It lives here rather than inline in either page because two screens now share
 * the key, and a drifting key would silently give them different answers.
 */

const SHOWCASE_EVENT = 'pc:showcase';

function showcaseKey(userId: string): string {
  return `pc.showcase.${userId}`;
}

export function readShowcaseId(userId: string | null | undefined): string | null {
  if (!userId || typeof localStorage === 'undefined') return null;
  return localStorage.getItem(showcaseKey(userId));
}

/** Persist the pick and tell every mounted reader, so the home backdrop
 *  follows the profile picker without a reload. */
export function writeShowcaseId(userId: string, deckId: string): void {
  localStorage.setItem(showcaseKey(userId), deckId);
  window.dispatchEvent(new Event(SHOWCASE_EVENT));
}

/** The current account's showcase deck id, live. */
export function useShowcaseId(): string | null {
  const userId = useApp((state) => state.identity?.userId);
  const [id, setId] = useState<string | null>(() => readShowcaseId(userId));
  useEffect(() => {
    const sync = () => setId(readShowcaseId(userId));
    sync();
    window.addEventListener(SHOWCASE_EVENT, sync);
    // Another tab picking a different deck counts too.
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SHOWCASE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [userId]);
  return id;
}
