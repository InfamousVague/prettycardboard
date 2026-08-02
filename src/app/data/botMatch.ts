import { closeRoom, createRoom } from '../net/api.ts';
import { isConnected, send } from '../net/ws.ts';
import { useGame } from '../state/gameStore.ts';
import type { RoomState } from '../net/types.ts';

/**
 * Build a table against bots, end to end: create the room, take a chair (or
 * the spectator rail), seat the bots, and hand the result over to the normal
 * lobby/match flow. Shared by the Play plate's quick presets on Home and the
 * developer Bots tab in Settings - one launcher, so the two can never drift
 * on the fiddly parts (store-driven joins, waiting for seats, cleanup).
 *
 * Bots only play Magic tables (server rule), and each bot shuffles up a
 * random embedded precon suited to the table's format on its own.
 *
 * Throws Error('offline') without touching anything when the socket is down;
 * any later failure tears the half-built room down before rethrowing.
 */

export type BotStyle = 'mixed' | 'casual' | 'aggro' | 'defensive';
export type BotDifficulty = 'easy' | 'normal' | 'hard';

/** The style each seated bot gets under 'mixed': a rotating spread. */
const MIX: Array<'casual' | 'aggro' | 'defensive'> = ['aggro', 'defensive', 'casual'];

export interface BotMatchOpts {
  name: string;
  bots: number;
  difficulty: BotDifficulty;
  style: BotStyle;
  format: 'commander' | 'standard';
  enforced: boolean;
  /** Take a chair myself; false = all-bot exhibition, spectated (auto-starts). */
  seat: boolean;
  /** Sit down already holding this deck instead of picking in the lobby. */
  deckId?: string;
  /** With a deck in hand: ready up and deal immediately - click to playing.
   *  If the server declines the start, the lobby simply stays up. */
  autoStart?: boolean;
}

/** Wait until the joined room satisfies `ready`, or throw. */
async function awaitRoom(roomId: string, ready: (room: RoomState) => boolean): Promise<RoomState> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const room = useGame.getState().room;
    if (room?.roomId === roomId && ready(room)) return room;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('room never settled');
}

export async function launchBotMatch(opts: BotMatchOpts): Promise<void> {
  // Everything after room creation rides the socket; a reconnect window
  // would silently drop the joins and bot seats.
  if (!isConnected()) throw new Error('offline');
  const seats = opts.bots + (opts.seat ? 1 : 0);
  const { roomId } = await createRoom(opts.name, seats, false, { format: opts.format, game: 'mtg' });
  let settled = false;
  try {
    // Through the store's own actions (raw sends would leave joinedRoomId
    // stale and the store would drop the new room's states): vacate whatever
    // room we were in, then take a chair or the spectator rail.
    const game = useGame.getState();
    if (game.joinedRoomId) game.leave();
    if (opts.seat) game.join(roomId, opts.deckId);
    else game.spectate(roomId);
    const first = await awaitRoom(roomId, () => true);
    // The state always carries the room's full settings; enforcement is a
    // one-flag change on top of them.
    if (opts.enforced && first.settings) {
      send({ type: 'room.settings', settings: { ...first.settings, enforced: true } });
    }
    for (let i = 0; i < opts.bots; i += 1) {
      send({
        type: 'bot.add',
        style: opts.style === 'mixed' ? MIX[i % MIX.length] : opts.style,
        difficulty: opts.difficulty,
      });
    }
    const want = opts.bots + (opts.seat ? 1 : 0);
    await awaitRoom(roomId, (room) => (room.players?.length ?? 0) >= want);
    if (!opts.seat) {
      // An exhibition starts itself; there is nobody to wait for.
      useGame.getState().start();
    } else if (opts.autoStart && opts.deckId) {
      send({ type: 'room.ready', ready: true });
      await awaitRoom(roomId, (room) => room.players.some((p) => !p.isBot && p.ready));
      useGame.getState().start();
    }
    settled = true;
  } finally {
    if (!settled) {
      // Leave no half-built table behind: step out of it if we got in, and
      // close it (we are its host) so it never lingers as an orphan.
      const game = useGame.getState();
      if (game.joinedRoomId === roomId) game.leave();
      void closeRoom(roomId).catch(() => null);
    }
  }
}
