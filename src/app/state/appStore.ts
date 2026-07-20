import { create } from 'zustand';
import * as api from '../net/api.ts';
import * as ws from '../net/ws.ts';
import type { DeckSummary, FriendsPayload, Identity, ServerMessage } from '../net/types.ts';
import { cyberpunkStarters } from '../data/cyberpunk.ts';
import { loadPreferences } from '../preferences.ts';

/**
 * App-level state: the temporary identity, the social graph, and the deck
 * list. Identity is a username + bearer token persisted locally - the account
 * becomes claimable later without the client changing shape.
 */

const IDENTITY_KEY = 'pc.identity';
const SEEDED_KEY = 'pc.seeded';

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
        try {
          // Validate the stored token; a dead one (server reset, revoked)
          // must drop to the auth screen instead of a forever-offline shell.
          await api.me();
          await goOnline(identity);
        } catch (cause) {
          if (cause instanceof api.ApiError && cause.status === 401) {
            localStorage.removeItem(IDENTITY_KEY);
            api.setToken(null);
            set({ identity: null });
          }
          // Network errors: stay signed in; ws reconnect keeps trying.
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
