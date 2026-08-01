import { isTauri } from './tauri.ts';
import pkg from '../../package.json' with { type: 'json' };

/**
 * OTA self-update for the desktop app. The updater plugin checks GitHub Releases
 * (`latest.json`, signed with the project's minisign key), downloads the signed
 * artifact for this platform, and relaunches. Everything is guarded by
 * `isTauri()` so the web build never touches the plugin — the dynamic imports
 * only run inside the desktop window.
 *
 * Download and install are separate steps here, not the plugin's atomic
 * `downloadAndInstall`. Fetching the bundle is harmless at any moment, so it
 * happens in the background; installing ends in relaunch(), which takes the
 * window away, so it stays behind an explicit ask. Policy for both lives in
 * updateStore/UpdateHost — this module is only the Tauri boundary.
 */

/** True when self-update is possible (i.e. running as the installed desktop app). */
export const canSelfUpdate = isTauri();

/**
 * How long a check may hang before we give up. `check()` took no options at
 * all until now, so a captive portal or a stalled CDN parked the promise
 * forever - harmless when the only caller was a button, fatal now that a
 * background timer waits on it before scheduling the next check.
 */
const CHECK_TIMEOUT_MS = 15_000;

/** The running app version — Tauri reports the bundle's, the web falls back to package.json. */
export async function currentVersion(): Promise<string> {
  if (isTauri()) {
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      return await getVersion();
    } catch {
      // fall through to the bundled version
    }
  }
  return pkg.version;
}

export interface PendingUpdate {
  version: string;
  currentVersion: string;
  notes?: string;
  /** Opaque handle for installUpdate(); undefined on the web. */
  handle: unknown;
}

/** Ask the update server whether a newer version is available. null = up to date. */
export async function checkForUpdate(): Promise<PendingUpdate | null> {
  if (!isTauri()) return null;
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check({ timeout: CHECK_TIMEOUT_MS });
  if (!update) return null;
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body ?? undefined,
    handle: update,
  };
}

/**
 * Fetch the update bundle, reporting 0–100% progress. Nothing is swapped here:
 * this is an HTTP download into a staging area, so it is safe to run in the
 * background while the player is mid-match. Only applyUpdate() is destructive.
 */
export async function downloadUpdate(
  pending: PendingUpdate,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const update = pending.handle as {
    download: (cb: (event: DownloadEvent) => void) => Promise<void>;
  };
  let total = 0;
  let received = 0;
  await update.download((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? 0;
      onProgress?.(0);
    } else if (event.event === 'Progress') {
      received += event.data.chunkLength;
      if (total > 0) onProgress?.(Math.min(99, Math.round((received / total) * 100)));
    } else if (event.event === 'Finished') {
      onProgress?.(100);
    }
  });
}

/**
 * Install the downloaded bundle and relaunch. DESTRUCTIVE: the window closes,
 * so a seated player loses the table they are looking at. Every caller must
 * have asked first - see the inRoom guards in UpdateNotice and AboutTab.
 * Requires downloadUpdate() to have run on the same pending handle.
 */
export async function applyUpdate(pending: PendingUpdate): Promise<void> {
  const update = pending.handle as { install: () => Promise<void> };
  await update.install();
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}

/** Download + install a pending update, reporting 0–100% progress, then relaunch. */
export async function installUpdate(
  pending: PendingUpdate,
  onProgress?: (percent: number) => void,
): Promise<void> {
  await downloadUpdate(pending, onProgress);
  await applyUpdate(pending);
}

type DownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };
