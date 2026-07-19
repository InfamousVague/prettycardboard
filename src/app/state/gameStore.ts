import { create } from 'zustand';
import * as ws from '../net/ws.ts';
import type { CardInst, CombatResults, GameAction, GameActionV2, RoomState, ServerMessage, TablePlayer, Zone } from '../net/types.ts';

/**
 * Live table state. The server is authoritative: `room.state` snapshots replace
 * everything, and `room.event` deltas are applied locally for latency-free
 * updates in between. Any event the client cannot fully apply (hidden
 * information it does not hold) degrades gracefully - the next snapshot
 * reconciles.
 */

export interface ChatLine {
  from: { userId: string; username: string };
  text: string;
  ts: number;
}

export interface LogLine {
  seq: number;
  text: string;
  ts: number;
}

interface GameState {
  room: RoomState | null;
  spectating: boolean;
  chat: ChatLine[];
  log: LogLine[];
  /** Owner-only prompt: your commander is leaving - return it to the command zone? */
  cmdChoice: { iid: string; to: string } | null;
  /** Your private library peek/search window (server-filtered, viewer-only). */
  libraryCards: CardInst[] | null;
  /** Set when the room we were seated at was closed by its host; pages toast it once and ack. */
  closedRoomId: string | null;
  /** A locked combat just resolved; every viewer gets the breakdown popup. */
  combatResults: CombatResults | null;

  join: (roomId: string, deckId?: string) => void;
  spectate: (roomId: string) => void;
  leave: () => void;
  start: () => void;
  act: (action: GameAction | GameActionV2) => void;
  sendChat: (text: string) => void;
  clear: () => void;
  ackClosed: () => void;
  answerCmdChoice: (iid: string, accept: boolean) => void;
  clearLibraryCards: () => void;
  clearCombatResults: () => void;
}

function mapCards(cards: CardInst[], iid: string, fn: (card: CardInst) => CardInst): CardInst[] {
  return cards.map((card) => (card.iid === iid ? fn(card) : card));
}

const ZONES: Zone[] = ['hand', 'battlefield', 'graveyard', 'exile', 'command'];

function zoneList(player: TablePlayer, zone: Zone): CardInst[] {
  if (zone === 'hand') return player.hand ?? [];
  if (zone === 'library') return [];
  return player[zone];
}

function withZone(player: TablePlayer, zone: Zone, cards: CardInst[]): TablePlayer {
  if (zone === 'hand') return { ...player, hand: cards, handCount: cards.length };
  if (zone === 'library') return player;
  return { ...player, [zone]: cards };
}

/** Update one card wherever it lives on one player's board. */
function patchCard(player: TablePlayer, iid: string, fn: (card: CardInst) => CardInst): TablePlayer {
  let next = player;
  for (const zone of ZONES) {
    const cards = zoneList(player, zone);
    if (cards.some((card) => card.iid === iid)) {
      next = withZone(next, zone, mapCards(cards, iid, fn));
    }
  }
  return next;
}

/**
 * Apply a rebroadcast action to the snapshot. The server may attach extra
 * fields (revealed card details, counts); unknown shapes fall through as
 * no-ops and the next room.state reconciles.
 */
function applyEvent(room: RoomState, actor: string, action: GameAction & Record<string, unknown>): RoomState {
  const players = room.players.map((player): TablePlayer => {
    if (player.userId !== actor) {
      // Cross-player effects: commander damage bookkeeping happens on the actor.
      return player;
    }
    switch (action.kind) {
      case 'card.pos':
        return patchCard(player, action.iid, (card) => ({ ...card, x: action.x, y: action.y }));
      case 'card.tap':
        return patchCard(player, action.iid, (card) => ({ ...card, tapped: action.tapped }));
      case 'card.face':
        return patchCard(player, action.iid, (card) => ({ ...card, faceDown: action.faceDown }));
      case 'card.counter':
        return patchCard(player, action.iid, (card) => ({
          ...card,
          counters: {
            ...card.counters,
            [action.counter]: Math.max(0, (card.counters[action.counter] ?? 0) + action.delta),
          },
        }));
      case 'card.move': {
        // Find and remove from any visible zone, then insert into the target if
        // it is visible. Cards entering/leaving hidden zones are reconciled by
        // the server's authoritative payload fields when present.
        let moved: CardInst | undefined;
        let next = player;
        for (const zone of ZONES) {
          const cards = zoneList(player, zone);
          const hit = cards.find((card) => card.iid === action.iid);
          if (hit) {
            moved = hit;
            next = withZone(next, zone, cards.filter((card) => card.iid !== action.iid));
          }
        }
        const detail = action.card as CardInst | undefined;
        const card = detail ?? moved;
        if (action.to === 'library') {
          return { ...next, libraryCount: next.libraryCount + (moved || detail ? 1 : 0) };
        }
        if (!card) return next;
        // Tokens cease to exist outside the battlefield.
        if (card.isToken && action.to !== 'battlefield') return next;
        const placed: CardInst = {
          ...card,
          x: action.x ?? card.x,
          y: action.y ?? card.y,
          tapped: action.to === 'battlefield' ? card.tapped : false,
        };
        return withZone(next, action.to, [...zoneList(next, action.to), placed]);
      }
      case 'token.create':
      case 'token.clone': {
        // The server rebroadcasts the minted token as `card` (v1 docs said
        // `token`); accept both, and never double-place an iid.
        const token = (action.card ?? action.token) as CardInst | undefined;
        if (!token || player.battlefield.some((c) => c.iid === token.iid)) return player;
        return { ...player, battlefield: [...player.battlefield, token] };
      }
      case 'draw': {
        const drawn = action.cards as CardInst[] | undefined;
        const count = (action.count as number) ?? drawn?.length ?? 0;
        return {
          ...player,
          libraryCount: Math.max(0, player.libraryCount - count),
          handCount: player.handCount + count,
          hand: drawn && player.hand ? [...player.hand, ...drawn] : player.hand,
        };
      }
      case 'shuffle':
        return player;
      case 'mulligan':
        // Hidden-zone churn - wait for the authoritative snapshot.
        return player;
      case 'untap.all':
        return { ...player, battlefield: player.battlefield.map((card) => ({ ...card, tapped: false })) };
      case 'life.set':
        return { ...player, life: action.value };
      case 'life.add':
        return { ...player, life: player.life + action.delta };
      case 'cmd.damage':
        return {
          ...player,
          cmdDamage: {
            ...player.cmdDamage,
            [String(action.fromSeat)]: Math.max(0, (player.cmdDamage[String(action.fromSeat)] ?? 0) + action.delta),
          },
        };
      case 'poison.add':
        return { ...player, poison: Math.max(0, player.poison + action.delta) };
      default:
        return player;
    }
  });
  return { ...room, players };
}

export const useGame = create<GameState>((set, get) => {
  // Reconnects: the server holds the seat while the socket is down; re-enter
  // the room to get a fresh authoritative snapshot.
  ws.onStatus((connected) => {
    const { room, spectating } = get();
    if (connected && room) {
      ws.send(spectating ? { type: 'room.spectate', roomId: room.roomId } : { type: 'room.join', roomId: room.roomId });
    }
  });

  ws.onMessage((message: ServerMessage) => {
    if (message.type === 'room.state') {
      set({ room: message.state });
    } else if (message.type === 'cmd.choice') {
      set({ cmdChoice: { iid: message.iid, to: message.to } });
    } else if (message.type === 'library.cards') {
      set({ libraryCards: message.cards });
    } else if (message.type === 'combat.results') {
      set({ combatResults: { attackerSeat: message.attackerSeat, entries: message.entries, totalBySeat: message.totalBySeat } });
    } else if (message.type === 'room.event') {
      const room = get().room;
      if (room) set({ room: applyEvent(room, message.actor, message.action) });
    } else if (message.type === 'chat') {
      set((state) => ({ chat: [...state.chat.slice(-199), { from: message.from, text: message.text, ts: message.ts }] }));
    } else if (message.type === 'log') {
      set((state) => ({ log: [...state.log.slice(-299), { seq: message.seq, text: message.text, ts: message.ts }] }));
    } else if (message.type === 'room.closed') {
      // The table was ended by its host (or expired). Clearing the room drops
      // the shell back to the routed page automatically.
      const room = get().room;
      if (room && room.roomId === message.roomId) {
        set({ room: null, spectating: false, chat: [], log: [], closedRoomId: message.roomId, cmdChoice: null, libraryCards: null });
      }
    }
  });

  return {
    room: null,
    spectating: false,
    chat: [],
    log: [],
    cmdChoice: null,
    libraryCards: null,
    answerCmdChoice: (iid, accept) => {
      ws.sendAction({ kind: 'cmd.return', iid, accept });
      set({ cmdChoice: null });
    },
    clearLibraryCards: () => set({ libraryCards: null }),
    combatResults: null,
    clearCombatResults: () => set({ combatResults: null }),
    closedRoomId: null,

    join: (roomId, deckId) => {
      set({ spectating: false, chat: [], log: [] });
      ws.send({ type: 'room.join', roomId, deckId });
    },
    spectate: (roomId) => {
      set({ spectating: true, chat: [], log: [] });
      ws.send({ type: 'room.spectate', roomId });
    },
    leave: () => {
      ws.send({ type: 'room.leave' });
      set({ room: null, spectating: false, chat: [], log: [] });
    },
    start: () => ws.send({ type: 'room.start' }),
    act: (action) => ws.sendAction(action),
    sendChat: (text) => ws.send({ type: 'chat.send', text }),
    clear: () => set({ room: null, spectating: false, chat: [], log: [] }),
    ackClosed: () => set({ closedRoomId: null }),
  };
});
