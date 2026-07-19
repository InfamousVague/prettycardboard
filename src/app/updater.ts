import { isTauri } from './tauri.ts';
import pkg from '../../package.json' with { type: 'json' };

/**
 * OTA self-update for the desktop app. The updater plugin checks GitHub Releases
 * (`latest.json`, signed with the project's minisign key), downloads the signed
 * artifact for this platform, and relaunches. Everything is guarded by
 * `isTauri()` so the web build never touches the plugin — the dynamic imports
 * only run inside the desktop window.
 */

/** True when self-update is possible (i.e. running as the installed desktop app). */
export const canSelfUpdate = isTauri();

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
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body ?? undefined,
    handle: update,
  };
}

/** Download + install a pending update, reporting 0–100% progress, then relaunch. */
export async function installUpdate(
  pending: PendingUpdate,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const update = pending.handle as {
    downloadAndInstall: (cb: (event: DownloadEvent) => void) => Promise<void>;
  };
  let total = 0;
  let received = 0;
  await update.downloadAndInstall((event) => {
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
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}

type DownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };
