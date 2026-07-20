import { create } from 'zustand';
import * as ws from '../net/ws.ts';
import type { CardInst, GameAction, GameActionV2, RoomState, ServerMessage, TablePlayer, TimelineEntry, Zone } from '../net/types.ts';

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
  /** The room the user is ACTIVELY viewing. Background updates for any other
   * room (e.g. bots playing on after you left) must not re-open the table. */
  joinedRoomId: string | null;
  /** Latest turn number seen for rooms we're subscribed to but not viewing -
   * powers the "turns are happening" indicator on the Play page. */
  activity: Record<string, number>;
  /** Undo/redo affordance for the viewed table (server-computed per viewer). */
  undoState: { canUndo: boolean; canRedo: boolean; cursor: number; head: number; isHost: boolean };
  /** Read-only replay scrubbing over the match timeline; frame replaces the
   * live board while active. */
  replay: { active: boolean; index: number; head: number; frame: RoomState | null };
  /** One entry per history snapshot (index-aligned): timestamp, log label,
   * actor, and the card it concerned - powers the event timeline. */
  timeline: TimelineEntry[];

  join: (roomId: string, deckId?: string) => void;
  spectate: (roomId: string) => void;
  leave: () => void;
  start: () => void;
  act: (action: GameAction | GameActionV2) => void;
  redo: () => void;
  rewindTo: (index: number) => void;
  replaySeek: (index: number) => void;
  replayExit: () => void;
  sendChat: (text: string) => void;
  clear: () => void;
  ackClosed: () => void;
  answerCmdChoice: (iid: string, accept: boolean) => void;
  clearLibraryCards: () => void;
  clearActivity: (roomId: string) => void;
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
      case 'cmd.damage': {
        // Commander damage is combat damage: it also drops the life total.
        // Mirror the server's effective (clamp-aware) delta so a decrement at
        // zero commander damage doesn't refund life.
        const before = player.cmdDamage[String(action.fromSeat)] ?? 0;
        const after = Math.max(0, before + action.delta);
        return {
          ...player,
          life: player.life - (after - before),
          cmdDamage: { ...player.cmdDamage, [String(action.fromSeat)]: after },
        };
      }
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
      // Only the room we're actively in owns the table view. Snapshots for a
      // room we've left (bots playing on) just bump its activity indicator so
      // the Play page can show turns are happening - without yanking us back.
      if (message.state.roomId === get().joinedRoomId) {
        set({ room: message.state });
      } else {
        set((state) => ({
          activity: { ...state.activity, [message.state.roomId]: message.state.turnNumber ?? 0 },
        }));
      }
    } else if (message.type === 'cmd.choice') {
      // Every room-scoped event below is ignored unless it belongs to the table
      // we are actively viewing. The server streams events for every table we
      // are still a member of, so without this a play at another table would
      // leak into this one's log, combat popup, or board.
      if (message.roomId === get().joinedRoomId) set({ cmdChoice: { iid: message.iid, to: message.to } });
    } else if (message.type === 'library.cards') {
      if (message.roomId === get().joinedRoomId) set({ libraryCards: message.cards });
    } else if (message.type === 'undo.state') {
      if (message.roomId === get().joinedRoomId)
        set({
          undoState: {
            canUndo: message.canUndo,
            canRedo: message.canRedo,
            cursor: message.cursor,
            head: message.head,
            isHost: message.host,
          },
        });
    } else if (message.type === 'timeline') {
      if (message.roomId === get().joinedRoomId) set({ timeline: message.entries });
    } else if (message.type === 'replay.frame') {
      // Only land a frame while the viewer is actively scrubbing this table.
      if (message.roomId === get().joinedRoomId)
        set((state) =>
          state.replay.active
            ? { replay: { ...state.replay, index: message.index, head: message.head, frame: message.state } }
            : state,
        );
    } else if (message.type === 'room.event') {
      const { room, joinedRoomId } = get();
      if (room && message.roomId === joinedRoomId) set({ room: applyEvent(room, message.actor, message.action) });
    } else if (message.type === 'chat') {
      if (message.roomId === get().joinedRoomId)
        set((state) => ({ chat: [...state.chat.slice(-199), { from: message.from, text: message.text, ts: message.ts }] }));
    } else if (message.type === 'log') {
      if (message.roomId === get().joinedRoomId)
        set((state) => ({ log: [...state.log.slice(-299), { seq: message.seq, text: message.text, ts: message.ts }] }));
    } else if (message.type === 'room.closed') {
      // The table was ended by its host (or expired). Clearing the room drops
      // the shell back to the routed page automatically; drop any activity
      // indicator too.
      const { room, activity } = get();
      const nextActivity = { ...activity };
      delete nextActivity[message.roomId];
      if (room && room.roomId === message.roomId) {
        set({ room: null, spectating: false, chat: [], log: [], joinedRoomId: null, closedRoomId: message.roomId, cmdChoice: null, libraryCards: null, activity: nextActivity, replay: { active: false, index: 0, head: 0, frame: null }, undoState: { canUndo: false, canRedo: false, cursor: 0, head: 0, isHost: false }, timeline: [] });
      } else {
        set({ activity: nextActivity });
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
    closedRoomId: null,
    joinedRoomId: null,
    activity: {},
    undoState: { canUndo: false, canRedo: false, cursor: 0, head: 0, isHost: false },
    replay: { active: false, index: 0, head: 0, frame: null },
    timeline: [],
    clearActivity: (roomId) =>
      set((state) => {
        if (!(roomId in state.activity)) return state;
        const next = { ...state.activity };
        delete next[roomId];
        return { activity: next };
      }),

    join: (roomId, deckId) => {
      set({ spectating: false, chat: [], log: [], joinedRoomId: roomId, replay: { active: false, index: 0, head: 0, frame: null }, undoState: { canUndo: false, canRedo: false, cursor: 0, head: 0, isHost: false }, timeline: [] });
      ws.send({ type: 'room.join', roomId, deckId });
    },
    spectate: (roomId) => {
      set({ spectating: true, chat: [], log: [], joinedRoomId: roomId, replay: { active: false, index: 0, head: 0, frame: null }, undoState: { canUndo: false, canRedo: false, cursor: 0, head: 0, isHost: false }, timeline: [] });
      ws.send({ type: 'room.spectate', roomId });
    },
    leave: () => {
      ws.send({ type: 'room.leave' });
      set({ room: null, spectating: false, chat: [], log: [], joinedRoomId: null, replay: { active: false, index: 0, head: 0, frame: null }, undoState: { canUndo: false, canRedo: false, cursor: 0, head: 0, isHost: false }, timeline: [] });
    },
    start: () => ws.send({ type: 'room.start' }),
    // Actions are frozen while scrubbing a replay - the board is a past frame.
    act: (action) => {
      if (get().replay.active) return;
      ws.sendAction(action);
    },
    redo: () => {
      if (get().replay.active) return;
      ws.sendAction({ kind: 'redo' });
    },
    // Rewind is a deliberate host action launched FROM the replay scrubber, so
    // it is not blocked by replay mode (the caller exits replay right after).
    rewindTo: (index) => ws.sendAction({ kind: 'rewindTo', index }),
    // Seeking activates replay mode (the timeline scrubber is the entry point):
    // set the inspected index and pull the historical frame for it.
    replaySeek: (index) => {
      set((state) => ({ replay: { active: true, index, head: state.undoState.head, frame: state.replay.frame } }));
      ws.send({ type: 'replay.seek', index });
    },
    replayExit: () => set((state) => ({ replay: { active: false, index: 0, head: state.replay.head, frame: null } })),
    sendChat: (text) => ws.send({ type: 'chat.send', text }),
    clear: () => set({ room: null, spectating: false, chat: [], log: [], joinedRoomId: null, replay: { active: false, index: 0, head: 0, frame: null }, undoState: { canUndo: false, canRedo: false, cursor: 0, head: 0, isHost: false }, timeline: [] }),
    ackClosed: () => set({ closedRoomId: null }),
  };
});
