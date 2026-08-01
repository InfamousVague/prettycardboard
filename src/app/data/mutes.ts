/**
 * Per-player squelch: chat and emotes from a muted player are hidden on THIS
 * client only (the table never knows). Persisted locally, keyed by user id.
 */
const KEY = 'pc.muted.v1';

function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

let muted = load();
const listeners = new Set<() => void>();

export function isMuted(userId: string): boolean {
  return muted.has(userId);
}

export function toggleMute(userId: string): boolean {
  if (muted.has(userId)) muted.delete(userId);
  else muted.add(userId);
  localStorage.setItem(KEY, JSON.stringify([...muted]));
  listeners.forEach((fn) => fn());
  return muted.has(userId);
}

/** Subscribe to mute changes (returns unsubscribe). */
export function onMutesChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
