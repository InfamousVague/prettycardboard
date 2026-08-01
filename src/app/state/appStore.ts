import { create } from 'zustand';
import * as api from '../net/api.ts';
import * as ws from '../net/ws.ts';
import { isLocalPlay } from '../tauri.ts';
import type { DeckSummary, FriendsPayload, Identity, ServerMessage } from '../net/types.ts';
import { cyberpunkStarters } from '../data/cyberpunk.ts';
import { yugiohStarters } from '../data/yugioh.ts';
import { loadPreferences, savePreferences } from '../preferences.ts';
import { DEFAULT_PLAYMAT, isCustomPlaymat } from '../data/playmats.ts';
import { DEFAULT_CARD_BACK, isCustomCardBack } from '../data/cardBacks.ts';

/**
 * App-level state: the temporary identity, the social graph, and the deck
 * list. Identity is a username + bearer token persisted locally - the account
 * becomes claimable later without the client changing shape.
 */

// Local play (desktop) signs into the bundled local server, which is a
// different account universe: scope its identity to its own key so flipping
// the mode never logs the online account out (and vice versa).
const IDENTITY_KEY = isLocalPlay() ? 'pc.identity.local' : 'pc.identity';
const SEEDED_KEY = 'pc.seeded';
/** Marks that this account's Yu-Gi-Oh starters have been dealt out, so a player
 *  who deletes one does not find it back at the next sign-in. */
const YGO_SEEDED_KEY = 'pc.seeded.yugioh';

export interface InviteToast {
  from: { userId: string; username: string };
  roomId: string;
  roomName: string;
  at: number;
}

interface AppState {
  identity: Identity | null;
  connected: boolean;
  friends: FriendsPayload;
  decks: DeckSummary[];
  invites: InviteToast[];
  bootstrapped: boolean;

  bootstrap: () => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  signOut: () => void;
  refreshFriends: () => Promise<void>;
  refreshDecks: () => Promise<void>;
  dismissInvite: (roomId: string) => void;
}

const EMPTY_FRIENDS: FriendsPayload = { friends: [], incoming: [], outgoing: [] };

function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

/**
 * Reconcile this browser with the account's uploaded playmat. The id is a
 * property of the account (one file per user on our disk), not of the machine
 * that happened to upload it, so every sign-in adopts it: the picker can offer
 * the tile anywhere, and an id left behind by a re-upload - or by an upload
 * that has since been deleted - stops painting a mat that no longer exists.
 */
/**
 * Same contract as syncCustomPlaymat, for the card back: the upload is a
 * property of the account, so every sign-in adopts it, and a preference still
 * pointing at a back that has since been replaced or deleted is corrected
 * rather than left painting a 404 on every face-down card.
 */
function syncCustomCardBack(accountBack: string): void {
  const prefs = loadPreferences();
  if (prefs.customCardBack === accountBack) return;
  const usingOld = isCustomCardBack(prefs.cardBack) && prefs.cardBack !== accountBack;
  savePreferences({
    ...prefs,
    customCardBack: accountBack,
    cardBack: usingOld ? accountBack || DEFAULT_CARD_BACK : prefs.cardBack,
  });
  window.dispatchEvent(new CustomEvent('pc:preferences', { detail: loadPreferences() }));
}

function syncCustomPlaymat(accountMat: string, accountMats: string[]): void {
  const prefs = loadPreferences();
  const same =
    prefs.customPlaymat === accountMat &&
    prefs.customPlaymats.length === accountMats.length &&
    prefs.customPlaymats.every((mat, index) => mat === accountMats[index]);
  if (same) return;
  // The account's mats are the truth; a browser only mirrors them. Following an
  // id the account no longer has (deleted elsewhere) falls back to the default.
  const orphaned = isCustomPlaymat(prefs.playmat) && !accountMats.includes(prefs.playmat);
  savePreferences({
    ...prefs,
    customPlaymat: accountMat,
    customPlaymats: accountMats,
    playmat: orphaned ? DEFAULT_PLAYMAT : prefs.playmat,
  });
  window.dispatchEvent(new CustomEvent('pc:preferences', { detail: loadPreferences() }));
}

export const useApp = create<AppState>((set, get) => {
  const handleMessage = (message: ServerMessage) => {
    if (message.type === 'presence') {
      set((state) => ({
        friends: {
          ...state.friends,
          friends: state.friends.friends.map((friend) =>
            friend.userId === message.userId
              ? { ...friend, online: message.online, roomId: message.roomId }
              : friend,
          ),
        },
      }));
    } else if (message.type === 'friend.request' || message.type === 'friend.accepted') {
      // The roster and the rail badge follow the push immediately.
      void get().refreshFriends();
    } else if (message.type === 'decks.changed') {
      // Another device edited a deck; the list and covers refresh.
      void get().refreshDecks();
    } else if (message.type === 'invite') {
      set((state) => ({
        invites: [
          ...state.invites.filter((invite) => invite.roomId !== message.roomId),
          { from: message.from, roomId: message.roomId, roomName: message.roomName, at: Date.now() },
        ],
      }));
    }
  };

  const goOnline = async (identity: Identity) => {
    api.setToken(identity.token);
    ws.connect(identity.token);
    await Promise.all([get().refreshFriends(), get().refreshDecks()]);
  };

  // Shared sign-in tail for register and login: persist, seed on first
  // registration (the Final Fantasy precons become the starting decks), and
  // go online.
  const adopt = async (identity: Identity, seed: boolean) => {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    set({ identity });
    api.setToken(identity.token);
    if (seed && localStorage.getItem(SEEDED_KEY) !== identity.userId) {
      // The full precon decklists are heavy (~850KB) and only needed here, once,
      // to seed a brand-new account - so load them on demand rather than up front.
      const { PRECONS, preconDeckCards } = await import('../data/precons.ts');
      for (const precon of PRECONS) {
        await api.createDeck(precon.name, 'Commander', preconDeckCards(precon));
      }
      localStorage.setItem(SEEDED_KEY, identity.userId);
    }
    await goOnline(identity);
    // Seed the Cyberpunk starters once per account, robustly: only when the
    // account has no Cyberpunk decks yet (the server is the source of truth, so
    // this reaches existing accounts too and never double-seeds across devices).
    // Cyberpunk is a WIP game — only seed when the dev toggle is on (it seeds on
    // the next login after a user enables it).
    if (loadPreferences().enableWip && !get().decks.some((deck) => deck.game === 'cyberpunk')) {
      for (const starter of cyberpunkStarters()) {
        await api.createDeck(starter.name, 'standard', starter.cards, null, 'cyberpunk');
      }
      await get().refreshDecks();
    }
    // Same server-truth guard for the Yu-Gi-Oh starters — no WIP gate, the game
    // ships enabled for everyone. Guarded per STARTER (a sign-in interrupted
    // mid-seed heals on the next one rather than leaving the account half
    // stocked forever) and best-effort (a seeding hiccup must never fail the
    // sign-in it rode in on — the player would be bounced to the auth screen
    // over a starter deck).
    // The marker is written only after the whole set lands, so a sign-in
    // interrupted mid-seed heals on the next one; once it IS written, deleting
    // a starter is respected rather than undone at every login.
    try {
      if (localStorage.getItem(YGO_SEEDED_KEY) !== identity.userId) {
        const owned = new Set(
          get()
            .decks.filter((deck) => deck.game === 'yugioh')
            .map((deck) => deck.name),
        );
        for (const starter of yugiohStarters()) {
          if (owned.has(starter.name)) continue;
          await api.createDeck(starter.name, 'standard', starter.cards, null, 'yugioh');
        }
        localStorage.setItem(YGO_SEEDED_KEY, identity.userId);
        await get().refreshDecks();
      }
    } catch {
      // Offline or a server hiccup: no marker, so the next sign-in retries.
    }
  };

  ws.onStatus((connected) => set({ connected }));
  ws.onMessage(handleMessage);

  return {
    identity: null,
    connected: false,
    friends: EMPTY_FRIENDS,
    decks: [],
    invites: [],
    bootstrapped: false,

    bootstrap: async () => {
      if (get().bootstrapped) return; // StrictMode double-effect guard
      const identity = loadIdentity();
      if (identity) {
        set({ identity });
        api.setToken(identity.token);
        // Open the socket BEFORE validating the token, not after. api.me() has
        // no timeout, and any failure that is not a 401 (server restarting,
        // laptop offline at launch, DNS) used to skip goOnline() entirely - so
        // ws.connect() was never called, ws.ts's reconnect backoff never
        // existed to retry, and the app sat signed in and permanently
        // socketless until relaunch. connect() is idempotent for the same
        // token, so goOnline() below is a no-op second call.
        ws.connect(identity.token);
        try {
          // Validate the stored token; a dead one (server reset, revoked)
          // must drop to the auth screen instead of a forever-offline shell.
          const account = await api.me();
          // Adopt the account's uploaded mat. It is stored per-account on the
          // server, so a machine that has never uploaded still finds it - and a
          // stale id left in this browser gets corrected (or cleared, if the
          // upload is gone) rather than painting a blank felt forever.
          syncCustomPlaymat(account.customPlaymat ?? '', account.customPlaymats ?? []);
          syncCustomCardBack(account.customCardBack ?? '');
          await goOnline(identity);
        } catch (cause) {
          if (cause instanceof api.ApiError && cause.status === 401) {
            // The token is genuinely dead: tear the socket down too, or its
            // backoff would retry a handshake the server will keep refusing.
            localStorage.removeItem(IDENTITY_KEY);
            api.setToken(null);
            ws.disconnect();
            set({ identity: null });
          }
          // Network errors: stay signed in. The socket is already open (or
          // retrying with backoff), and the notification backstop reconciles
          // friends and decks the moment it comes up.
        }
      }
      set({ bootstrapped: true });
    },

    register: async (username: string, password: string) => {
      const identity = await api.register(username, password);
      await adopt(identity, true);
    },

    login: async (username: string, password: string) => {
      const identity = await api.login(username, password);
      await adopt(identity, false);
    },

    signOut: () => {
      localStorage.removeItem(IDENTITY_KEY);
      api.setToken(null);
      ws.disconnect();
      // The collection is per account, so it must not survive into the next
      // sign-in. Imported lazily: the library page is a lazy chunk, and a
      // static import here would pull it into the shell (and close a cycle,
      // since the collection store reads identity from this one).
      void import('./collectionStore.ts').then((m) => m.useCollection.getState().clear());
      set({ identity: null, friends: EMPTY_FRIENDS, decks: [], invites: [] });
    },

    refreshFriends: async () => {
      set({ friends: await api.getFriends() });
    },

    refreshDecks: async () => {
      set({ decks: await api.listDecks() });
    },

    dismissInvite: (roomId: string) => {
      set((state) => ({ invites: state.invites.filter((invite) => invite.roomId !== roomId) }));
    },
  };
});
