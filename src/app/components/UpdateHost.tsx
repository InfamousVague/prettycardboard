import { useEffect } from 'react';
import { useUpdate } from '../state/updateStore.ts';
import { canSelfUpdate } from '../updater.ts';
import { UpdateNotice } from './UpdateNotice.tsx';

/**
 * The update host: the single owner of the update-check cadence, and of the
 * notice that surfaces an update once one is found. Mounted beside Notifier
 * and InvitePopup so it survives every route, the table included, and renders
 * null until there is something to say.
 *
 * This is what makes discovery permanent. Before it, checkForUpdate() had
 * exactly one caller - a button inside Settings > About - so an installed app
 * only learned about a release if its player went looking for one.
 *
 * The endpoint is GitHub's latest.json behind a CDN (tauri.conf.json:47-49),
 * not our own VPS, so the cadence costs the server that runs the games nothing
 * and can be genuinely frequent. It still is not: releases land weekly at best.
 */

/** Not at boot - launch is already loading the alt-art catalog and bootstrapping identity. */
const FIRST_CHECK_MS = 45_000;
/** Steady state. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
/** After a failed check, or a bundle we could not stage. */
const RETRY_EVERY_MS = 30 * 60 * 1000;
/** How stale the last check must be before coming back to the app re-triggers one. */
const STALE_MS = 60 * 60 * 1000;

export default function UpdateHost() {
  useEffect(() => {
    // The web build has no self-update path at all: no timer, no listeners.
    if (!canSelfUpdate) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    // Declared as hoisted functions because the two call each other: every
    // tick schedules the next one, and the interval depends on how it went.
    function schedule(delay: number) {
      clearTimeout(timer);
      timer = setTimeout(() => void tick(), delay);
    }

    async function tick() {
      const checked = await useUpdate.getState().check(true);
      if (disposed) return;
      const found = useUpdate.getState().pending !== null;
      // Found something: stage it now, quietly. Downloading is safe mid-match -
      // it is an HTTP fetch into a staging area - so by the time the player is
      // asked anything, the only step left is the one they have to consent to.
      if (found && !useUpdate.getState().downloaded) {
        await useUpdate.getState().download();
        if (disposed) return;
      }
      // Staged: there is nothing left to learn. The next launch runs the new
      // build, so a timer that kept checking would only ever find itself.
      if (useUpdate.getState().downloaded) return;
      // Found but not staged means the transfer failed - retry that sooner than
      // the steady cadence, and off the handle we already hold.
      schedule(checked && !found ? CHECK_EVERY_MS : RETRY_EVERY_MS);
    }

    // Coming back to a window that has been sitting idle for a day is the one
    // moment a check is both cheap and obviously wanted. Same listener shape as
    // Notifier.tsx:32-40; the staleness floor keeps alt-tabbing from polling.
    const onWake = () => {
      if (document.visibilityState !== 'visible') return;
      const { lastCheckedAt } = useUpdate.getState();
      // Never before the first scheduled check: the boot delay exists precisely
      // so a check does not land on top of launch.
      if (lastCheckedAt === null) return;
      if (Date.now() - lastCheckedAt < STALE_MS) return;
      void tick();
    };

    schedule(FIRST_CHECK_MS);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, []);

  return canSelfUpdate ? <UpdateNotice /> : null;
}
