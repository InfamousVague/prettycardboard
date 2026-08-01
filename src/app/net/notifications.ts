import * as ws from './ws.ts';
import { isLocalPlay, isTauri } from '../tauri.ts';
import { useApp } from '../state/appStore.ts';

/**
 * The notification BACKSTOP - explicitly secondary to the websocket.
 *
 * The socket is not room-scoped: it is opened once at sign-in and the server
 * keys connections by user id, so an app sitting on the Home page already
 * receives friend requests, invites, presence, deck changes and room.closed.
 * Nothing here exists to deliver those. This module exists for the gaps the
 * socket cannot cover on its own:
 *   - a flap: the socket died and came back, and whatever was pushed in
 *     between was dropped by the server (send_user writes to live sockets and
 *     forgets the message if there are none);
 *   - a network that carries HTTP but not websockets (some proxies), where the
 *     socket never comes up but the REST API answers perfectly well;
 *   - a laptop that slept, where the OS reports the network back long before
 *     the socket's backoff would have tried again.
 *
 * Cost is the reason for every number below. The server is one rusqlite
 * connection behind a global mutex with no WAL and no rate limiting, and every
 * authenticated request takes that mutex twice while the room sweeper takes it
 * every two seconds. A tight poll contends directly with live game
 * persistence, so: 5 minutes while the socket is healthy, 15s backing off to
 * 120s while it is down, and never - by any path, including the event-driven
 * catch-ups - more than one reconcile per 10 seconds.
 *
 * Until a durable server-side notification endpoint exists, "reconcile" is the
 * existing friends and decks reads. Swapping in a cursor endpoint later is a
 * change to this module alone.
 */

/** Socket healthy: the poll only catches what a flap swallowed. */
const CADENCE_UP_MS = 5 * 60_000;
/** Socket down: the REST API may still be reachable, so try harder... */
const CADENCE_DOWN_MS = 15_000;
/** ...but give up ground on repeated failure, mirroring the socket's backoff. */
const CADENCE_MAX_MS = 120_000;
/** The floor, load-bearing rather than stylistic: see the note above. */
const MIN_INTERVAL_MS = 10_000;

let timer: number | undefined;
let downDelay = CADENCE_DOWN_MS;
let lastAt = 0;
let inFlight = false;
let stopCurrent: (() => void) | null = null;

/**
 * WEB pauses while hidden - browsers throttle background timers to roughly one
 * a minute anyway, and a hidden tab has nobody to tell. DESKTOP keeps the slow
 * cadence, because a window in the background is exactly when arriving at your
 * table late costs something.
 */
function paused(): boolean {
  return !isTauri() && document.visibilityState === 'hidden';
}

async function reconcile(): Promise<void> {
  const app = useApp.getState();
  if (!app.identity || inFlight) return;
  // One reconcile per floor interval, whatever asked for it. Boot, an 'online'
  // event and a socket reconnect all land within a second of each other on a
  // laptop waking up; without this they would be three round trips.
  if (Date.now() - lastAt < MIN_INTERVAL_MS) return;
  inFlight = true;
  lastAt = Date.now();
  try {
    await Promise.all([app.refreshFriends(), app.refreshDecks()]);
    downDelay = CADENCE_DOWN_MS;
  } catch {
    // Offline, or the server is restarting. Back off and stay quiet: this is a
    // backstop, and a failed backstop is not news the player needs.
    downDelay = Math.min(downDelay * 2, CADENCE_MAX_MS);
  } finally {
    inFlight = false;
  }
}

function schedule(): void {
  window.clearTimeout(timer);
  timer = undefined;
  // Local play is a bundled single-user sidecar on 127.0.0.1: no friends, no
  // second device, nothing to drift. The event-driven catch-ups below still
  // run (the sidecar can restart under us), but a timer there is pure noise.
  if (isLocalPlay()) return;
  const next = ws.isConnected() ? CADENCE_UP_MS : downDelay;
  timer = window.setTimeout(() => {
    void tick();
  }, Math.max(MIN_INTERVAL_MS, next));
}

async function tick(): Promise<void> {
  if (!paused()) await reconcile();
  schedule();
}

/** Reconcile now, then re-arm - used by every "something changed" hook. */
function catchUp(): void {
  void reconcile();
  schedule();
}

/**
 * Start the backstop. Mounted with the signed-in shell, so signing out tears it
 * down. Idempotent: a second call replaces the first (StrictMode remounts).
 */
export function startNotificationBackstop(): () => void {
  stopCurrent?.();

  const offStatus = ws.onStatus((connected) => {
    // Coming back up is the important one: the server dropped anything pushed
    // while we were away, so the roster and the deck list are reconciled here
    // rather than waiting out the cadence. Going down just re-arms faster.
    if (connected) catchUp();
    else schedule();
  });

  const onOnline = () => {
    // The socket's backoff would get there within 8s; the OS already knows.
    ws.reconnectNow();
    catchUp();
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') catchUp();
  };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  // Sign-in has just read friends and decks, so the first pass is scheduled,
  // not immediate; the floor stops the socket's own connect from re-reading
  // them a moment later.
  lastAt = Date.now();
  downDelay = CADENCE_DOWN_MS;
  schedule();

  const stop = () => {
    offStatus();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearTimeout(timer);
    timer = undefined;
    if (stopCurrent === stop) stopCurrent = null;
  };
  stopCurrent = stop;
  return stop;
}
