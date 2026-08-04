import { useCallback, useEffect, useState, type ComponentType } from 'react';
import {
  AlertDialog,
  Avatar,
  Button,
  Card,
  Heading,
  IconButton,
  Input,
  Kbd,
  Pill,
  SegmentedControl,
  Select,
  Size,
  Spinner,
  StatusDot,
  Switch,
  Text,
  TextTone,
  Tooltip,
  useLocale,
  useToast,
} from '@glacier/react';
import {
  Bot,
  Crown,
  Dices,
  Eye,
  Flag,
  Landmark,
  Play,
  PlayingCard,
  PlayingCardPack,
  Shield,
  Swords,
  Ticket,
  Users,
  Zap,
} from '../icons/backfilled.tsx';
import type { IconProps } from '@glacier/icons';
import { launchBotMatch } from '../data/botMatch.ts';
import { ROULETTES, rouletteShape, type RoulettePreset } from '../data/roulette.ts';
import { useT, type MessageKey } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';
import * as api from '../net/api.ts';
import * as ws from '../net/ws.ts';
import type { MatchRow, MyRoom } from '../net/types.ts';
import { useVisibleGames } from '../hooks/useVisibleGames.ts';
import { FORMATS, formatFor } from '../data/formats.ts';
import { getGame, type GameId } from '../data/games.ts';
import { GameTag, GameBadge } from '../components/GameTag.tsx';
import { fmtDuration, relativeWhen } from '../components/MatchHistory.tsx';
import { deckSummaryArt } from '../data/deckCover.ts';
import { DEFAULT_PLAYMAT, playmatBackground } from '../data/playmats.ts';
import './play.css';

/** One of the tables on the game-mode strip. */
interface QuickStart {
  id: string;
  Icon: ComponentType<IconProps>;
  /** Which game the table opens under; every plate wears its game's tag. */
  game: GameId;
  /**
   * A `FORMATS` id - the name, life total and rules all come from there.
   * Magic only: other games have no format, and the server picks its own for
   * them, so their plates must not send one.
   */
  format?: string;
  /** The plate's name for a game with no `FORMATS` entry to name it. */
  label?: MessageKey;
  seats: number;
  /**
   * A line or two on what the evening is like. Two plates can share a format
   * and differ only by seat count, and "4" does not tell anyone that a pod is
   * a long, political game - so the blurb is per plate, not per format.
   */
  blurb: MessageKey;
  /** The plate's own accent, so the strip reads as ten things rather than one. */
  tint: string;
}

/**
 * The tables people actually sit down at, as one click each.
 *
 * A shortlist now, not the whole menu: the Magic formats with a quieter
 * following (Pioneer, Vintage, Pauper, Brawl) live only in the create form's
 * format dropdown below, which keeps the strip scannable. Ordered by how
 * likely someone is to want it: the current constructed formats, then draft,
 * which is the only table you can sit down at owning nothing at all, then the
 * singleton tables, the Yu-Gi-Oh duels, and the sandbox. Every plate wears its
 * game's tag, since the strip is no longer all Magic.
 *
 * Named for what the server will really build: seats are capped at 2-6 and
 * there is no team model anywhere in the room code, so a plate promising "2v2"
 * or "4v4" would be describing a rule nothing enforces. A duel is a duel and a
 * pod is a pod, and the seat count on each plate is the truth about it.
 */
const QUICK_STARTS: QuickStart[] = [
  {
    id: 'standard',
    Icon: Swords,
    game: 'mtg',
    format: 'standard',
    seats: 2,
    blurb: 'plQuickBlurbStandard',
    tint: 'oklch(0.72 0.14 250)',
  },
  {
    id: 'modern',
    Icon: Zap,
    game: 'mtg',
    format: 'modern',
    seats: 2,
    blurb: 'plQuickBlurbModern',
    tint: 'oklch(0.7 0.16 300)',
  },
  {
    // The plain way in: two people, a few packs and nothing else needed. The
    // pod below is the same format with a deeper pool, not a different idea.
    id: 'draftDuel',
    Icon: PlayingCardPack,
    game: 'mtg',
    format: 'draft',
    seats: 2,
    blurb: 'plQuickBlurbDraftDuel',
    tint: 'oklch(0.74 0.14 160)',
  },
  {
    id: 'draftPod',
    Icon: PlayingCardPack,
    game: 'mtg',
    format: 'draft',
    seats: 6,
    blurb: 'plQuickBlurbDraftPod',
    tint: 'oklch(0.72 0.15 190)',
  },
  {
    id: 'legacy',
    Icon: Landmark,
    game: 'mtg',
    format: 'legacy',
    seats: 2,
    blurb: 'plQuickBlurbLegacy',
    tint: 'oklch(0.71 0.15 330)',
  },
  {
    id: 'duelCommander',
    Icon: Shield,
    game: 'mtg',
    format: 'commander',
    seats: 2,
    blurb: 'plQuickBlurbDuelCommander',
    tint: 'oklch(0.75 0.13 40)',
  },
  {
    id: 'pod',
    Icon: Crown,
    game: 'mtg',
    format: 'commander',
    seats: 4,
    blurb: 'plQuickBlurbPod',
    tint: 'oklch(0.8 0.14 85)',
  },
  {
    // The classic 1v1 at 8000 LP. No format field at all: the server forces
    // its own on every non-Magic game, so the plate sends none.
    id: 'ygoDuel',
    Icon: Eye,
    game: 'yugioh',
    label: 'plQuickYgoDuel',
    seats: 2,
    blurb: 'plQuickBlurbYgoDuel',
    tint: 'oklch(0.78 0.14 75)',
  },
  {
    // Battle Royal is what Yu-Gi-Oh itself calls the free-for-all table.
    id: 'ygoBattleRoyal',
    Icon: Users,
    game: 'yugioh',
    label: 'plQuickYgoBattleRoyal',
    seats: 4,
    blurb: 'plQuickBlurbYgoBattleRoyal',
    tint: 'oklch(0.68 0.15 45)',
  },
  {
    id: 'freeform',
    Icon: Dices,
    game: 'mtg',
    format: 'freeform',
    seats: 4,
    blurb: 'plQuickBlurbFreeform',
    tint: 'oklch(0.73 0.12 215)',
  },
];

/**
 * The headline vital a non-Magic game starts at - "8000 LP" - straight from
 * the game registry, so the plate and the table it opens can never disagree.
 */
function vitalHint(gameId: GameId): string {
  const vital = getGame(gameId).resources.find((resource) => resource.primary);
  return vital && typeof vital.start === 'number' ? `${vital.start} ${vital.label}` : '';
}


/**
 * The lobby, dressed as a pregame screen: your saved tables (rooms survive
 * server restarts now) as a server browser, create a table, join by code, and
 * answer invites. Joining always asks which deck to bring - the fanned-out
 * game itself lives in TablePage. Resuming a saved table sends no deckId: the
 * seat already holds the deck.
 *
 * Two routes, one component: `new` (the + in the rail) is every way INTO a
 * game - the big mode plates, create, join by code, answer an invite - and
 * `tables` is the games you are already in plus your career record. They share
 * the deck picker, the join call and the room list, which is why splitting
 * them into two files would mean keeping two copies of all of it in step.
 */

export function PlayPage({ mode = 'tables' }: { mode?: 'new' | 'tables' }) {
  const t = useT();
  const locale = useLocale();
  const { toast } = useToast();
  const decks = useApp((state) => state.decks);
  const identity = useApp((state) => state.identity);
  const invites = useApp((state) => state.invites);
  const dismissInvite = useApp((state) => state.dismissInvite);
  const join = useGame((state) => state.join);
  const closedRoomId = useGame((state) => state.closedRoomId);
  const ackClosed = useGame((state) => state.ackClosed);
  const activity = useGame((state) => state.activity);
  const clearActivity = useGame((state) => state.clearActivity);

  const [tableName, setTableName] = useState('');
  const [seats, setSeats] = useState('4');
  const [persistent, setPersistent] = useState(true);
  const [format, setFormat] = useState('commander');
  const games = useVisibleGames();
  const [game, setGame] = useState('mtg');
  const [deckId, setDeckId] = useState<string>('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<MyRoom[] | null>(null);
  const [history, setHistory] = useState<MatchRow[] | null>(null);
  const [confirmClose, setConfirmClose] = useState<MyRoom | null>(null);
  const [closing, setClosing] = useState(false);
  /** Which mode plate is opening a table, so only that one spins. */
  const [quickBusy, setQuickBusy] = useState<string | null>(null);
  /** Which roulette is being dealt, same rule: only that plate spins. */
  const [spinning, setSpinning] = useState<string | null>(null);

  /**
   * Roulette: create the table, let the TABLE deal every seat a deck, and go -
   * with nothing brought and nothing chosen. `quickplay` is what makes the deal
   * server-side, so this works with an empty collection, which is the whole
   * point of the entry.
   *
   * The two modes differ in exactly who fills the other chairs, and everything
   * that follows from that:
   *
   *   ai      - bots take every other seat and the game starts itself. One
   *             click to playing, which is what the plate has always done.
   *   friends - the same table with the same dealt decks, but the other seats
   *             are left OPEN and it stops in the lobby, because a table nobody
   *             has been invited to yet has nothing to start. `seats` has to be
   *             passed explicitly here: the launcher otherwise sizes a room to
   *             the seats this call fills, which with no bots is just mine.
   */
  const spin = async (preset: RoulettePreset, vs: 'ai' | 'friends') => {
    if (spinning || busy || quickBusy) return;
    setSpinning(`${preset.id}:${vs}`);
    try {
      await launchBotMatch({
        name: t(preset.title),
        game: 'mtg',
        format: preset.format,
        bots: vs === 'ai' ? preset.seats - 1 : 0,
        seats: preset.seats,
        seat: true,
        difficulty: 'normal',
        style: 'mixed',
        enforced: false,
        quickplay: true,
        autoStart: vs === 'ai',
      });
    } catch (error) {
      toast({
        tone: 'danger',
        message: (error as Error).message === 'offline' ? t('botsOffline') : t('rlFailed'),
      });
    } finally {
      setSpinning(null);
    }
  };

  // Only decks for the chosen game are eligible; if the current pick belongs to
  // another game (or none), fall back to the first deck of this game.
  const gameDecks = decks.filter((deck) => (deck.game || 'mtg') === game);
  const chosenDeck = (deckId && gameDecks.some((deck) => deck.id === deckId) ? deckId : gameDecks[0]?.id) || '';
  // A draft table is the one kind you sit down at with nothing: the deck is the
  // point of the evening, not the price of admission.
  const drafting = game === 'mtg' && format === 'draft';

  // A quick start ignores the form entirely, so it picks from its OWN game's
  // decks - a Yu-Gi-Oh plate wants a Yu-Gi-Oh deck whatever the form says.
  const decksFor = (gameId: GameId) => decks.filter((deck) => (deck.game || 'mtg') === gameId);

  /** How a table of this size is described: a duel, or a count of players. */
  const seatLabel = (count: number) =>
    count === 2 ? '1v1' : `${count} ${t('tblPlayers').toLowerCase()}`;

  /** A plate's name: the format's printed name for Magic, its own label otherwise. */
  const presetName = (preset: QuickStart) =>
    preset.label ? t(preset.label) : formatFor(preset.format).name;

  const refreshRooms = useCallback(async () => {
    try {
      setRooms(await api.myRooms());
    } catch {
      // Offline: keep whatever the section already shows.
    }
    try {
      setHistory(await api.matches());
    } catch {
      // Offline: keep whatever the history already shows.
    }
  }, []);

  // The saved-tables list: fetched on mount, refreshed when a table closes
  // anywhere and when the window regains focus.
  useEffect(() => {
    void refreshRooms();
    const offMessage = ws.onMessage((message) => {
      if (message.type === 'room.closed') void refreshRooms();
    });
    const onFocus = () => void refreshRooms();
    window.addEventListener('focus', onFocus);
    return () => {
      offMessage();
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshRooms]);

  // The table we were seated at was closed under us; say so once.
  useEffect(() => {
    if (closedRoomId) {
      toast({ tone: 'info', message: t('plTableClosed') });
      ackClosed();
    }
  }, [closedRoomId, ackClosed, toast, t]);

  /**
   * Open a table and sit down at it.
   *
   * With a `preset` this is the mode-plate path, and it deliberately reads
   * nothing at all from the form below. Those plates sit ABOVE the form, so
   * inheriting a half-typed table name, or a seat count someone set while
   * looking at a different game, would make one click do something other than
   * what the plate it was on says.
   */
  const create = async (preset?: QuickStart) => {
    const useGame = preset ? preset.game : game;
    const useFormat = preset ? preset.format : format;
    const useSeats = preset ? preset.seats : Number(seats);
    const useDraft = useGame === 'mtg' && useFormat === 'draft';
    // A deck built for this exact format if there is one - otherwise any deck
    // for the plate's game, which is what the form's own picker would default to.
    const presetDecks = preset ? decksFor(preset.game) : [];
    const useDeck = preset
      ? ((presetDecks.find((deck) => deck.format === preset.format) ?? presetDecks[0])?.id ?? '')
      : chosenDeck;

    if (preset) setQuickBusy(preset.id);
    else setBusy(true);
    try {
      const room = await api.createRoom(
        preset
          ? `${presetName(preset)} · ${seatLabel(preset.seats)}`
          : tableName || `${t('playTitle')} - ${new Date().toLocaleTimeString()}`,
        useSeats,
        // A quick table is still a lobby: persistent, so wandering off to build
        // a deck for it does not throw it away.
        preset ? true : persistent,
        // The format preset drives starting life + commander machinery
        // server-side. Only Magic sends one: the server forces its own format
        // on every other game.
        { game: useGame, ...(useGame === 'mtg' && useFormat ? { format: useFormat } : {}) },
      );
      join(room.roomId, useDraft ? undefined : useDeck || undefined);
      void refreshRooms();
    } catch {
      toast({ tone: 'danger', message: t('obOffline') });
    } finally {
      setBusy(false);
      setQuickBusy(null);
    }
  };

  const joinByCode = async () => {
    setBusy(true);
    try {
      const room = await api.getRoomByCode(code.trim().toUpperCase());
      // Bring a deck for the TABLE's game, not for whichever game the create
      // form above happens to be showing — the seat rejects a mismatch, which
      // used to dead-end anyone joining a Yu-Gi-Oh duel from an MTG picker.
      const forRoom = decks.filter((deck) => (deck.game || 'mtg') === (room.game || 'mtg'));
      const deck = forRoom.some((d) => d.id === chosenDeck) ? chosenDeck : forRoom[0]?.id;
      join(room.roomId, deck || undefined);
    } catch {
      toast({ tone: 'danger', message: t('playCodeBad') });
    } finally {
      setBusy(false);
    }
  };

  const closeTable = async () => {
    if (!confirmClose) return;
    setClosing(true);
    try {
      await api.closeRoom(confirmClose.roomId);
      setConfirmClose(null);
      await refreshRooms();
    } catch {
      toast({ tone: 'danger', message: t('obOffline') });
    } finally {
      setClosing(false);
    }
  };

  const starting = mode === 'new';

  // The masthead's backdrop: the most recently touched deck's art — the chosen
  // game's deck on the start screen (it follows the form's game switch), any
  // game's on the career screen. A fresh account gets the default felt.
  const artSource = starting ? gameDecks : decks;
  const recentDeck = [...artSource].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const mastWide = recentDeck ? deckSummaryArt(recentDeck) : '';
  const mastArt = mastWide ? `url("${mastWide}")` : playmatBackground(DEFAULT_PLAYMAT);

  // The career headline, derived from the SAME match list the history section
  // renders — no extra fetch. Only finished ranked matches carry a result.
  const finished = (history ?? []).filter((match) => match.matchId && match.won != null);
  const careerWins = finished.filter((match) => match.won).length;
  const careerLosses = finished.length - careerWins;
  const careerRate = finished.length > 0 ? Math.round((careerWins / finished.length) * 100) : null;

  return (
    <div className="page playPage">
      {/* The masthead band: art behind a directional scrim, the page's h1 in
          big type — and on the career screen, the W/L plates. */}
      <header className={starting ? 'pgMast' : 'pgMast pgMastCareer'}>
        <div className="pgMastArt" style={{ backgroundImage: mastArt }} aria-hidden />
        <div className="pgMastScrim" aria-hidden />
        <div className="pgMastBody">
          {!starting && <span className="pgMastKicker">{t('hmCareer')}</span>}
          <Heading level={1} noMargin className="pgMastTitle">
            {starting ? t('playTitle') : t('plYourTables')}
          </Heading>
          <Text size={Size.Large} tone={TextTone.Muted} className="pgMastLede">
            {starting ? t('playLede') : t('plTablesLede')}
          </Text>
        </div>
        {!starting && (
          <div className="pgCareer" role="group" aria-label={t('hmCareer')}>
            <div className="pgCareerPlate pgCareerWins">
              <span className="pgCareerValue">{history !== null ? careerWins : '—'}</span>
              <span className="pgCareerLabel">{t('hmWins')}</span>
              <span className="pgCareerEdge" aria-hidden />
            </div>
            <div className="pgCareerPlate pgCareerLosses">
              <span className="pgCareerValue">{history !== null ? careerLosses : '—'}</span>
              <span className="pgCareerLabel">{t('plLosses')}</span>
              <span className="pgCareerEdge" aria-hidden />
            </div>
            <div className="pgCareerPlate">
              <span className="pgCareerValue">{careerRate != null ? `${careerRate}%` : '—'}</span>
              <span className="pgCareerLabel">{t('hmWinRate')}</span>
              <span
                className="pgCareerEdge"
                style={careerRate != null ? { inlineSize: `${careerRate}%` } : undefined}
                aria-hidden
              />
            </div>
            <div className="pgCareerPlate">
              <span className="pgCareerValue">{history !== null ? history.length : '—'}</span>
              <span className="pgCareerLabel">{t('hmGames')}</span>
              <span className="pgCareerEdge" aria-hidden />
            </div>
          </div>
        )}
      </header>

      {starting && (
      <>
      {/* Above even the quick starts, because it asks for less than they do:
          they still need a deck you built, and this needs nothing at all. One
          click deals every seat a random deck and starts the game, so it is
          the only entry that works on a brand-new account. */}
      <section className="pgRoulette pgEnter" style={{ animationDelay: '20ms' }} aria-label={t('rlTitle')}>
        <div className="pgHead">
          <Heading level={2} noMargin className="pgHeadTitle">
            {t('rlTitle')}
          </Heading>
          <Text size={Size.Small} tone={TextTone.Muted}>
            {t('rlLede')}
          </Text>
        </div>
        <div className="pgRouletteGrid">
          {ROULETTES.map((preset) => {
            const dealing = spinning?.startsWith(`${preset.id}:`) ?? false;
            const locked = busy || spinning !== null || quickBusy !== null;
            return (
              // Wears the mode plate wholesale rather than a parallel skin of
              // its own: same tint machinery, hover sweep, focus ring, entrance
              // and disabled treatment, so the two strips cannot drift. pgSpin
              // only carries what genuinely differs.
              //
              // A DIV, unlike the mode plates, because it now holds two real
              // actions. The plate used to be one big button and the whole
              // surface was the click; a button inside a button is invalid, and
              // one plate cannot mean two different things anyway. The tint,
              // the sweep and the entrance are unchanged - only what catches
              // the pointer moved, from the plate to the pair at its foot.
              <div
                key={preset.id}
                className="pgMode pgSpin"
                data-static=""
                style={{ ['--pg-tint' as string]: preset.tint }}
              >
                <span className="pgModeTop">
                  <span className="pgModeIcon" aria-hidden>
                    {dealing ? <Spinner size="sm" /> : <Dices size={24} />}
                  </span>
                  <GameTag game="mtg" className="pgModeGame" />
                </span>
                <span className="pgModeName">{t(preset.title)}</span>
                <span className="pgModeBlurb">{t(preset.blurb)}</span>
                <span className="pgModeMeta">
                  <span className="pgModeShape">{rouletteShape(preset.seats)}</span>
                  <span className="pgModeHint">
                    {dealing
                      ? t('rlDealing')
                      : `${formatFor(preset.format).startingLife} ${t('tblLife').toLowerCase()}`}
                  </span>
                </span>
                {/* Joined, not two loose buttons: one control with a seam down
                    it, so the choice reads as "which opponents" rather than as
                    two unrelated ways in. Same rule as the mode strip - one
                    table per click, and every button on the page locks while
                    any of them is mid-deal, because a second press would open a
                    table nobody asked for. */}
                <div className="pgSpinVs" role="group" aria-label={t(preset.title)}>
                  <button
                    type="button"
                    className="pgSpinBtn"
                    disabled={locked}
                    onClick={() => void spin(preset, 'friends')}
                  >
                    {spinning === `${preset.id}:friends` ? <Spinner size="sm" /> : <Users size={15} />}
                    {t('rlVsFriends')}
                  </button>
                  <button
                    type="button"
                    className="pgSpinBtn"
                    disabled={locked}
                    onClick={() => void spin(preset, 'ai')}
                  >
                    {spinning === `${preset.id}:ai` ? <Spinner size="sm" /> : <Bot size={15} />}
                    {t('rlVsAi')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* The shortcut past the form: the popular tables across every game as
          big mode plates, each one already knowing its game, its seats and its
          life total. Above the builder rather than beside it, because the
          builder is what you fall back to when none of these is the evening
          you wanted - the quieter formats still live in its dropdown. */}
      <section className="pgModes pgEnter" style={{ animationDelay: '60ms' }} aria-label={t('plQuickTitle')}>
        <div className="pgHead">
          <Heading level={2} noMargin className="pgHeadTitle">
            {t('plQuickTitle')}
          </Heading>
          <Text size={Size.Small} tone={TextTone.Muted}>
            {t('plQuickLede')}
          </Text>
        </div>
        <div className="pgModeGrid">
          {QUICK_STARTS.map((preset, index) => {
            const isDraft = preset.game === 'mtg' && preset.format === 'draft';
            // Draft is the one table you can sit down at with nothing; every
            // other plate needs a deck built for its own game.
            const blocked = !isDraft && decksFor(preset.game).length === 0;
            const opening = quickBusy === preset.id;
            // The first plate is the strip's headline — the order already puts
            // the likeliest evening first, so it gets the big treatment.
            const featured = index === 0;
            return (
              <button
                key={preset.id}
                type="button"
                className={featured ? 'pgMode pgModeFeat' : 'pgMode'}
                style={{ ['--pg-tint' as string]: preset.tint }}
                // Every plate is one request; a second click anywhere on the
                // strip while one is in flight would open a table nobody asked
                // for and leave the player seated at the wrong one.
                disabled={blocked || busy || quickBusy !== null || spinning !== null}
                title={blocked ? t('plQuickNeedDeck') : undefined}
                onClick={() => void create(preset)}
              >
                <span className="pgModeTop">
                  <span className="pgModeIcon" aria-hidden>
                    {opening ? <Spinner size="sm" /> : <preset.Icon size={featured ? 26 : 20} />}
                  </span>
                  {featured && <span className="pgModeFeatTag">{t('plModePopular')}</span>}
                  {/* Which game this table opens under - the strip is no
                      longer all Magic, so every plate says. */}
                  <GameTag game={preset.game} className="pgModeGame" />
                </span>
                <span className="pgModeName">
                  {presetName(preset)}
                  {/* The format is called Limited, but nobody says "let's play
                      Limited" - they say draft. Both names are on the plate so
                      the strip is scannable by the word people actually use
                      without renaming the format everywhere else. */}
                  {isDraft && (
                    <span className="pgModeAlias"> ({t('plQuickDraft')})</span>
                  )}
                </span>
                {/* What the evening is actually like, which is the thing the
                    format name and the seat count between them never say. */}
                <span className="pgModeBlurb">{t(preset.blurb)}</span>
                <span className="pgModeMeta">
                  <span className="pgModeShape">{seatLabel(preset.seats)}</span>
                  <span className="pgModeHint">
                    {blocked
                      ? t('plQuickNeedDeck')
                      : isDraft
                        ? t('playDraftHint')
                        : preset.game === 'mtg'
                          ? `${formatFor(preset.format).startingLife} ${t('tblLife').toLowerCase()}`
                          : vitalHint(preset.game)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pgCustom pgEnter" style={{ animationDelay: '140ms' }}>
        <div className="pgHead">
          <Heading level={2} noMargin className="pgHeadTitle">
            {t('plCustomTitle')}
          </Heading>
          <Text size={Size.Small} tone={TextTone.Muted}>
            {t('plCustomLede')}
          </Text>
        </div>
        <div className="playGrid">
        <Card elevation={2} className="playCard">
          <div className="playCardIcon" aria-hidden>
            <Swords size={22} />
          </div>
          <div className="playCardHead">
            <Heading level={3} noMargin>
              {t('playNewTable')}
            </Heading>
            <GameTag game={game} />
          </div>
          <div className="control">
            <Text as="span" size={Size.Small} tone={TextTone.Muted}>
              {t('playTableName')}
            </Text>
            <Input value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder="Friday pod" />
          </div>
          <div className="control">
            <Text as="span" size={Size.Small} tone={TextTone.Muted}>
              {t('playGame')}
            </Text>
            <SegmentedControl
              fullWidth
              aria-label={t('playGame')}
              value={game}
              onValueChange={setGame}
              options={games.map((g) => ({ value: g.id, label: g.name.replace('Magic: The Gathering', 'Magic') }))}
            />
          </div>
          {game === 'mtg' && (
            <div className="control">
              <Text as="span" size={Size.Small} tone={TextTone.Muted}>
                {t('playFormat')}
              </Text>
              <Select
                fullWidth
                aria-label={t('playFormat')}
                value={format}
                onValueChange={setFormat}
                options={FORMATS.map((f) => ({
                  value: f.id,
                  label:
                    f.id === 'draft'
                      ? `${f.name} · ${t('playDraftHint')}`
                      : `${f.name} · ${f.startingLife} ${t('tblLife').toLowerCase()}`,
                }))}
              />
            </div>
          )}
          <div className="control">
            <Text as="span" size={Size.Small} tone={TextTone.Muted}>
              {t('playSeats')}
            </Text>
            <SegmentedControl
              value={seats}
              onValueChange={setSeats}
              options={['2', '3', '4', '5', '6'].map((n) => ({ value: n, label: n }))}
            />
          </div>
          <div className="control myPersistent">
            <Switch label={t('plPersistent')} checked={persistent} onCheckedChange={setPersistent} />
            <Text size={Size.XSmall} tone={TextTone.Subtle} className="myPersistentHint">
              {t('plPersistentHint')}
            </Text>
          </div>
          {drafting ? (
            <div className="control">
              <Text size={Size.XSmall} tone={TextTone.Subtle}>
                {t('playDraftLede')}
              </Text>
            </div>
          ) : (
            <DeckPicker value={chosenDeck} onChange={setDeckId} game={game} />
          )}
          <Button
            onClick={() => void create()}
            loading={busy}
            // A launch already in flight owns the socket: this one would join a
            // different room mid-sequence and the in-flight sends would land on
            // whichever table won the race.
            disabled={(!drafting && gameDecks.length === 0) || quickBusy !== null || spinning !== null}
          >
            {drafting ? t('playCreateDraft') : t('playCreate')}
          </Button>
        </Card>

        {/* JOIN: the code is the star — a big ENTER CODE moment. */}
        <Card elevation={2} className="playCard pgJoinCard">
          <div className="playCardIcon" aria-hidden>
            <Ticket size={22} />
          </div>
          <Heading level={3} noMargin>
            {t('playJoin')}
          </Heading>
          <div className="control pgCodeEntry">
            <span className="pgCodeTitle">{t('plEnterCode')}</span>
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              aria-label={t('playCodePlaceholder')}
            />
            <Text size={Size.XSmall} tone={TextTone.Subtle}>
              {t('playCodePlaceholder')}
            </Text>
          </div>
          <DeckPicker value={chosenDeck} onChange={setDeckId} />
          <Button
            onClick={joinByCode}
            loading={busy}
            disabled={code.length < 6 || quickBusy !== null || spinning !== null}
          >
            {t('playJoinButton')}
          </Button>
        </Card>
        </div>
      </section>

      {invites.length > 0 && (
        <section className="pgInvites pgEnter" style={{ animationDelay: '220ms' }}>
          <Heading level={2} noMargin className="pgHeadTitle">
            {t('playInvites')}
          </Heading>
          <div className="inviteList">
            {invites.map((invite) => (
              <Card key={invite.roomId} elevation={2} className="inviteCard">
                <Text>
                  <strong>{invite.from.username}</strong> {t('playInviteFrom')} <strong>{invite.roomName}</strong>
                </Text>
                <div className="inviteActions">
                  <Button
                    size="sm"
                    onClick={() => {
                      dismissInvite(invite.roomId);
                      join(invite.roomId, chosenDeck || undefined);
                    }}
                  >
                    {t('playAccept')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => dismissInvite(invite.roomId)}>
                    {t('playDismiss')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      </>
      )}

      {!starting && (
      <>
      {/* The server browser: every saved table as a row — game accent on the
          leading edge, who is seated, seat occupancy, and a big way back in. */}
      <section className="pgSrv pgEnter" style={{ animationDelay: '60ms' }} aria-label={t('plYourTables')}>
        {rooms !== null && rooms.length === 0 ? (
          <Text tone={TextTone.Muted}>{t('plNoTables')}</Text>
        ) : (
          <div className="pgSrvList">
            {(rooms ?? []).map((room) => {
              const open = room.players.length < room.seats;
              return (
                <div
                  key={room.roomId}
                  className="pgSrvRow"
                  style={{ ['--pg-tint' as string]: getGame(room.game).accent }}
                >
                  <div className="pgSrvLead">
                    <GameBadge game={room.game} />
                    <div className="pgSrvInfo">
                      <div className="pgSrvTitle">
                        <span className="pgSrvName">{room.name}</span>
                        <Kbd>{room.code}</Kbd>
                        {room.persistent && (
                          <Pill size="sm" tone="accent">
                            {t('plLobby')}
                          </Pill>
                        )}
                        {activity[room.roomId] != null && (
                          <Pill size="sm" tone="success" className="pgSrvLive">
                            <span className="pgSrvLiveDot" aria-hidden />
                            {t('plTurn')} {activity[room.roomId]}
                          </Pill>
                        )}
                        <span className="pgSrvState" data-open={open || undefined}>
                          {open ? t('plSrvOpen') : t('plSrvFull')}
                        </span>
                      </div>
                      <div className="pgSrvMeta">
                        <span
                          className="pgSeatMeter"
                          role="img"
                          aria-label={`${t('playSeats')}: ${room.players.length}/${room.seats}`}
                        >
                          {Array.from({ length: room.seats }, (_, seatIndex) => (
                            <span
                              key={seatIndex}
                              className="pgSeatDot"
                              data-filled={seatIndex < room.players.length || undefined}
                            />
                          ))}
                          <span className="pgSeatCount">
                            {room.players.length}/{room.seats}
                          </span>
                        </span>
                        <div className="pgSrvPlayers">
                          {room.players.map((player) => (
                            <span key={player.userId} className="pgSrvPlayer">
                              <Avatar name={player.username} size="sm" />
                              <Text as="span" size={Size.Small}>
                                {player.username}
                              </Text>
                              <StatusDot size="sm" tone={player.online ? 'success' : 'neutral'} />
                            </span>
                          ))}
                        </div>
                        <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                          {relativeWhen(room.updatedAt, locale)}
                        </Text>
                      </div>
                    </div>
                  </div>
                  <div className="pgSrvActions">
                    <Button
                      size="lg"
                      className="pgSrvJoin"
                      onClick={() => {
                        clearActivity(room.roomId);
                        join(room.roomId);
                      }}
                    >
                      <Play size={18} /> {t('plResume')}
                    </Button>
                    {room.players[0]?.userId === identity?.userId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmClose(room)}
                      >
                        <Flag size={14} /> {t('plEndMatch')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* The record behind the headline: every match as a row whose leading
          edge wears its result — success for a win, danger for a loss. */}
      {history !== null && history.length > 0 && (
        <section className="pgHist pgEnter" style={{ animationDelay: '140ms' }}>
          <Heading level={2} noMargin className="pgHeadTitle">
            {t('plHistory')}
          </Heading>
          <div className="pgHistList">
            {history.map((match, index) => {
              const others = match.players
                .map((player) => player.username)
                .filter((name) => name !== identity?.username);
              const result = match.won == null ? undefined : match.won ? 'win' : 'loss';
              return (
                <div key={`${match.playedAt}-${index}`} className="pgHistRow" data-result={result}>
                  <span className="pgHistBadge" data-result={result}>
                    {match.won == null ? (
                      <PlayingCard size={13} aria-hidden />
                    ) : match.won ? (
                      t('pmWinAbbr')
                    ) : (
                      t('pmLossAbbr')
                    )}
                  </span>
                  <div className="pgHistMain">
                    <span className="pgHistName">
                      <GameTag game={match.game} showName={false} /> {match.name || t('playTitle')}
                    </span>
                    <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="pgHistWith">
                      {others.length > 0 ? `${t('plWith')} ${others.join(', ')}` : t('plSolo')}
                    </Text>
                    {match.matchId && (
                      <span className="pgHistStats">
                        {match.winnerUsername && (
                          <span className="pgHistStat">
                            <Crown size={11} /> {match.winnerUsername}
                          </span>
                        )}
                        {match.turns != null && (
                          <span className="pgHistStat">
                            {match.turns} {t('pmTurnsWord')}
                          </span>
                        )}
                        {match.durationMs != null && <span className="pgHistStat">{fmtDuration(match.durationMs)}</span>}
                        {match.cardsPlayed != null && (
                          <span className="pgHistStat">
                            <PlayingCard size={11} /> {match.cardsPlayed}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="pgHistSide">
                    <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                      {relativeWhen(match.playedAt, locale)}
                    </Text>
                    {match.replayable && match.roomId && (
                      <Tooltip content={t('gpWatchReplay')}>
                        <IconButton
                          size="sm"
                          variant="soft"
                          aria-label={t('gpWatchReplay')}
                          onClick={() => join(match.roomId!)}
                        >
                          <Play size={15} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      </>
      )}

      <AlertDialog
        open={confirmClose !== null}
        onClose={() => setConfirmClose(null)}
        title={t('plEndMatch')}
        description={t('plEndMatchDesc')}
        tone="danger"
        actionLabel={t('plEndMatch')}
        actionLoading={closing}
        onAction={() => void closeTable()}
        cancelLabel={t('dbCancel')}
      />
    </div>
  );
}

function DeckPicker({ value, onChange, game }: { value: string; onChange: (id: string) => void; game?: string }) {
  const t = useT();
  const decks = useApp((state) => state.decks);
  // When a game is specified (create form), only that game's decks are eligible.
  const eligible = game ? decks.filter((deck) => (deck.game || 'mtg') === game) : decks;
  return (
    <div className="control">
      <Text as="span" size={Size.Small} tone={TextTone.Muted}>
        {t('playPickDeck')}
      </Text>
      <Select
        value={value}
        onValueChange={onChange}
        options={eligible.map((deck) => ({ value: deck.id, label: deck.name }))}
        placeholder={eligible.length === 0 ? t('playNoDecksForGame') : t('playPickDeck')}
      />
    </div>
  );
}
