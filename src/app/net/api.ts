import { isTauri } from '../tauri.ts';
import type { Deck, DeckCard, DeckSummary, FriendsPayload, Identity, MatchRow, MatchStatsPlayer, MyRoom, RoomInfo, UserHit } from './types.ts';

/**
 * REST client for the PrettyCardboard server (see PROTOCOL.md). Where it points:
 *   - an explicit VITE_PC_SERVER wins (web prod sets it to '' = same-origin;
 *     local Tauri dev can set it to a LAN/localhost server);
 *   - otherwise the desktop app talks to the LIVE server, so an installed build
 *     shares accounts, decks, friends and match stats with the web app;
 *   - otherwise (browser dev) it's the local server.
 * This keeps the desktop app in sync with production without any build-time env
 * plumbing (which is awkward across the Windows/Linux CI runners).
 */
const LIVE_SERVER = 'https://prettycardboard.com';
export const SERVER_URL: string =
  import.meta.env.VITE_PC_SERVER ?? (isTauri() ? LIVE_SERVER : 'http://127.0.0.1:8787');

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let authToken: string | null = null;

export function setToken(token: string | null): void {
  authToken = token;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const response = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let code = 'error';
    let message = response.statusText;
    try {
      const data = (await response.json()) as { code?: string; message?: string };
      code = data.code ?? code;
      message = data.message ?? message;
    } catch {
      // non-JSON error body; keep the status text
    }
    throw new ApiError(response.status, code, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// --- identity ---

export function register(username: string, password: string): Promise<Identity> {
  return request('POST', '/api/register', { username, password });
}

export function login(username: string, password: string): Promise<Identity> {
  return request('POST', '/api/login', { username, password });
}

export function me(): Promise<{ userId: string; username: string; createdAt: string }> {
  return request('GET', '/api/me');
}

export function searchUsers(q: string): Promise<UserHit[]> {
  return request('GET', `/api/users/search?q=${encodeURIComponent(q)}`);
}

// --- friends ---

export function getFriends(): Promise<FriendsPayload> {
  return request('GET', '/api/friends');
}

export function sendFriendRequest(toUserId: string): Promise<{ id: string }> {
  return request('POST', '/api/friends/requests', { toUserId });
}

export function acceptFriendRequest(id: string): Promise<void> {
  return request('POST', `/api/friends/requests/${id}/accept`);
}

export function declineFriendRequest(id: string): Promise<void> {
  return request('POST', `/api/friends/requests/${id}/decline`);
}

export function removeFriend(userId: string): Promise<void> {
  return request('DELETE', `/api/friends/${userId}`);
}

// --- decks ---

export function listDecks(): Promise<DeckSummary[]> {
  return request('GET', '/api/decks');
}

export function getDeck(id: string): Promise<Deck> {
  return request('GET', `/api/decks/${id}`);
}

export function createDeck(
  name: string,
  format: string,
  cards: DeckCard[],
  header?: string | null,
): Promise<{ id: string }> {
  return request('POST', '/api/decks', { name, format, cards, header });
}

export function updateDeck(
  id: string,
  name: string,
  format: string,
  cards: DeckCard[],
  header?: string | null,
): Promise<void> {
  return request('PUT', `/api/decks/${id}`, { name, format, cards, header });
}

export function deleteDeck(id: string): Promise<void> {
  return request('DELETE', `/api/decks/${id}`);
}

// --- rooms ---

export function createRoom(
  name: string,
  seats: number,
  persistent?: boolean,
): Promise<{ roomId: string; code: string }> {
  return request('POST', '/api/rooms', { name, seats, persistent });
}

export function getRoomByCode(code: string): Promise<RoomInfo> {
  return request('GET', `/api/rooms/${encodeURIComponent(code)}`);
}

/** Rooms where the caller holds a seat, newest activity first. */
export function myRooms(): Promise<MyRoom[]> {
  return request('GET', '/api/rooms/mine');
}

/** The caller's recent games, newest first. */
export function matches(): Promise<MatchRow[]> {
  return request('GET', '/api/matches');
}

// --- post-match: endorsements, salt, stats ---

/** Endorse a fellow participant of a finished match (idempotent). */
export function endorsePlayer(matchId: string, toUserId: string): Promise<void> {
  return request('POST', `/api/matches/${encodeURIComponent(matchId)}/endorse`, { toUserId });
}

/** Rate how salty another participant's deck made you (1-5; re-rate replaces). */
export function saltRateDeck(matchId: string, deckId: string, salt: number): Promise<void> {
  return request('POST', `/api/matches/${encodeURIComponent(matchId)}/salt`, { deckId, salt });
}

/** Per-participant all-time aggregates for the post-match screen. */
export function matchStats(matchId: string): Promise<{ players: MatchStatsPlayer[] }> {
  return request('GET', `/api/matches/${encodeURIComponent(matchId)}/stats`);
}

/** Host only: ends the table for everyone. */
export function closeRoom(id: string): Promise<void> {
  return request('DELETE', `/api/rooms/${encodeURIComponent(id)}`);
}

// --- import proxy ---

/**
 * Fetch a Moxfield deck through the server (Moxfield blocks direct browser
 * calls behind Cloudflare). Returns Moxfield's raw v3 JSON.
 */
export function moxfieldDeck(deckId: string): Promise<unknown> {
  return request('GET', `/api/import/moxfield/${encodeURIComponent(deckId)}`);
}
