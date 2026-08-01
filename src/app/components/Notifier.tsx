import { useEffect, useRef } from 'react';
import { useToast } from '@glacier/react';
import { useT } from '../i18n.ts';
import * as ws from '../net/ws.ts';
import { startNotificationBackstop } from '../net/notifications.ts';
import type { TableAlert } from '../state/gameStore.ts';

/**
 * Social notifications, visible anywhere in the shell: friend requests,
 * accepted requests, and anything happening at a table you are seated at but
 * not looking at. All of it arrives on the always-on socket; the reconcile
 * backstop (net/notifications.ts) covers the gaps a dropped socket leaves.
 */

/** One alert per table per kind per this long. The toast provider is
 *  latest-wins with no queue, so a chatty table would otherwise stomp every
 *  other notification off the screen. */
const ALERT_THROTTLE_MS = 20_000;

/** How long the socket has to stay down before we say so. Reconnects take a
 *  few hundred ms and the shell already wears an offline pill, so a blip is
 *  not worth a toast; a sustained outage is. */
const OFFLINE_GRACE_MS = 20_000;

export function Notifier() {
  const t = useT();
  const { toast } = useToast();
  const lastAlert = useRef<Map<string, number>>(new Map());
  // useT() hands back a fresh closure every render, so the outage effect below
  // cannot list it as a dependency: re-running would clear its timer and
  // restart the countdown on every render, and the toast would never fire. It
  // reads the current translator through this ref instead.
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const unsubscribe = ws.onMessage((message) => {
      // Game invites are actionable, so they get a real accept/decline popup
      // (InvitePopup), not a passive toast. Friend events stay as toasts.
      if (message.type === 'friend.request') {
        toast({ tone: 'info', message: `${message.from.username} ${t('ntFriendRequest')}` });
      } else if (message.type === 'friend.accepted') {
        toast({ tone: 'success', message: `${message.by.username} ${t('ntFriendAccepted')}` });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [toast, t]);

  // Tables you are seated at but not viewing. gameStore routes these out
  // instead of dropping them; see TableAlert.
  useEffect(() => {
    const onAlert = (event: Event) => {
      const alert = (event as CustomEvent<TableAlert>).detail;
      const key = `${alert.kind}:${alert.roomId}`;
      const now = Date.now();
      if (now - (lastAlert.current.get(key) ?? 0) < ALERT_THROTTLE_MS) return;
      lastAlert.current.set(key, now);
      if (alert.kind === 'turn') {
        toast({ tone: 'info', message: t('ntTableWaiting').replace('{table}', alert.table ?? '') });
      } else if (alert.kind === 'chat') {
        toast({ tone: 'neutral', message: t('ntTableChat').replace('{name}', alert.name ?? '') });
      } else {
        toast({ tone: 'info', message: t('ntPoked').replace('{name}', alert.name ?? '') });
      }
    };
    window.addEventListener('pc:table-alert', onAlert);
    return () => window.removeEventListener('pc:table-alert', onAlert);
  }, [toast, t]);

  // A sustained outage, said once. onStatus fires false on every failed retry
  // too, so the timer is armed on the FIRST report of being down and left
  // alone until the socket actually comes back - otherwise the 8s backoff
  // would reset a 20s countdown forever and the player would never be told.
  useEffect(() => {
    let timer: number | undefined;
    let told = false;
    const armIfDown = () => {
      if (timer !== undefined || told) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        told = true;
        toast({ tone: 'warning', message: tRef.current('ntOfflineRetrying') });
      }, OFFLINE_GRACE_MS);
    };
    const unsubscribe = ws.onStatus((connected) => {
      if (connected) {
        window.clearTimeout(timer);
        timer = undefined;
        told = false;
      } else {
        armIfDown();
      }
    });
    // onStatus never replays, and a cold start is exactly the case worth
    // reporting - so ask the socket where it stands right now.
    if (!ws.isConnected()) armIfDown();
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [toast]);

  // The reconcile backstop lives as long as the signed-in shell does. It owns
  // the visibility catch-up that used to sit here, so there is one place that
  // decides how often this client is allowed to talk to the server.
  useEffect(() => startNotificationBackstop(), []);

  return null;
}
