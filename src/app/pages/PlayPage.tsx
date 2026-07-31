import { useCallback, useEffect, useState, type ComponentType } from 'react';
import {
  AlertDialog,
  Avatar,
  Button,
  Card,
  Heading,
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
  useLocale,
  useToast,
} from '@glacier/react';
import {
  Crown,
  Dices,
  Eye,
  Flag,
  Landmark,
  Layers,
  PackageOpen,
  Shield,
  Swords,
  Ticket,
  Users,
  Zap,
} from '@glacier/icons';
import type { IconProps } from '@glacier/icons';
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
import { MatchHistory, relativeWhen } from '../components/MatchHistory.tsx';
import './play.css';

/** One of the tables on the quick-start strip. */
interface QuickStart {
  id: string;
  Icon: ComponentType<IconProps>;
  /** Which game the table opens under; every card wears its game's tag. */
  game: GameId;
  /**
   * A `FORMATS` id - the name, life total and rules all come from there.
   * Magic only: other games have no format, and the server picks its own for
   * them, so their cards must not send one.
   */
  format?: string;
  /** The card's name for a game with no `FORMATS` entry to name it. */
  label?: MessageKey;
  seats: number;
  /**
   * A line or two on what the evening is like. Two cards can share a format
   * and differ only by seat count, and "4" does not tell anyone that a pod is
   * a long, political game - so the blurb is per card, not per format.
   */
  blurb: MessageKey;
  /** The card's own accent, so the strip reads as six things rather than one. */
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
 * singleton tables, the Yu-Gi-Oh duels, and the sandbox. Every card wears its
 * game's tag, since the strip is no longer all Magic.
 *
 * Named for what the server will really build: seats are capped at 2-6 and
 * there is no team model anywhere in the room code, so a card promising "2v2"
 * or "4v4" would be describing a rule nothing enforces. A duel is a duel and a
 * pod is a pod, and the seat count on each card is the truth about it.
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
    Icon: Layers,
    game: 'mtg',
    format: 'draft',
    seats: 2,
    blurb: 'plQuickBlurbDraftDuel',
    tint: 'oklch(0.74 0.14 160)',
  },
  {
    id: 'draftPod',
    Icon: PackageOpen,
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
    // its own on every non-Magic game, so the card sends none.
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
 * the game registry, so the card and the table it opens can never disagree.
 */
function vitalHint(gameId: GameId): string {
  const vital = getGame(gameId).resources.find((resource) => resource.primary);
  return vital && typeof vital.start === 'number' ? `${vital.start} ${vital.label}` : '';
}


/**
 * The lobby: your saved tables (rooms survive server restarts now), create a
 * table, join by code, and answer invites. Joining always asks which deck to
 * bring - the fanned-out game itself lives in TablePage. Resuming a saved
 * table sends no deckId: the seat already holds the deck.
 *
 * Two routes, one component: `new` (the + in the rail) is every way INTO a
 * game - create, join by code, answer an invite - and `tables` is the games you
 * are already in plus what you have played. They share the deck picker, the
 * join call and the room list, which is why splitting them into two files would
 * mean keeping two copies of all of it in step.
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
  /** Which quick-start card is opening a table, so only that one spins. */
  const [quickBusy, setQuickBusy] = useState<string | null>(null);

  // Only decks for the chosen game are eligible; if the current pick belongs to
  // another game (or none), fall back to the first deck of this game.
  const gameDecks = decks.filter((deck) => (deck.game || 'mtg') === game);
  const chosenDeck = (deckId && gameDecks.some((deck) => deck.id === deckId) ? deckId : gameDecks[0]?.id) || '';
  // A draft table is the one kind you sit down at with nothing: the deck is the
  // point of the evening, not the price of admission.
  const drafting = game === 'mtg' && format === 'draft';

  // A quick start ignores the form above entirely, so it picks from its OWN
  // game's decks - a Yu-Gi-Oh card wants a Yu-Gi-Oh deck whatever the form says.
  const decksFor = (gameId: GameId) => decks.filter((deck) => (deck.game || 'mtg') === gameId);

  /** How a table of this size is described: a duel, or a count of players. */
  const seatLabel = (count: number) =>
    count === 2 ? '1v1' : `${count} ${t('tblPlayers').toLowerCase()}`;

  /** A card's name: the format's printed name for Magic, its own label otherwise. */
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
   * With a `preset` this is the quick-start path, and it deliberately reads
   * nothing at all from the form below. Those cards sit ABOVE the form, so
   * inheriting a half-typed table name, or a seat count someone set while
   * looking at a different game, would make one click do something other than
   * what the card it was on says.
   */
  const create = async (preset?: QuickStart) => {
    const useGame = preset ? preset.game : game;
    const useFormat = preset ? preset.format : format;
    const useSeats = preset ? preset.seats : Number(seats);
    const useDraft = useGame === 'mtg' && useFormat === 'draft';
    // A deck built for this exact format if there is one - otherwise any deck
    // for the card's game, which is what the form's own picker would default to.
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
  return (
    <div className="page playPage">
      <Heading level={1}>{starting ? t('playTitle') : t('plYourTables')}</Heading>
      <Text size={Size.Large} tone={TextTone.Muted} className="lede">
        {starting ? t('playLede') : t('plTablesLede')}
      </Text>

      {starting && (
      <>
      {/* The shortcut past the form: the popular tables across every game,
          each one already knowing its game, its seats and its life total.
          Above the builder rather than beside it, because the builder is what
          you fall back to when none of these is the evening you wanted - the
          quieter formats still live in its dropdown. */}
      <section className="quickStarts">
        <div className="quickStartsHead">
          <Heading level={2} noMargin>
            {t('plQuickTitle')}
          </Heading>
          <Text size={Size.Small} tone={TextTone.Muted}>
            {t('plQuickLede')}
          </Text>
        </div>
        <div className="quickGrid">
          {QUICK_STARTS.map((preset) => {
            const isDraft = preset.game === 'mtg' && preset.format === 'draft';
            // Draft is the one table you can sit down at with nothing; every
            // other card needs a deck built for its own game.
            const blocked = !isDraft && decksFor(preset.game).length === 0;
            const opening = quickBusy === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className="quickCard"
                style={{ ['--qs-tint' as string]: preset.tint }}
                // Every card is one request; a second click anywhere on the
                // strip while one is in flight would open a table nobody asked
                // for and leave the player seated at the wrong one.
                disabled={blocked || busy || quickBusy !== null}
                title={blocked ? t('plQuickNeedDeck') : undefined}
                onClick={() => void create(preset)}
              >
                <span className="quickCardTop">
                  <span className="quickCardIcon" aria-hidden>
                    {opening ? <Spinner size="sm" /> : <preset.Icon size={20} />}
                  </span>
                  {/* Which game this table opens under - the strip is no
                      longer all Magic, so every card says. */}
                  <GameTag game={preset.game} className="quickCardGame" />
                </span>
                <span className="quickCardName">
                  {presetName(preset)}
                  {/* The format is called Limited, but nobody says "let's play
                      Limited" - they say draft. Both names are on the card so
                      the strip is scannable by the word people actually use
                      without renaming the format everywhere else. */}
                  {isDraft && (
                    <span className="quickCardAlias"> ({t('plQuickDraft')})</span>
                  )}
                </span>
                {/* What the evening is actually like, which is the thing the
                    format name and the seat count between them never say. */}
                <span className="quickCardBlurb">{t(preset.blurb)}</span>
                <span className="quickCardMeta">
                  <span className="quickCardShape">{seatLabel(preset.seats)}</span>
                  <span className="quickCardHint">
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
          <Button onClick={() => void create()} loading={busy} disabled={!drafting && gameDecks.length === 0}>
            {drafting ? t('playCreateDraft') : t('playCreate')}
          </Button>
        </Card>

        <Card elevation={2} className="playCard">
          <div className="playCardIcon" aria-hidden>
            <Ticket size={22} />
          </div>
          <Heading level={3} noMargin>
            {t('playJoin')}
          </Heading>
          <div className="control">
            <Text as="span" size={Size.Small} tone={TextTone.Muted}>
              {t('playCodePlaceholder')}
            </Text>
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
            />
          </div>
          <DeckPicker value={chosenDeck} onChange={setDeckId} />
          <Button onClick={joinByCode} loading={busy} disabled={code.length < 6}>
            {t('playJoinButton')}
          </Button>
        </Card>
      </div>

      {invites.length > 0 && (
        <section>
          <Heading level={2}>{t('playInvites')}</Heading>
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
      <section className="myTables">
        {rooms !== null && rooms.length === 0 ? (
          <Text tone={TextTone.Muted}>{t('plNoTables')}</Text>
        ) : (
          <div className="myTableList">
            {(rooms ?? []).map((room) => (
              <Card key={room.roomId} elevation={2} className="myTableRow">
                <div className="myTableLead">
                  <GameBadge game={room.game} />
                  <div className="myTableInfo">
                  <div className="myTableTitle">
                    <Text as="span" className="myTableName">
                      {room.name}
                    </Text>
                    <Kbd>{room.code}</Kbd>
                    {room.persistent && (
                      <Pill size="sm" tone="accent">
                        {t('plLobby')}
                      </Pill>
                    )}
                    {activity[room.roomId] != null && (
                      <Pill size="sm" tone="success" className="myTableLive">
                        <span className="myTableLiveDot" aria-hidden />
                        {t('plTurn')} {activity[room.roomId]}
                      </Pill>
                    )}
                  </div>
                  <div className="myTableMeta">
                    <div className="myTablePlayers">
                      {room.players.map((player) => (
                        <span key={player.userId} className="myTablePlayer">
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
                <div className="myTableActions">
                  <Button
                    size="sm"
                    onClick={() => {
                      clearActivity(room.roomId);
                      join(room.roomId);
                    }}
                  >
                    {t('plResume')}
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
              </Card>
            ))}
          </div>
        )}
      </section>

      {history !== null && history.length > 0 && (
        <section className="matchHistory">
          <Heading level={2}>{t('plHistory')}</Heading>
          <MatchHistory matches={history} myUsername={identity?.username} onReplay={(roomId) => join(roomId)} />
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
