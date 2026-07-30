import { create } from 'zustand';
import * as api from '../net/api.ts';
import type { CollectionCard } from '../net/api.ts';
import { useApp } from './appStore.ts';
import { loadBoosterSets, loadSetPool, type BoosterSet, type SetPool } from '../data/boosterSets.ts';

/**
 * The collection ("Magic Pokedex"): every card the account has ever pulled,
 * plus the two things that turn a list into a collection to complete.
 *
 * 1. Set knowledge. The per-set card counts come from the booster set list
 *    (already cached for the session by BoostersPage), which is enough for a
 *    completion readout. The full card pool - what you are MISSING - is a
 *    heavier, rate-limited fetch, so it is loaded per set on demand.
 *
 * 2. Discovery. Which cards the player has actually looked at lives here, in
 *    localStorage rather than on the server: it is per-eyeball state, not
 *    account state, and it must survive a reload or the NEW badges lie.
 *
 * The first visit PRIMES the seen set with whatever is already owned, so an
 * existing collection does not light up entirely on first open; from then on a
 * card that appears is genuinely new and glows until it has been looked at.
 */

/**
 * Keys are scoped to the signed-in account. Two players sharing a browser have
 * different collections, so they must have different discovery state - an
 * unscoped key would prime the second player's whole collection as "seen" the
 * moment the first one had looked at theirs.
 */
function scope(): string {
  return useApp.getState().identity?.userId ?? 'anon';
}

function seenKey(): string {
  return `pc.collection.seen:${scope()}`;
}

function primedKey(): string {
  return `pc.collection.primed:${scope()}`;
}

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(seenKey());
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    localStorage.setItem(seenKey(), JSON.stringify([...seen]));
  } catch {
    // Private mode / quota - the badges just reset next session.
  }
}

function loadPrimed(): boolean {
  try {
    return localStorage.getItem(primedKey()) === '1';
  } catch {
    return false;
  }
}

function markPrimed(): void {
  try {
    localStorage.setItem(primedKey(), '1');
  } catch {
    // See saveSeen.
  }
}

/**
 * Which refresh is allowed to write. The store outlives the request: a response
 * that resolves after sign-out would otherwise restore the previous account's
 * cards over clear(), and an older response would overwrite a newer one. Both
 * are settled by dropping any payload whose turn is over.
 */
let refreshToken = 0;

interface CollectionState {
  /**
   * Every printing owned, one entry per (printing, finish) - a foil and its
   * non-foil twin are two entries. Counting COLLECTION SIZE means counting
   * distinct `scryfallId`s (see CollectionPage); the per-set and per-account
   * tallies the server sends alongside are row counts, so they are deliberately
   * not kept here.
   */
  cards: CollectionCard[];
  /** Cards pulled all-time, duplicates included. */
  totalPulls: number;
  loading: boolean;
  /** True once a refresh has completed (successfully or not) at least once. */
  loaded: boolean;
  failed: boolean;

  /** Set metadata (name, icon, card count) keyed by lowercase set code. */
  setInfo: Record<string, BoosterSet>;
  /** Fully loaded card pools, keyed by lowercase set code. */
  pools: Record<string, SetPool>;
  /** Set codes whose pool is being fetched right now. */
  poolLoading: Record<string, boolean>;

  /** Card ids the player has already looked at in the library. */
  seen: Set<string>;

  refresh: () => Promise<void>;
  /** Fetch one set's full card pool so missing cards can be shown. */
  loadPool: (code: string) => Promise<void>;
  markSeen: (scryfallId: string) => void;
  markAllSeen: () => void;
  /** Drop everything on sign-out so the next account starts clean. */
  clear: () => void;
}

export const useCollection = create<CollectionState>((set, get) => ({
  cards: [],
  totalPulls: 0,
  loading: false,
  loaded: false,
  failed: false,
  setInfo: {},
  pools: {},
  poolLoading: {},
  // Loaded on the first refresh, not at module init: the account it is scoped
  // to is not known until sign-in has settled.
  seen: new Set(),

  refresh: async () => {
    const token = ++refreshToken;
    set({ loading: true, failed: false });
    try {
      const payload = await api.getCollection();
      // Signed out, or a newer refresh already answered: this payload belongs
      // to a collection nobody is looking at any more. The check sits above the
      // priming below so a stale response cannot prime another account's keys.
      if (token !== refreshToken) return;

      // First ever visit for THIS account: everything already in the collection
      // counts as seen, so only cards pulled from here on wear the NEW treatment.
      let seen = loadSeen();
      if (!loadPrimed()) {
        seen = new Set(payload.cards.map((card) => card.scryfallId));
        saveSeen(seen);
        markPrimed();
      }

      set({
        cards: payload.cards,
        totalPulls: payload.pulls,
        seen,
        loading: false,
        loaded: true,
        failed: false,
      });
    } catch {
      // A stale failure must not restore loaded/failed either.
      if (token !== refreshToken) return;
      set({ loading: false, loaded: true, failed: true });
    }

    // Set names/icons/card counts are a separate, cheap, session-cached call.
    // A failure here only costs the completion denominators, so it never fails
    // the collection itself.
    try {
      const sets = await loadBoosterSets();
      const info: Record<string, BoosterSet> = {};
      for (const entry of sets) info[entry.code.toLowerCase()] = entry;
      set({ setInfo: info });
    } catch {
      // Offline: sets render by code with no denominator.
    }
  },

  loadPool: async (code) => {
    const key = code.toLowerCase();
    const state = get();
    if (state.pools[key] || state.poolLoading[key]) return;
    set({ poolLoading: { ...state.poolLoading, [key]: true } });
    try {
      const pool = await loadSetPool(key);
      set((prev) => ({
        pools: { ...prev.pools, [key]: pool },
        poolLoading: { ...prev.poolLoading, [key]: false },
      }));
    } catch {
      set((prev) => ({ poolLoading: { ...prev.poolLoading, [key]: false } }));
    }
  },

  markSeen: (scryfallId) => {
    const seen = get().seen;
    if (seen.has(scryfallId)) return;
    const next = new Set(seen).add(scryfallId);
    saveSeen(next);
    set({ seen: next });
  },

  markAllSeen: () => {
    const next = new Set(get().cards.map((card) => card.scryfallId));
    saveSeen(next);
    markPrimed();
    set({ seen: next });
  },

  clear: () => {
    // Invalidate anything in flight: without this, a refresh started before
    // sign-out lands afterwards and hands the next account the last one's cards.
    refreshToken += 1;
    set({
      cards: [],
      totalPulls: 0,
      // That dropped refresh will never clear its own loading flag.
      loading: false,
      loaded: false,
      failed: false,
      pools: {},
      poolLoading: {},
      // Discovery is per account: the next sign-in reloads its own from storage.
      seen: new Set(),
    });
  },
}));

/** Every card in a set's pool, flattened - the denominator for "missing". */
export function poolCards(pool: SetPool) {
  return [...pool.mythic, ...pool.rare, ...pool.uncommon, ...pool.common];
}
