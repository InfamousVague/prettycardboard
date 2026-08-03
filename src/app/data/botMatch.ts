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
 * Bots play Magic and Yu-Gi-Oh tables (server rule), and each bot shuffles up
 * a random embedded deck suited to the table's game and format on its own.
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
  /** Which card game the table plays. Yu-Gi-Oh has one format ('standard'),
   *  and no enforcement - the rules engine is Magic-only. */
  game?: 'mtg' | 'yugioh';
  enforced: boolean;
  /** Take a chair myself; false = all-bot exhibition, spectated (auto-starts). */
  seat: boolean;
  /**
   * Total chairs at the table. Defaults to exactly the ones this launch fills
   * (`bots` plus mine), which is right for a bot match and wrong for anything
   * that leaves seats open - a roulette against FRIENDS adds no bots but still
   * needs the room to be five wide, or nobody can join it.
   */
  seats?: number;
  /** Sit down already holding this deck instead of picking in the lobby. */
  deckId?: string;
  /**
   * Nobody brings a deck: the table deals every seat one of the bundled
   * precons, mine included. This is what makes a roulette a roulette - the
   * deal is server-side (ws.rs `quickplay_deal_seats`), so it works with an
   * empty collection and cannot be steered from here.
   */
  quickplay?: boolean;
  /** With a deck in hand: ready up and deal immediately - click to playing.
   *  If the server declines the start, the lobby simply stays up. Quickplay
   *  counts as a deck in hand; the table is the one supplying it. */
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
  const seats = opts.seats ?? opts.bots + (opts.seat ? 1 : 0);
  const game = opts.game ?? 'mtg';
  const { roomId } = await createRoom(opts.name, seats, false, {
    format: game === 'yugioh' ? 'standard' : opts.format,
    game,
  });
  let settled = false;
  /** Whether the player is already looking at this table. Gates the teardown:
   *  an orphan is worth closing, a lobby someone is sitting in is not. */
  let seated = false;
  try {
    // Through the store's own actions (raw sends would leave joinedRoomId
    // stale and the store would drop the new room's states): vacate whatever
    // room we were in, then take a chair or the spectator rail.
    const store = useGame.getState();
    if (store.joinedRoomId) store.leave();
    if (opts.seat) store.join(roomId, opts.deckId);
    else store.spectate(roomId);
    const first = await awaitRoom(roomId, () => true);
    // From here the player is LOOKING at the table: the shell switches to the
    // table the moment a room state lands (App.tsx `inRoom`), which is exactly
    // what this await returned on. Everything after this point is decoration
    // on a lobby that already exists, so a failure must not delete it.
    seated = true;
    // The state always carries the room's full settings; these are one-flag
    // changes on top of them. Enforcement is Magic-only (the rules engine is);
    // quickplay works wherever the server has a deck pool, which today is
    // Magic and Yu-Gi-Oh - so it is not gated on the game here, and the server
    // declines it for anything else rather than dealing the wrong card game.
    const wantEnforced = opts.enforced && game === 'mtg';
    if ((wantEnforced || opts.quickplay) && first.settings) {
      send({
        type: 'room.settings',
        settings: {
          ...first.settings,
          ...(wantEnforced ? { enforced: true } : null),
          ...(opts.quickplay ? { quickplay: true } : null),
        },
      });
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
    // The table deals my deck the moment the quickplay flag lands, but that is
    // a round trip. Readying before it arrives races start_room's "everyone
    // picked a deck" check and the start is simply refused, leaving a lobby
    // the player has to finish by hand - which is the one thing a one-click
    // launch must not do. Bots deal themselves in bot.add, so only my own seat
    // is worth waiting on.
    if (opts.quickplay && opts.seat) {
      await awaitRoom(roomId, (room) => room.players.some((p) => !p.isBot && Boolean(p.deckId)));
    }
    if (!opts.seat) {
      // An exhibition starts itself; there is nobody to wait for.
      useGame.getState().start();
    } else if (opts.autoStart && (opts.deckId || opts.quickplay)) {
      send({ type: 'room.ready', ready: true });
      await awaitRoom(roomId, (room) => room.players.some((p) => !p.isBot && p.ready));
      useGame.getState().start();
    }
    settled = true;
  } finally {
    // Tear down only what the player never saw. Before the first room state
    // there is nothing on screen and an abandoned room would be a real orphan,
    // so it is closed. AFTER it, the player is sitting in a lobby - and the
    // steps that can still fail here are all optional polish: the settings
    // flip, the bots, the deal, the auto-start. A dropped frame or a
    // backgrounded tab timing out the wait must not yank a table out from
    // under someone who has been looking at it for ten seconds. Leaving it up
    // is recoverable by hand (the host can flip quickplay, pick a deck, or
    // start); deleting it is not.
    if (!settled && !seated) {
      const game = useGame.getState();
      if (game.joinedRoomId === roomId) game.leave();
      void closeRoom(roomId).catch(() => null);
    }
  }
}
