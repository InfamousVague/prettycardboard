import { SERVER_URL } from './api.ts';
import type { DeckMeta, DraftCard, GameAction, GameActionV2, GameSettings, LimitedMode, MatPos, MatZone, ServerMessage } from './types.ts';

/**
 * The realtime channel: one WebSocket for presence, invites, chat, and the
 * game room. Reconnects with backoff and replays nothing - on reconnect the
 * server sends a fresh room.state, which the game store treats as authoritative.
 */

export type ClientMessage =
  | { type: 'room.join'; roomId: string; deckId?: string }
  | { type: 'room.spectate'; roomId: string }
  | { type: 'room.leave' }
  | { type: 'room.start' }
  | { type: 'room.ready'; ready: boolean }
  | { type: 'room.deck.set'; deckId: string }
  | { type: 'room.deck.random' }
  | { type: 'room.settings'; settings: GameSettings }
  | { type: 'room.ping'; targetUserId: string }
  | { type: 'room.hand.hover'; position: number | null }
  | { type: 'cursor.move'; x: number; y: number; hover: string | null; mat: number | null }
  | { type: 'playmat.set'; id?: string }
  | { type: 'matlayout.set'; layout: Partial<Record<MatZone, MatPos>> }
  | { type: 'cardback.set'; id?: string }
  | { type: 'deckmeta.set'; meta: DeckMeta | null }
  | { type: 'auto.set'; untap: boolean; draw: boolean }
  | { type: 'coach.set'; on: boolean }
  | { type: 'chat.send'; text: string }
  /** The pointing gesture (an arrow the table watches, then forgets). The
   *  persistent cousin is the `mark.set` ACTION - markers live in room state,
   *  arrows never do. The kind list is the union of both: an arrow can carry
   *  any marker glyph even though only the marker itself persists. */
  | { type: 'aim'; fromIid?: string; toIid?: string; toSeat?: number; kind?: 'target' | 'point' | 'skull' | 'star' | 'eye' | 'shield' | 'sword' | 'flame' | 'ban' | 'question' | 'clear' }
  // Seat/unseat an AI opponent (host only, pre-start). deckCode picks one of
  // the server's embedded precons; absent = random.
  | { type: 'bot.add'; deckCode?: string; style?: 'casual' | 'aggro' | 'defensive'; difficulty?: 'easy' | 'normal' | 'hard' }
  | { type: 'bot.remove'; seat: number }
  /** Host clears a seated PLAYER before the game starts (bots use bot.remove). */
  | { type: 'room.kick'; seat: number }
  | { type: 'invite.send'; toUserId: string; roomId: string }
  | { type: 'game.action'; action: GameAction | GameActionV2 }
  // "Look what I just cracked": a notable pull from the pack dock, relayed to
  // everyone at the table. Ignored by the server unless you are in a room.
  | { type: 'pull.notify'; scryfallId: string; name: string; setCode: string; rarity: string; foil: boolean }
  | { type: 'replay.seek'; index: number }
  // Limited. The HOST uploads every pack, because the real collation data
  // (public/cache/packs) is bundled with the app rather than known to the
  // server - see the note on rooms::DraftCard.
  | {
      type: 'draft.start';
      set: string;
      setName: string;
      /** 'draft' passes packs round the table; 'sealed' opens them all at once. */
      mode: LimitedMode;
      rounds: number;
      pickSeconds: number;
      buildSeconds: number;
      lockDecks: boolean;
      /** The set's basic lands, used only to fill out a forced build. */
      basics: DraftCard[];
      packs: DraftCard[][];
    }
  // Both the position and the card, so a pick made against a stale pack is
  // rejected rather than silently taking whatever moved into that slot.
  | { type: 'draft.pick'; index: number; id: string }
  | { type: 'draft.built' };

type Listener = (message: ServerMessage) => void;
type StatusListener = (connected: boolean) => void;

let socket: WebSocket | null = null;
let currentToken: string | null = null;
let retryDelay = 500;
/** The pending reconnect attempt, tracked so at most one is ever in flight -
 *  an untracked setTimeout would let reconnectNow() and the backoff both call
 *  open(), and the loser's onclose would null out the winner's live socket. */
let retryTimer: number | null = null;
let closedByUs = false;
const listeners = new Set<Listener>();
const statusListeners = new Set<StatusListener>();

function wsUrl(token: string): string {
  // Same-origin build (SERVER_URL ''): derive ws(s):// from the page itself.
  const base = SERVER_URL
    ? SERVER_URL.replace(/^http/, 'ws')
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
  return `${base}/api/ws?token=${encodeURIComponent(token)}`;
}

export function connect(token: string): void {
  // Idempotent: never stack sockets (StrictMode double-effects, repeated
  // sign-ins). An existing live socket for the same token is kept; a socket
  // for a different token is torn down first.
  if (socket && currentToken === token) return;
  if (socket) {
    const old = socket;
    socket = null; // prevent the onclose retry path from reviving it
    old.onclose = null;
    old.close();
  }
  currentToken = token;
  closedByUs = false;
  cancelRetry();
  retryDelay = 500;
  open();
}

function cancelRetry(): void {
  if (retryTimer === null) return;
  clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry(delay: number): void {
  if (retryTimer !== null) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    open();
  }, delay);
}

function open(): void {
  if (!currentToken || socket) return;
  socket = new WebSocket(wsUrl(currentToken));
  socket.onopen = () => {
    retryDelay = 500;
    statusListeners.forEach((fn) => fn(true));
  };
  socket.onmessage = (event) => {
    let message: ServerMessage;
    try {
      message = JSON.parse(event.data as string) as ServerMessage;
    } catch {
      return;
    }
    listeners.forEach((fn) => fn(message));
  };
  socket.onclose = () => {
    socket = null;
    statusListeners.forEach((fn) => fn(false));
    if (!closedByUs && currentToken) {
      scheduleRetry(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 8000);
    }
  };
  socket.onerror = () => socket?.close();
}

/**
 * Try again right now instead of waiting out the backoff. Called when the OS
 * says the network is back: the socket that died on a sleeping laptop should
 * not leave the app offline for another 8 seconds. A no-op while a socket is
 * live or connecting, and while signed out.
 */
export function reconnectNow(): void {
  if (closedByUs || !currentToken || socket) return;
  cancelRetry();
  retryDelay = 500;
  open();
}

export function disconnect(): void {
  closedByUs = true;
  currentToken = null;
  cancelRetry();
  socket?.close();
  socket = null;
}

export function send(message: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

export function sendAction(action: GameAction | GameActionV2): void {
  send({ type: 'game.action', action });
}

export function onMessage(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function isConnected(): boolean {
  return socket?.readyState === WebSocket.OPEN;
}
