import { SERVER_URL } from './api.ts';
import type { GameAction, GameActionV2, ServerMessage } from './types.ts';

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
  | { type: 'bot.add'; deckCode?: string; style?: 'casual' | 'aggro' | 'defensive' }
  | { type: 'bot.remove'; seat: number }
  | { type: 'playmat.set'; id?: string }
  | { type: 'chat.send'; text: string }
  | { type: 'invite.send'; toUserId: string; roomId: string }
  | { type: 'game.action'; action: GameAction | GameActionV2 };

type Listener = (message: ServerMessage) => void;
type StatusListener = (connected: boolean) => void;

let socket: WebSocket | null = null;
let currentToken: string | null = null;
let retryDelay = 500;
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
  open();
}

function open(): void {
  if (!currentToken) return;
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
      setTimeout(open, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 8000);
    }
  };
  socket.onerror = () => socket?.close();
}

export function disconnect(): void {
  closedByUs = true;
  currentToken = null;
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
