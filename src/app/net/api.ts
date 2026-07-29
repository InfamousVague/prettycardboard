import { isTauri } from '../tauri.ts';
import type { Deck, DeckCard, DeckStats, DeckSummary, FriendsPayload, Identity, MatchRow, MatchStatsPlayer, MyDeckStats, MyRoom, RoomInfo, UserHit, UserStats } from './types.ts';

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

export function me(): Promise<{
  userId: string;
  username: string;
  createdAt: string;
  /** The newest uploaded playmat, for surfaces that want just one. */
  customPlaymat?: string | null;
  /** EVERY playmat this account has uploaded, newest first. A mat belongs to
   *  the deck that chose it, so an account keeps as many as it has decks. Kept
   *  on the account rather than in one browser's storage, so signing in on
   *  another machine still finds them. */
  customPlaymats?: string[];
  /** The `custom-…` id of this account's uploaded card back, same reasoning. */
  customCardBack?: string | null;
}> {
  return request('GET', '/api/me');
}

/**
 * Upload an image as your custom card back (raw bytes; the server sniffs the
 * real type and keeps ONE back per account). The returned id (`custom-…`) flows
 * through the normal card-back preference and the seat's `cardBack` sync, so
 * every viewer paints your face-down cards with it.
 */
export async function uploadCardBack(file: Blob): Promise<{ id: string; url: string }> {
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const response = await fetch(`${SERVER_URL}/api/cardback`, { method: 'POST', headers, body: file });
  if (!response.ok) {
    let code = 'error';
    let message = response.statusText;
    try {
      const data = (await response.json()) as { code?: string; message?: string };
      code = data.code ?? code;
      message = data.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(response.status, code, message);
  }
  return (await response.json()) as { id: string; url: string };
}

/** Remove this account's uploaded card back. */
export function deleteCardBack(): Promise<{ ok: boolean }> {
  return request('DELETE', '/api/cardback');
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
  game?: string,
  playmat?: string | null,
  cardBack?: string | null,
): Promise<{ id: string }> {
  return request('POST', '/api/decks', { name, format, cards, header, game, playmat, cardBack });
}

export function updateDeck(
  id: string,
  name: string,
  format: string,
  cards: DeckCard[],
  header?: string | null,
  playmat?: string | null,
  cardBack?: string | null,
): Promise<void> {
  return request('PUT', `/api/decks/${id}`, { name, format, cards, header, playmat, cardBack });
}

export function deleteDeck(id: string): Promise<void> {
  return request('DELETE', `/api/decks/${id}`);
}

// --- rooms ---

export function createRoom(
  name: string,
  seats: number,
  persistent?: boolean,
  opts?: { format?: string; game?: string },
): Promise<{ roomId: string; code: string }> {
  return request('POST', '/api/rooms', { name, seats, persistent, ...opts });
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

/** The caller's all-time aggregate stats (wins/losses/endorsements/avg turn). */
export function myStats(): Promise<UserStats> {
  return request('GET', '/api/me/stats');
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

// --- custom playmats ---

/**
 * Upload an image as your custom playmat (raw bytes; the server sniffs the
 * real type and keeps ONE mat per account). The returned id (`custom-…`) flows
 * through the normal playmat preference + `playmat.set` sync, so everyone at
 * the table resolves the same /api/mats URL.
 */
export async function uploadPlaymat(file: Blob): Promise<{ id: string; url: string }> {
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const response = await fetch(`${SERVER_URL}/api/playmat`, { method: 'POST', headers, body: file });
  if (!response.ok) {
    let code = 'error';
    let message = response.statusText;
    try {
      const data = (await response.json()) as { code?: string; message?: string };
      code = data.code ?? code;
      message = data.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(response.status, code, message);
  }
  return (await response.json()) as { id: string; url: string };
}

/** Any player's all-time record (wins/losses/endorsements) - the matchup
 * splash shows every seat's. Unknown ids come back all zeros. */
export function userStats(userId: string): Promise<UserStats> {
  return request('GET', `/api/users/${encodeURIComponent(userId)}/stats`);
}

/** My decks, one row each: record, saltiness, endorsements earned with it.
 *  Self only - a deck-by-deck salt breakdown of someone else would be a
 *  shaming board, and no endpoint publishes another player's deck names. */
export function myDeckStats(): Promise<MyDeckStats[]> {
  return request('GET', '/api/me/decks/stats');
}

/** Remove one uploaded playmat. Decks still pointing at it fall back to the
 *  player's own mat, the same as a deck that never had one. */
export function deletePlaymat(id: string): Promise<{ ok: boolean }> {
  const file = id.replace(/^custom-/, '');
  return request('DELETE', `/api/playmat/${encodeURIComponent(file)}`);
}

/** A deck's all-time record + saltiness, for the deck inspector. */
export function deckStats(deckId: string): Promise<DeckStats> {
  return request('GET', `/api/decks/${encodeURIComponent(deckId)}/stats`);
}

// --- collection (the "Magic Pokedex") ---

/**
 * One card the player has ever pulled. `firstPulledAt` is what makes the
 * library a collection rather than a pile: it is the moment the card entered
 * it, so a re-pull bumps `pullCount` without disturbing the discovery date.
 */
export interface CollectionCard {
  scryfallId: string;
  name: string;
  setCode: string;
  /** common | uncommon | rare | mythic (whatever the server recorded). */
  rarity: string;
  foil: boolean;
  /** Unix ms of the first time this card was pulled (the server's column). */
  firstPulledAt: number;
  /** How many copies have been pulled in total (>= 1). */
  pullCount: number;
}

/** Per-set owned tally, so a set's completion needs no client-side grouping. */
export interface CollectionSetRow {
  code: string;
  owned: number;
}

export interface CollectionPayload {
  /** Distinct printings owned (same meaning as PullsResult.total). */
  total: number;
  /** Cards pulled all-time, duplicates included (same as PullsResult.pulls). */
  pulls: number;
  cards: CollectionCard[];
  sets: CollectionSetRow[];
}

/**
 * The whole collection, normalized HERE and nowhere else.
 *
 * The server side of this feature is being written in parallel, so the exact
 * wire shape may still move (snake_case columns, a missing `sets` roll-up, a
 * count named `copies` instead of `pullCount`). Every one of those variations
 * is absorbed by this one function: the store and the page only ever see
 * `CollectionPayload`, and reconciling a shape change is a one-file edit.
 */
function normalizeCollection(raw: unknown): CollectionPayload {
  const body = (raw ?? {}) as Record<string, unknown>;
  const rows = (Array.isArray(body.cards) ? body.cards : []) as Record<string, unknown>[];

  const cards: CollectionCard[] = rows.map((row) => {
    const pulls = Number(row.pullCount ?? row.pull_count ?? row.copies ?? row.count ?? 1);
    // The server stores the discovery moment as unix ms; a server that ever
    // sends an ISO string instead still lands as a number here.
    const rawFirst = row.firstPulledAt ?? row.first_pulled_at ?? row.createdAt ?? row.created_at ?? 0;
    const first = typeof rawFirst === 'string' ? Date.parse(rawFirst) : Number(rawFirst);
    return {
      scryfallId: String(row.scryfallId ?? row.scryfall_id ?? row.cardId ?? row.card_id ?? row.id ?? ''),
      name: String(row.name ?? ''),
      setCode: String(row.setCode ?? row.set_code ?? row.set ?? '').toLowerCase(),
      rarity: String(row.rarity ?? 'common').toLowerCase(),
      foil: row.foil === true || row.foil === 1,
      firstPulledAt: Number.isFinite(first) ? first : 0,
      pullCount: Number.isFinite(pulls) && pulls > 0 ? pulls : 1,
    };
  });

  // A server that does not roll sets up yet still gets a per-set readout: the
  // tally falls out of the cards themselves.
  const rawSets = (Array.isArray(body.sets) ? body.sets : []) as Record<string, unknown>[];
  let sets: CollectionSetRow[] = rawSets.map((row) => ({
    code: String(row.code ?? row.setCode ?? row.set_code ?? '').toLowerCase(),
    owned: Number(row.owned ?? row.count ?? 0),
  }));
  if (sets.length === 0 && cards.length > 0) {
    const tally = new Map<string, number>();
    for (const card of cards) tally.set(card.setCode, (tally.get(card.setCode) ?? 0) + 1);
    sets = [...tally].map(([code, owned]) => ({ code, owned }));
  }

  // `total` counts distinct printings and `pulls` counts copies - the same
  // split PullsResult uses. Either can be summed from the rows if absent.
  const total = Number(body.total ?? 0);
  const pulls = Number(body.pulls ?? body.totalPulls ?? body.total_pulls ?? 0);
  const summedPulls = cards.reduce((sum, card) => sum + card.pullCount, 0);
  return {
    total: Number.isFinite(total) && total > 0 ? total : cards.length,
    pulls: Number.isFinite(pulls) && pulls > 0 ? pulls : summedPulls,
    cards,
    sets,
  };
}

/** Every card this account has ever pulled, with per-set tallies. */
export async function getCollection(): Promise<CollectionPayload> {
  return normalizeCollection(await request<unknown>('GET', '/api/collection'));
}

// --- pulls (the pack dock) ---

/** One opened card, as the pack dock reports it. */
export interface PulledCard {
  scryfallId: string;
  name: string;
  setCode: string;
  rarity: string;
  foil: boolean;
  /** The SET's release date (ISO `YYYY-MM-DD`). The server needs it to judge a
   *  1993-94 rare notable - that window is where the Power Nine came from. */
  released?: string;
}

/** What the server says about one recorded pull. */
export interface PullOutcome {
  scryfallId: string;
  name: string;
  setCode: string;
  rarity: string;
  foil: boolean;
  /** Worth telling other players about (mythic, old-frame rare, foil rare+). */
  notable: boolean;
  /** First copy of this printing the account has ever owned. */
  new: boolean;
}

export interface PullsResult {
  /** Only the cards that were new; the pack's other cards are not echoed. */
  new: PullOutcome[];
  notable: PullOutcome[];
  /** Distinct printings owned after this pack. */
  total: number;
  /** Cards pulled all-time, duplicates included. */
  pulls: number;
}

/**
 * Record a freshly opened pack against the account's collection. The server is
 * the authority on what is NEW (it owns the collection) and on what is NOTABLE
 * (one rule, shared with the websocket relay), so the dock celebrates what
 * comes back rather than guessing.
 */
export function recordPulls(cards: PulledCard[]): Promise<PullsResult> {
  return request('POST', '/api/collection/pulls', cards);
}

/** One row of the notable-pull feed: mine, or a friend's. */
export interface FeedPull {
  id: string;
  userId: string;
  username: string;
  scryfallId: string;
  name: string;
  setCode: string;
  rarity: string;
  foil: boolean;
  ts: number;
  mine: boolean;
}

/** Notable pulls by this account and its friends, newest first. */
export function pullFeed(limit = 30): Promise<FeedPull[]> {
  return request('GET', `/api/collection/feed?limit=${limit}`);
}
