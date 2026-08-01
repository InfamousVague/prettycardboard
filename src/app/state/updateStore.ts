import { create } from 'zustand';
import { releasesSince, versionNewer, type ChangelogEntry } from '../data/changelog.ts';
import {
  applyUpdate,
  canSelfUpdate,
  checkForUpdate,
  downloadUpdate,
  type PendingUpdate,
} from '../updater.ts';

/**
 * Everything the app knows about a pending desktop update, in one place.
 *
 * Until now the only knowledge of an update lived inside Settings > About, so
 * it existed only while that tab was mounted and only if the player had gone
 * looking. Hoisting it into a store is what lets the background cadence
 * (UpdateHost) and the notice (UpdateNotice) share one finding: a check that
 * lands while the player is on the home page is already "available" by the time
 * they open About, and About's button becomes a force-check rather than the
 * single path to discovery.
 */

export type UpdateStatus =
  /** Nothing known yet, or the last background attempt quietly failed. */
  | 'idle'
  /** A check is in flight. */
  | 'checking'
  /** The last check found nothing. */
  | 'uptodate'
  /** A newer version exists; the bundle is not staged yet. */
  | 'available'
  /** Fetching the bundle. Safe mid-match - nothing is swapped. */
  | 'downloading'
  /** Staged on disk. Only the relaunch is left, and only the player asks for it. */
  | 'ready'
  /** install() + relaunch() under way; the window is about to go. */
  | 'installing'
  /** An operation the player asked for failed, and they should be told. */
  | 'error';

interface UpdateState {
  status: UpdateStatus;
  pending: PendingUpdate | null;
  /** 0–100 while downloading. */
  progress: number;
  lastCheckedAt: number | null;
  /** The exact version the player waved away; a newer one re-arms the notice. */
  dismissedVersion: string | null;
  downloaded: boolean;
  /** Ask the update server. Resolves false only when the attempt itself failed,
   *  which is the caller's cue to back off. `silent` keeps a background failure
   *  out of the UI. */
  check: (silent?: boolean) => Promise<boolean>;
  /** Stage the found bundle. No-op unless there is something to stage. */
  download: () => Promise<void>;
  /** Install and relaunch. Callers own the confirmation. */
  apply: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdate = create<UpdateState>((set, get) => ({
  status: 'idle',
  pending: null,
  progress: 0,
  lastCheckedAt: null,
  dismissedVersion: null,
  downloaded: false,

  check: async (silent = false) => {
    if (!canSelfUpdate) return true;
    const { status, pending } = get();
    // A second check learns nothing while one is in flight, while a bundle is
    // being staged, or once we already hold a finding - and it would hand back
    // a second handle for the same release.
    if (status === 'checking' || status === 'downloading' || status === 'installing') return true;
    if (pending) return true;
    set({ status: 'checking' });
    try {
      const update = await checkForUpdate();
      set({
        pending: update,
        status: update ? 'available' : 'uptodate',
        lastCheckedAt: Date.now(),
      });
      return true;
    } catch {
      // Offline, captive portal, a GitHub hiccup: transient by nature. Only a
      // check the player pressed for is worth reporting; the cadence backs off.
      set({ status: silent ? 'idle' : 'error', lastCheckedAt: Date.now() });
      return false;
    }
  },

  download: async () => {
    const { pending, status, downloaded } = get();
    if (!pending || downloaded) return;
    if (status === 'downloading' || status === 'installing') return;
    set({ status: 'downloading', progress: 0 });
    try {
      await downloadUpdate(pending, (percent) => set({ progress: percent }));
      set({ status: 'ready', progress: 100, downloaded: true });
    } catch {
      // Back to a plain finding: the handle is still good, so the next cadence
      // tick retries the transfer rather than re-checking from scratch.
      set({ status: 'available', progress: 0 });
    }
  },

  apply: async () => {
    const { pending } = get();
    if (!pending) return;
    set({ status: 'installing' });
    try {
      // A player who reaches for this before the background transfer finished
      // still gets there; they just watch the download first.
      if (!get().downloaded) {
        await downloadUpdate(pending, (percent) => set({ progress: percent }));
        set({ downloaded: true, progress: 100 });
      }
      await applyUpdate(pending);
      // On success the app relaunches; nothing after this runs.
    } catch {
      set({ status: 'error' });
    }
  },

  dismiss: () => set({ dismissedVersion: get().pending?.version ?? null }),
}));

/**
 * latest.json's `notes` is the GitHub release body, and both release paths
 * hardcode it to this one line (scripts/release-mac.mjs:115 and the
 * releaseBody in .github/workflows/desktop-build.yml). It describes the
 * download page, not the release, so it is not a fallback - showing it would
 * put a second, contradictory changelog next to the real one.
 */
const NOTES_BOILERPLATE = 'Desktop installers for macOS, Windows, and Linux. The app auto-updates.';

/**
 * The one description of a pending release. The bundled changelog wins whenever
 * it covers the release - it is curated, iconed and translated into all four
 * locales - and the remote release body is only read when it does not. That is
 * the common case for a future version, since the changelog a client carries
 * was compiled into it: `entries` is empty and `notes` is whatever the release
 * page says, unless that is the pipeline's boilerplate, in which case the
 * honest answer is a version number and nothing else.
 */
export function updateHighlights(pending: PendingUpdate): {
  entries: ChangelogEntry[];
  notes: string | null;
} {
  const entries = releasesSince(pending.currentVersion)
    .filter((release) => !versionNewer(release.version, pending.version))
    .flatMap((release) => release.entries);
  if (entries.length > 0) return { entries, notes: null };
  const notes = pending.notes?.trim();
  return { entries: [], notes: notes && notes !== NOTES_BOILERPLATE ? notes : null };
}
