/**
 * Shareable table links. A table's invite URL is `<origin>/#/join/<CODE>` on
 * the web, and always the public site's when shared from the desktop app.
 *
 * When someone opens that link the code is stashed in sessionStorage before the
 * auth gate, so it survives signing up or logging in (and the reload that auth
 * may trigger). Once authenticated, the app resumes into the join screen for
 * that code. The stash is per-tab (sessionStorage), so opening two invites in
 * two tabs never crosses wires.
 */

import { isTauri } from '../tauri.ts';

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

/**
 * Where the app lives on the public web. The desktop shell has no meaningful
 * origin of its own - `window.location` there is `tauri://localhost` (and
 * `http://tauri.localhost` on Windows), neither of which resolves for anyone
 * you send it to - so shares from the desktop app have to name the real site.
 */
const SITE_URL = 'https://prettycardboard.com';

/** The absolute invite URL for a table code (hash-routed, so any deploy works). */
export function tableShareUrl(code: string): string {
  // On the web, keep deriving it from wherever this build is actually served:
  // that keeps invites working on localhost, on a LAN box and on a preview
  // deploy without any of them having to know the production hostname.
  if (isTauri()) return `${SITE_URL}/#/join/${code}`;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/join/${code}`;
}
