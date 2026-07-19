/**
 * Shareable table links. A table's invite URL is `<origin>/#/join/<CODE>`.
 *
 * When someone opens that link the code is stashed in sessionStorage before the
 * auth gate, so it survives signing up or logging in (and the reload that auth
 * may trigger). Once authenticated, the app resumes into the join screen for
 * that code. The stash is per-tab (sessionStorage), so opening two invites in
 * two tabs never crosses wires.
 */

const KEY = 'pc.pendingJoin';

/** Table codes are 6 chars A–Z0–9; accept 4–8 defensively and normalise case. */
export function joinCodeFromHash(hash: string): string | null {
  const match = /^#\/?join\/([A-Za-z0-9]{4,8})\/?$/.exec(hash);
  return match ? match[1]!.toUpperCase() : null;
}

export function rememberPendingJoin(code: string): void {
  try {
    sessionStorage.setItem(KEY, code);
  } catch {
    // Private-mode / storage-disabled: the in-memory store still carries it
    // for this session; only a mid-flow reload would lose it.
  }
}

export function peekPendingJoin(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingJoin(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** The absolute invite URL for a table code (hash-routed, so any deploy works). */
export function tableShareUrl(code: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/join/${code}`;
}
