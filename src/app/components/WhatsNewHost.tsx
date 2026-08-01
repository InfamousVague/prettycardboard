import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { releasesSince, type ChangelogRelease } from '../data/changelog.ts';
import pkg from '../../../package.json' with { type: 'json' };

/** Most sessions never open this - including every first-run player, who is
 *  explicitly skipped below - so the modal, the release table and its icons
 *  stay out of the main chunk until something actually asks for them. */
const WhatsNew = lazy(() => import('./WhatsNew.tsx').then((m) => ({ default: m.WhatsNew })));

/** The app version this player last saw the changelog for. */
const SEEN_VERSION_KEY = 'pc.lastSeenVersion';

/** App's first-launch flag. Read-only here: App owns the write (it closes the
 *  first-run Settings pass), and this only needs to recognise a fresh install
 *  before that write can have happened. */
const CUSTOMIZED_KEY = 'pc.customized';

/**
 * The what's-new gate: announce the releases newer than the version cached on
 * this device. A brand-new player (first run) skips the announcement -
 * everything is new to them anyway - and just seeds the cache; returning
 * players see what changed, and dismissing caches the current version so it
 * never repeats.
 *
 * It is a host component rather than a few lines in App so the changelog and
 * its modal can be split off the shell, and so the reopen path is a window
 * event (`pc:open-whatsnew`) instead of a prop drilled through the tree -
 * mirroring the pc:open-settings / pc:open-customize pair App already owns.
 */
export function WhatsNewHost() {
  const [releases, setReleases] = useState<ChangelogRelease[]>(() => {
    const seen = localStorage.getItem(SEEN_VERSION_KEY);
    if (seen === pkg.version) return [];
    const firstRun = localStorage.getItem(CUSTOMIZED_KEY) == null;
    if (firstRun || !seen) {
      // First run, or the feature just shipped: returning players (already
      // customized) get the full backlog once; fresh installs seed silently.
      if (firstRun) {
        localStorage.setItem(SEEN_VERSION_KEY, pkg.version);
        return [];
      }
      return releasesSince(null);
    }
    return releasesSince(seen);
  });

  // Anywhere in the app can ask for the changelog back; it always reopens on
  // the full history, since a deliberate visit is not a version announcement.
  useEffect(() => {
    const open = () => setReleases(releasesSince(null));
    window.addEventListener('pc:open-whatsnew', open);
    return () => window.removeEventListener('pc:open-whatsnew', open);
  }, []);

  const close = () => {
    localStorage.setItem(SEEN_VERSION_KEY, pkg.version);
    setReleases([]);
  };

  // Once something has been announced the component stays mounted, so closing
  // does not tear the chunk back out and reopening is instant.
  const shown = useRef(false);
  shown.current ||= releases.length > 0;
  if (!shown.current) return null;

  return (
    <Suspense fallback={null}>
      <WhatsNew releases={releases} open={releases.length > 0} onClose={close} />
    </Suspense>
  );
}
