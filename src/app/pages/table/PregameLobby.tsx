import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  AlertDialog,
  Avatar,
  Button,
  IconButton,
  Input,
  Kbd,
  Menu,
  MenuItem,
  MenuSeparator,
  Pill,
  Popover,
  SegmentedControl,
  Select,
  Size,
  StatusDot,
  Switch,
  Text,
  TextTone,
  Tooltip,
} from '@glacier/react';
import {
  Bot,
  Check,
  Circle,
  Cpu,
  Crown,
  Eye,
  Flame,
  Gauge,
  Link2,
  LogOut,
  Mountain,
  Play,
  Settings2,
  Shield,
  Shuffle,
  Sparkles,
  Swords,
  ThumbsUp,
  Timer,
  Trash2,
  UserPlus,
  Users,
  WifiOff,
  X,
} from '@glacier/icons';
import { PlayingCardDeck } from '../../icons/cards.ts';
import { MAX_QUICKPLAY_ROLLS } from '../../data/quickplay.ts';
import { useT } from '../../i18n.ts';
import { useApp } from '../../state/appStore.ts';
import { useGame } from '../../state/gameStore.ts';
import { send } from '../../net/ws.ts';
import { closeRoom, userStats } from '../../net/api.ts';
import { deckSummaryArt } from '../../data/deckCover.ts';
import { rankFor, winRate } from '../../data/ranks.ts';
import { RankEmblem } from '../../components/RankEmblem.tsx';
import { GameTag } from '../../components/GameTag.tsx';
import { GameCard } from '../../components/GameCard.tsx';
import { SaltPile } from '../../components/SaltPile.tsx';
import { playmatBackground } from '../../data/playmats.ts';
import { getGame, resolveCardImage } from '../../data/games.ts';
import { formatFor } from '../../data/formats.ts';
import type { GameSettings, RoomState, TablePlayer, UserStats } from '../../net/types.ts';

/** "1m 40s" / "45s" - a typical turn, short enough for a stat chip. */
function fmtTurn(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

const DEFAULT_SETTINGS: GameSettings = {
  startingLife: null,
  startingHand: null,
  freeMulligans: null,
  unlimitedMulligans: false,
  mulliganRule: 'london',
  firstPlayer: 'auto',
  firstSeat: null,
  skipFirstDraw: null,
};

/**
 * The lobby is a matchup, not a form: a versus stage carries you and the table
 * you are about to face, a strip of seat chips carries the roster, and one bar
 * across the floor carries the only two decisions anyone makes here (which deck,
 * and go). Everything that is scouting rather than deciding - records, salt,
 * turn pace, deck composition - lives one click deep in a seat's popover, so
 * the stage stays readable at a glance and the detail is still all there.
 */
/** The lobby's own slot for the table nav; TablePage portals it in here so the
 *  nav is a child of the launch bar rather than a rail floating over the page. */
export const LOBBY_NAV_DOCK_ID = 'pregame-nav-dock';

export function PregameLobby({
  room,
  me,
  spectating,
  isHost,
  onShare,
}: {
  room: RoomState;
  me?: TablePlayer;
  spectating: boolean;
  isHost: boolean;
  onShare: () => void;
}) {
  const t = useT();
  const decks = useApp((state) => state.decks);
  const start = useGame((state) => state.start);
  const game = room.game || 'mtg';
  const gameDecks = decks.filter((deck) => (deck.game || 'mtg') === game);
  const selectedDeck = gameDecks.find((deck) => deck.id === me?.deckId);
  const selectedArt = selectedDeck ? deckSummaryArt(selectedDeck) : '';
  // Quickplay: the table deals the decks, so the picker is replaced by a
  // reroll. rollsLeft mirrors the server's cap - the server is what enforces
  // it, this only decides whether the button is worth offering.
  const quickplay = Boolean(room.settings?.quickplay);
  const rollsLeft = Math.max(0, MAX_QUICKPLAY_ROLLS - (me?.quickplayRolls ?? 0));
  // This table drafted its decks and the host locked them in: no swapping the
  // limited pool for something built at home.
  const deckLocked = Boolean(
    room.draft?.lockDecks && room.draft.seats.some((seat) => seat.userId === me?.userId && seat.built),
  );
  const playersBySeat = new Map(room.players.map((player) => [player.seat, player]));
  const seats = Array.from({ length: room.seats }, (_, seat) => playersBySeat.get(seat));
  // Everyone who is not me, in seat order. A spectator has no seat of their own,
  // so the whole table reads as the far side of the stage.
  const opponents = room.players
    .filter((player) => player.userId !== me?.userId)
    .sort((a, b) => a.seat - b.seat);
  const opponentsReady = opponents.filter((player) => player.ready).length;

  // Every seated player's all-time record, so the roster reads as a scouting
  // board. Refetched when the seat set changes; failures just leave a card
  // statless rather than blocking the lobby. Bots have no account to look up.
  const [records, setRecords] = useState<Record<string, UserStats>>({});
  const rosterKey = room.players.map((player) => player.userId).sort().join(',');
  useEffect(() => {
    let alive = true;
    void Promise.all(
      room.players
        .filter((player) => !player.isBot)
        .map(async (player) => {
          try {
            return [player.userId, await userStats(player.userId)] as const;
          } catch {
            return null;
          }
        }),
    ).then((entries) => {
      if (alive) setRecords(Object.fromEntries(entries.filter((e): e is [string, UserStats] => e !== null)));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterKey]);

  // Pre-game rule settings (host-editable in the lobby; read-only for others).
  // Defaults come from the game registry: Cyberpunk 0/6, Yu-Gi-Oh 8000/5, MTG
  // by format — mirroring the server's own seat defaults.
  const cyber = game === 'cyberpunk';
  const yugioh = game === 'yugioh';
  const settings = room.settings ?? DEFAULT_SETTINGS;
  const primaryStart = getGame(game).resources.find((r) => r.primary)?.start ?? 20;
  const lifeDefault = typeof primaryStart === 'function' ? primaryStart(room.format ?? '') : primaryStart;
  const handDefault = getGame(game).deck.startingHand;
  // The numeric rule fields buffer locally and commit on blur: patching per
  // keystroke races the server echo (typing "25" could land as "2") and
  // broadcasts a full room state per key.
  const [lifeDraft, setLifeDraft] = useState<string | null>(null);
  const [handDraft, setHandDraft] = useState<string | null>(null);
  const patchSettings = (change: Partial<GameSettings>) =>
    send({ type: 'room.settings', settings: { ...settings, ...change } });
  const seatedFirstOptions = room.players
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({ value: `seat:${p.seat}`, label: `${p.username} · ${t('preSeat')} ${p.seat + 1}` }));
  const firstValue =
    settings.firstPlayer === 'seat' && settings.firstSeat != null
      ? `seat:${settings.firstSeat}`
      : settings.firstPlayer;
  const onFirstChange = (value: string) => {
    if (value === 'auto' || value === 'random') patchSettings({ firstPlayer: value, firstSeat: null });
    else patchSettings({ firstPlayer: 'seat', firstSeat: Number(value.split(':')[1]) });
  };
  const canEditSettings = isHost && !spectating;
  const firstLabel =
    settings.firstPlayer === 'random'
      ? t('setFirstRandom')
      : settings.firstPlayer === 'seat' && settings.firstSeat != null
        ? seatedFirstOptions.find((o) => o.value === `seat:${settings.firstSeat}`)?.label ?? t('setFirstAuto')
        : t('setFirstAuto');
  const skipDrawLabel =
    settings.skipFirstDraw == null ? t('setDefault') : settings.skipFirstDraw ? t('setOn') : t('setOff');
  const summary: { label: string; value: string }[] = [
    ...(cyber ? [] : [{ label: t('setStartLife'), value: String(settings.startingLife ?? lifeDefault) }]),
    { label: t('setStartHand'), value: String(settings.startingHand ?? handDefault) },
    // Yu-Gi-Oh has no mulligans — the rows would only invite confusion.
    ...(yugioh
      ? []
      : [
          {
            label: t('setMullRule'),
            value: settings.mulliganRule === 'vancouver' ? t('setMullVancouver') : t('setMullLondon'),
          },
          {
            label: t('setFreeMulls'),
            value: settings.unlimitedMulligans
              ? t('setMullUnlimited')
              : settings.freeMulligans == null
                ? t('setDefault')
                : String(settings.freeMulligans),
          },
        ]),
    { label: t('setFirstPlayer'), value: firstLabel },
    { label: t('setSkipDraw'), value: skipDrawLabel },
    ...(game === 'mtg'
      ? [{ label: t('setEnforced'), value: settings.enforced ? t('setOn') : t('setOff') }]
      : []),
    ...(settings.quickplay ? [{ label: t('setQuickplay'), value: t('setOn') }] : []),
  ];

  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const leaveRoom = useGame((state) => state.leave);

  // Leaving the lobby is leaving the table: the store's own action, so
  // joinedRoomId clears and the app routes back out.
  const leaveTable = () => {
    leaveRoom();
  };

  // Closing is the host's hammer for a table that can never start. The
  // server pushes room.closed to everyone, which routes every seat out.
  const closeTable = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await closeRoom(room.roomId);
    } catch {
      // Already gone (or the socket beat us to it): leaving still gets the
      // player out of a table they cannot use.
      leaveRoom();
    } finally {
      setClosing(false);
    }
  };

  const offline = room.players.some((player) => player.online === false);
  const missingDeck = room.players.some((player) => !player.deckName);
  const waitingReady = room.players.some((player) => !player.ready);
  const canStart = room.players.length > 0 && !offline && !missingDeck && !waitingReady;

  // The launch bar owns the lobby's bottom edge, and its height changes when it
  // wraps (88px in one row, 213px in two). Floating chrome — the pack dock —
  // has to clear whatever it currently is, so publish the measured height
  // rather than let anyone guess at a breakpoint.
  const launchRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const bar = launchRef.current;
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--pc-launch-h', `${Math.round(bar.getBoundingClientRect().height)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--pc-launch-h');
    };
  }, []);
  const status = offline
    ? t('preWaitingOffline')
    : missingDeck
      ? t('preWaitingDecks')
      : waitingReady
        ? t('preWaitingReady')
        : t('preAllReady');

  return (
    <section className="pregameLobby" aria-labelledby="pregame-title">
      <header className="pregameHero">
        <div className="pregameHeading">
          <span className="pregameKicker">
            <GameTag game={room.game} />
            {formatFor(room.format).name}
          </span>
          <h1 className="pregameTitle" id="pregame-title">{t('preLobbyTitle')}</h1>
        </div>
        <span className="pregameHeroMeta">
          <Text as="span" size={Size.Small} tone={TextTone.Muted}>
            {room.players.length} / {room.seats} {t('playSeats').toLowerCase()}
          </Text>
          <Button size="sm" variant="soft" onClick={onShare}>
            <Link2 size={15} /> {t('tblShare')} <Kbd>{room.code}</Kbd>
          </Button>
        </span>
      </header>

      {/* ---- which deck, at the top: it is the first decision you make here,
           and it was previously buried in the floor bar under the stage ---- */}
      {me && !spectating ? (
        <div
          className="pregameLaunchSetup"
          data-has-art={Boolean(selectedArt) || undefined}
          style={selectedArt ? { ['--pregame-deck-art' as string]: `url("${selectedArt}")` } : undefined}
        >
          <label className="pregameDeckLabel" htmlFor="pregame-deck">
            {quickplay ? t('preQuickDeck') : t('playPickDeck')}
          </label>
          {deckLocked ? (
            // A locked draft table plays what it drafted - that beats
            // quickplay, which is a way of GETTING a deck, not of overriding
            // one the table already dealt you through the draft.
            <Text className="pregameDeckPicker" size={Size.Small} tone={TextTone.Muted}>
              {me.deckName ?? t('dfLockOn')}
            </Text>
          ) : quickplay ? (
            // Quickplay deals the deck; the only control is the reroll. The
            // name is read-only text rather than a disabled Select, because
            // there is no list to open - the pool is the server's.
            <div className="pregameQuickDeck">
              <Text as="span" size={Size.Small} weight="semibold" className="pregameQuickName">
                {me.deckName ?? t('preQuickDealing')}
              </Text>
              <Button
                variant="soft"
                disabled={rollsLeft <= 0 || !me.deckId}
                onClick={() => send({ type: 'room.deck.random' })}
              >
                <Shuffle size={15} />
                {rollsLeft > 0
                  ? `${t('preQuickReroll')} · ${rollsLeft}`
                  : t('preQuickNoRolls')}
              </Button>
            </div>
          ) : gameDecks.length > 0 ? (
            // fullWidth, and it matters: the trigger is an inline-flex box that
            // sizes to its longest deck name (measured 333px), so in the
            // landscape column it walked straight out of a bar that clips.
            // Filling the picker instead hands the truncation to the kit.
            <Select
              className="pregameDeckPicker"
              fullWidth
              id="pregame-deck"
              value={me.deckId ?? ''}
              onValueChange={(deckId) => send({ type: 'room.deck.set', deckId })}
              options={gameDecks.map((deck) => ({ value: deck.id, label: deck.name }))}
              placeholder={t('playPickDeck')}
              aria-label={t('playPickDeck')}
            />
          ) : (
            <Button className="pregameDeckPicker" variant="soft" onClick={() => { window.location.hash = '/decks'; }}>
              <PlayingCardDeck size={15} /> {t('preBuildDeck')}
            </Button>
          )}
          <Button
            className="pregameReadyButton"
            variant={me.ready ? 'soft' : 'solid'}
            disabled={!me.deckId}
            onClick={() => send({ type: 'room.ready', ready: !me.ready })}
          >
            {me.ready ? <Circle size={14} /> : <Check size={16} />}
            {me.ready ? t('preUnready') : t('preReadyUp')}
          </Button>
        </div>
      ) : (
        // A spectator has nothing to set up, and the stage already says they
        // are watching - a second copy of the line here is just noise.
        null
      )}

      {/* ---- the versus stage: me, the verdict, the far side ---- */}
      <div className="pregameStage">
        <div className="pregameStageSide">
          {me && !spectating ? (
            <StageTile room={room} player={me} you />
          ) : (
            <div className="pregameStageWatch">
              <Eye size={22} />
              <span>{t('preWatchingSetup')}</span>
            </div>
          )}
        </div>

        <div className="pregameVs">
          <span className="pregameVsMark" aria-hidden>{t('preVs')}</span>
          <span className="pregameVsStatus" data-ready={canStart || undefined}>
            {canStart ? <Check size={15} /> : <Circle size={12} />}
            {status}
          </span>
        </div>

        <div className="pregameStageSide" data-them="">
          {opponents.length === 0 ? (
            <button type="button" className="pregameStageEmpty" onClick={onShare}>
              <UserPlus size={22} />
              <span>{t('preNobodyYet')}</span>
              <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                {t('preInviteLink')}
              </Text>
            </button>
          ) : opponents.length === 1 && opponents[0] ? (
            <StageTile room={room} player={opponents[0]} />
          ) : (
            // A pod does not fit as portraits: it reads as a count, a stack of
            // faces, and how much of it is still getting ready. The strip below
            // is where individual opponents get looked at.
            <div className="pregameStagePod">
              <span className="pregamePodFaces" aria-hidden>
                {opponents.slice(0, 4).map((player) => (
                  <Avatar key={player.userId} name={player.username} size="md" />
                ))}
              </span>
              <span className="pregamePodCount">
                <Users size={16} /> {opponents.length} {t('preOpponents').toLowerCase()}
              </span>
              <span className="pregamePodReady" data-ready={opponentsReady === opponents.length || undefined}>
                {opponentsReady} / {opponents.length} {t('preReadyCount')}
              </span>
            </div>
          )}
        </div>
      </div>
      {/* The table rules, in the open. They used to sit behind a Settings
          popover on the versus stage - one control, one click, and easy to
          never notice - so a table would start under mulligan and
          first-player rules nobody at it had read. They are their own row
          now, under the stage and above the roster: the host edits in
          place, everyone else reads the same panel. */}
      <section className="pregameRules" aria-label={t('preSettings')}>
          <header className="pregameSettingsHead">
            <Settings2 size={15} />
            <h2 className="pregameSettingsTitle">{t('preSettings')}</h2>
            {!canEditSettings && (
              <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                <Crown size={11} /> {t('preSettingsHostOnly')}
              </Text>
            )}
          </header>

          {canEditSettings ? (
            <div className="pregameSettingsGrid">
              {!cyber && (
                <label className="pregameSetting">
                  <span className="pregameSettingLabel">{t('setStartLife')}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={lifeDraft ?? (settings.startingLife == null ? '' : String(settings.startingLife))}
                    placeholder={String(lifeDefault)}
                    onChange={(event) => setLifeDraft(event.target.value)}
                    onBlur={() => {
                      if (lifeDraft == null) return;
                      patchSettings({ startingLife: lifeDraft === '' ? null : Number(lifeDraft) });
                      setLifeDraft(null);
                    }}
                  />
                </label>
              )}
              <label className="pregameSetting">
                <span className="pregameSettingLabel">{t('setStartHand')}</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={handDraft ?? (settings.startingHand == null ? '' : String(settings.startingHand))}
                  placeholder={String(handDefault)}
                  onChange={(event) => setHandDraft(event.target.value)}
                  onBlur={() => {
                    if (handDraft == null) return;
                    patchSettings({ startingHand: handDraft === '' ? null : Number(handDraft) });
                    setHandDraft(null);
                  }}
                />
              </label>
              {!yugioh && (
                <label className="pregameSetting">
                  <span className="pregameSettingLabel">{t('setMullRule')}</span>
                  <SegmentedControl
                    fullWidth
                    value={settings.mulliganRule}
                    onValueChange={(value) =>
                      patchSettings({ mulliganRule: value as GameSettings['mulliganRule'] })
                    }
                    options={[
                      { value: 'london', label: t('setMullLondon') },
                      { value: 'vancouver', label: t('setMullVancouver') },
                    ]}
                  />
                </label>
              )}
              {!yugioh && (
                <label className="pregameSetting">
                  <span className="pregameSettingLabel">{t('setFreeMulls')}</span>
                  <Select
                    fullWidth
                    value={
                      settings.unlimitedMulligans
                        ? 'unlimited'
                        : settings.freeMulligans == null
                          ? 'default'
                          : String(settings.freeMulligans)
                    }
                    onValueChange={(value) =>
                      patchSettings(
                        value === 'unlimited'
                          ? { unlimitedMulligans: true, freeMulligans: null }
                          : {
                              unlimitedMulligans: false,
                              freeMulligans: value === 'default' ? null : Number(value),
                            },
                      )
                    }
                    options={[
                      { value: 'default', label: t('setDefault') },
                      { value: '0', label: '0' },
                      { value: '1', label: '1' },
                      { value: '2', label: '2' },
                      { value: '3', label: '3' },
                      { value: 'unlimited', label: t('setMullUnlimited') },
                    ]}
                  />
                </label>
              )}
              <label className="pregameSetting">
                <span className="pregameSettingLabel">{t('setFirstPlayer')}</span>
                <Select
                  fullWidth
                  value={firstValue}
                  onValueChange={onFirstChange}
                  options={[
                    { value: 'auto', label: t('setFirstAuto') },
                    { value: 'random', label: t('setFirstRandom') },
                    ...seatedFirstOptions,
                  ]}
                />
              </label>
              <label className="pregameSetting">
                <span className="pregameSettingLabel">{t('setSkipDraw')}</span>
                <Select
                  fullWidth
                  value={settings.skipFirstDraw == null ? 'default' : settings.skipFirstDraw ? 'on' : 'off'}
                  onValueChange={(value) =>
                    patchSettings({ skipFirstDraw: value === 'default' ? null : value === 'on' })
                  }
                  options={[
                    { value: 'default', label: t('setDefault') },
                    { value: 'on', label: t('setOn') },
                    { value: 'off', label: t('setOff') },
                  ]}
                />
              </label>
              {/* Last on purpose: the full-width row would otherwise split the
                  compact fields into extra rows and grow the panel. */}
              {game === 'mtg' && (
                <label className="pregameSetting pregameSettingWide">
                  <span className="pregameSettingLabel">{t('setEnforced')}</span>
                  <div className="pregameEnforcedRow">
                    <Switch
                      checked={Boolean(settings.enforced)}
                      onCheckedChange={(on) => patchSettings({ enforced: on })}
                      aria-label={t('setEnforced')}
                    />
                    <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                      {t('setEnforcedHint')}
                    </Text>
                  </div>
                </label>
              )}
              {/* Quickplay sits beside enforcement because it is the other
                  switch that changes what KIND of table this is rather than
                  tuning one. Gated to the games that HAVE a deck pool: the
                  server deals from bot::decks_for, which only knows Magic and
                  Yu-Gi-Oh, and refuses anything else - so offering the switch
                  at a Cyberpunk table would be a toggle that does nothing. */}
              {(game === 'mtg' || game === 'yugioh') && (
              <label className="pregameSetting pregameSettingWide">
                <span className="pregameSettingLabel">{t('setQuickplay')}</span>
                <div className="pregameEnforcedRow">
                  <Switch
                    checked={Boolean(settings.quickplay)}
                    onCheckedChange={(on) => patchSettings({ quickplay: on })}
                    aria-label={t('setQuickplay')}
                  />
                  <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                    {t('setQuickplayHint')}
                  </Text>
                </div>
              </label>
              )}
            </div>
          ) : (
            <div className="pregameSettingsSummary">
              {summary.map((item) => (
                <Pill key={item.label} size="sm" variant="soft">
                  {item.label}: <strong>{item.value}</strong>
                </Pill>
              ))}
            </div>
          )}
      </section>

      {/* ---- the roster strip: one chip per seat, detail on click ---- */}
      <ul className="pregameStrip" aria-label={t('playSeats')}>
        {seats.map((player, seat) =>
          player ? (
            <li key={player.userId}>
              <Popover
                placement="top"
                aria-label={t('preScouting')}
                className="pregameScoutPanel"
                trigger={
                  <button
                    type="button"
                    className="pregameChip"
                    data-ready={player.ready || undefined}
                    data-offline={player.online === false || undefined}
                    data-mine={player.userId === me?.userId || undefined}
                  >
                    <Avatar name={player.username} size="sm" />
                    <span className="pregameChipBody">
                      <span className="pregameChipName">
                        {player.username}
                        {player.userId === room.hostUserId && <Crown size={11} aria-label={t('tblHost')} />}
                        {player.isBot && <Bot size={11} aria-label={t('preBotBadge')} />}
                      </span>
                      <span className="pregameChipDeck" data-empty={!player.deckName || undefined}>
                        {player.deckMeta?.colors && player.deckMeta.colors.length > 0 && (
                          <span className="pregameDeckPips" aria-hidden>
                            {player.deckMeta.colors.map((color) => (
                              <i key={color} data-color={color} />
                            ))}
                          </span>
                        )}
                        {player.deckName || t('preNoDeck')}
                      </span>
                    </span>
                    <span className="pregameChipState">
                      {player.online === false ? (
                        <WifiOff size={13} />
                      ) : player.ready ? (
                        <Check size={13} />
                      ) : (
                        <StatusDot size="sm" tone="neutral" />
                      )}
                    </span>
                  </button>
                }
              >
                <ScoutCard
                  room={room}
                  player={player}
                  seat={seat}
                  stats={records[player.userId]}
                  isHost={isHost}
                  spectating={spectating}
                />
              </Popover>
            </li>
          ) : isHost && !spectating && (game === 'mtg' || game === 'yugioh') ? (
            // The host's empty seat offers both fills from one control: a friend
            // via the share link, or one of the server's AI opponents.
            <li key={seat}>
              <Menu
                aria-label={t('preFillSeat')}
                placement="top-start"
                trigger={
                  <button type="button" className="pregameChip pregameChipEmpty">
                    <UserPlus size={16} />
                    <span className="pregameChipBody">
                      <span className="pregameChipName">{t('preOpenSeat')}</span>
                      <span className="pregameChipDeck">{t('preSeat')} {seat + 1}</span>
                    </span>
                  </button>
                }
              >
                <MenuItem icon={<Link2 size={14} />} onSelect={onShare}>
                  {t('preInviteLink')}
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={<Bot size={14} />} onSelect={() => send({ type: 'bot.add', style: 'casual' })}>
                  {t('preBotStyleCasual')}
                </MenuItem>
                <MenuItem icon={<Flame size={14} />} onSelect={() => send({ type: 'bot.add', style: 'aggro' })}>
                  {t('preBotStyleAggro')}
                </MenuItem>
                <MenuItem
                  icon={<Shield size={14} />}
                  onSelect={() => send({ type: 'bot.add', style: 'defensive' })}
                >
                  {t('preBotStyleDefensive')}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={<Circle size={14} />}
                  onSelect={() => send({ type: 'bot.add', style: 'casual', difficulty: 'easy' })}
                >
                  {t('preBotEasy')}
                </MenuItem>
                <MenuItem
                  icon={<Swords size={14} />}
                  onSelect={() => send({ type: 'bot.add', style: 'aggro', difficulty: 'hard' })}
                >
                  {t('preBotHard')}
                </MenuItem>
              </Menu>
            </li>
          ) : (
            <li key={seat}>
              <button type="button" className="pregameChip pregameChipEmpty" onClick={onShare}>
                <UserPlus size={16} />
                <span className="pregameChipBody">
                  <span className="pregameChipName">{t('preOpenSeat')}</span>
                  <span className="pregameChipDeck">{t('preSeat')} {seat + 1}</span>
                </span>
              </button>
            </li>
          ),
        )}
      </ul>

      {/* ---- the floor: go ---- */}
      <footer ref={launchRef} className="pregameLaunch" data-ready={canStart || undefined}>
        <div className="pregameLaunchGo">
          {/* Cancelling is as much a lobby action as starting: leaving is
              always here, and the host can close the table outright when it
              can never start. Both live beside Start rather than hidden in
              the table nav. */}
          <Button variant="ghost" onClick={() => setConfirmLeave(true)}>
            <LogOut size={15} /> {isHost ? t('preLeaveHost') : t('preLeave')}
          </Button>
          {isHost && (
            <Button variant="ghost" onClick={() => setConfirmClose(true)}>
              <Trash2 size={15} /> {t('preCloseTable')}
            </Button>
          )}
          {isHost && spectating && room.players.length >= 2 && room.players.every((p) => p.isBot) ? (
            <Button size="lg" disabled={!canStart} onClick={start}>
              <Play size={16} /> {t('tblStart')}
            </Button>
          ) : isHost && !spectating ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  send({ type: 'room.leave' });
                  window.setTimeout(() => send({ type: 'room.spectate', roomId: room.roomId }), 250);
                }}
              >
                <Eye size={15} /> {t('preWatchOnly')}
              </Button>
              <Button size="lg" disabled={!canStart} onClick={start}>
                <Play size={16} /> {t('tblStart')}
              </Button>
            </>
          ) : (
            <Text as="span" size={Size.Small} tone={TextTone.Muted}>
              <Crown size={13} /> {t('preHostStarts')}
            </Text>
          )}
        </div>

        {/* The table nav lands here (portalled by SidePanel): part of the
            launch bar's flow, so it takes its own corner instead of covering
            the roster or the start button. */}
        <div className="pregameNavDock" id={LOBBY_NAV_DOCK_ID} />
      </footer>

      {/* Chat is not the lobby's to render: the table's nav owns the button and
          the slide-over, in the lobby and mid-match alike. The nav itself is
          portalled into the slot below (TablePage's SidePanel), so in the lobby
          it sits in the page's own bottom corner instead of floating over it. */}

      <AlertDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title={t('preLeaveTitle')}
        description={t('preLeaveBody')}
        actionLabel={t('preLeave')}
        cancelLabel={t('preStay')}
        dismissible
        onAction={() => {
          setConfirmLeave(false);
          leaveTable();
        }}
      />
      <AlertDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title={t('preCloseTitle')}
        description={t('preCloseBody')}
        actionLabel={t('preCloseTable')}
        cancelLabel={t('preStay')}
        tone="danger"
        dismissible
        actionLoading={closing}
        onAction={() => {
          setConfirmClose(false);
          void closeTable();
        }}
      />

      {room.spectators.length > 0 && (
        <div className="pregameSpectators">
          <Eye size={14} />
          <span>{t('tblSpectators')}</span>
          {room.spectators.map((spectator) => (
            <span key={spectator.userId}>{spectator.username}</span>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * A seat as a portrait on the versus stage: that player's playmat as the felt,
 * their deck's cover card standing on it, and the three facts the stage is
 * actually asking about - who, what deck, are they ready.
 */
function StageTile({ room, player, you }: { room: RoomState; player: TablePlayer; you?: boolean }) {
  const t = useT();
  return (
    <article
      className="pregameStageTile"
      data-you={you || undefined}
      data-ready={player.ready || undefined}
      data-offline={player.online === false || undefined}
    >
      <div
        className="pregameArt"
        data-empty={!player.deckMeta?.cover || undefined}
        style={
          player.playmat
            ? ({ ['--pc-seat-mat' as string]: playmatBackground(player.playmat) } as CSSProperties)
            : undefined
        }
      >
        {player.deckMeta?.cover && (
          // Sized by the art band's own grid track rather than a number here,
          // so a landscape phone can print it at a thumbnail's width without a
          // second component or a viewport hook (table.css, .pregameArt).
          <GameCard
            name={player.deckName || ''}
            imageUrl={resolveCardImage(room.game, player.deckMeta.cover)}
            fluid
            foil
            tilt={you ? -6 : 6}
          />
        )}
      </div>
      <div className="pregameStageIdentity">
        <Avatar name={player.username} size="md" />
        <span className="pregameStageName">
          <Text as="span" weight="semibold">{player.username}</Text>
          <span className="pregameBadges">
            {you && <span className="playerYou">{t('tblYou')}</span>}
            {player.userId === room.hostUserId && (
              <Pill size="sm" variant="soft" icon={<Crown size={11} />}>{t('tblHost')}</Pill>
            )}
            {player.isBot && (
              <Pill size="sm" variant="soft" icon={<Bot size={11} />}>{t('preBotBadge')}</Pill>
            )}
          </span>
        </span>
      </div>
      <span className="pregameDeck" data-empty={!player.deckName || undefined}>
        <PlayingCardDeck size={14} /> {player.deckName || t('preNoDeck')}
      </span>
      <span className="pregameReady" data-ready={player.ready || undefined}>
        {player.online === false ? (
          <><WifiOff size={14} /> {t('preOffline')}</>
        ) : player.ready ? (
          <><Check size={14} /> {t('preReady')}</>
        ) : (
          <><Circle size={12} /> {t('preNotReady')}</>
        )}
      </span>
    </article>
  );
}

/**
 * Everything worth knowing about one seat, behind that seat's chip: the
 * player's all-time record and pace, and what their deck is made of. Aggregates
 * only - the list itself is never public - and only once its owner has pushed
 * them.
 */
function ScoutCard({
  room,
  player,
  seat,
  stats,
  isHost,
  spectating,
}: {
  room: RoomState;
  player: TablePlayer;
  seat: number;
  stats?: UserStats;
  isHost: boolean;
  spectating: boolean;
}) {
  const t = useT();
  const rank = rankFor(stats?.played ?? 0);
  const rate = stats ? winRate(stats) : null;
  return (
    <div className="pregameScout">
      <header className="pregameScoutHead">
        <Avatar name={player.username} size="sm" />
        <span className="pregameScoutWho">
          <Text as="span" size={Size.Small} weight="semibold">{player.username}</Text>
          <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
            {t('preSeat')} {seat + 1}
          </Text>
        </span>
        <StatusDot size="sm" tone={player.online === false ? 'neutral' : 'success'} />
        {player.isBot && isHost && !spectating && (
          <Tooltip content={t('preRemoveBot')}>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={t('preRemoveBot')}
              onClick={() => send({ type: 'bot.remove', seat: player.seat })}
            >
              <X size={14} />
            </IconButton>
          </Tooltip>
        )}
        {/* A human seat the host can clear: the escape hatch for a lobby that
            can never start because someone went offline, never picked a deck,
            or never readied. They keep their socket and can sit back down. */}
        {!player.isBot && isHost && !spectating && player.userId !== room.hostUserId && (
          <Tooltip content={t('preRemovePlayer')}>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={t('preRemovePlayer')}
              onClick={() => send({ type: 'room.kick', seat: player.seat })}
            >
              <X size={14} />
            </IconButton>
          </Tooltip>
        )}
      </header>

      {player.isBot ? (
        <div className="pregameStats">
          <span className="pregameStat pregameRank">
            <Bot size={11} /> {t('preBotTagline')}
          </span>
        </div>
      ) : (
        <div className="pregameStats">
          <span className="pregameStat pregameRank" title={`${t('hmLevel')} ${rank.level}`}>
            <RankEmblem rank={rank} size={13} /> {rank.title} · {rank.level}
          </span>
          <span className="pregameStat pregameRecord">
            {stats && stats.played > 0
              ? `${stats.wins}W · ${stats.losses}L${rate != null ? ` · ${rate}%` : ''}`
              : t('preNoGames')}
          </span>
          {stats != null && stats.endorsements > 0 && (
            <span className="pregameStat pregameEndorse" title={t('preEndorsements')}>
              <ThumbsUp size={11} /> {stats.endorsements}
            </span>
          )}
          {/* How salty this seat's DECKS have played, averaged. Held back until
              more than one opponent has rated something: in a duel a single
              rating names its rater. Which deck earned it stays on that
              player's own profile. */}
          {stats != null && stats.saltCount > 1 && (
            <span className="pregameStat pregameSalt" title={t('preSaltHint')}>
              <SaltPile size={11} /> {stats.salt.toFixed(1)}
            </span>
          )}
          {/* How long this player usually takes on a turn - the one number
              everyone at a four-player table wants. */}
          {stats != null && stats.avgTurnMs > 0 && (
            <span className="pregameStat" title={t('preAvgTurn')}>
              <Timer size={11} /> {fmtTurn(stats.avgTurnMs)}
            </span>
          )}
        </div>
      )}

      <span className="pregameDeck" data-empty={!player.deckName || undefined}>
        <PlayingCardDeck size={14} /> {player.deckName || t('preNoDeck')}
      </span>

      {player.deckMeta && (
        <div className="pregameDeckMeta">
          {player.deckMeta.colors && player.deckMeta.colors.length > 0 && (
            <span className="pregameDeckPips" aria-hidden>
              {player.deckMeta.colors.map((color) => (
                <i key={color} data-color={color} />
              ))}
            </span>
          )}
          <span className="pregameStat" title={t('preDeckSize')}>
            <PlayingCardDeck size={11} /> {player.deckMeta.size}
          </span>
          {player.deckMeta.avgMv != null && player.deckMeta.avgMv > 0 && (
            <span className="pregameStat" title={t('preAvgMv')}>
              <Gauge size={11} /> {player.deckMeta.avgMv}
            </span>
          )}
          {player.deckMeta.creatures != null && player.deckMeta.creatures > 0 && (
            <span className="pregameStat" title={t('preCreatures')}>
              <Swords size={11} /> {player.deckMeta.creatures}
            </span>
          )}
          {player.deckMeta.lands != null && player.deckMeta.lands > 0 && (
            <span className="pregameStat" title={t('preLands')}>
              <Mountain size={11} /> {player.deckMeta.lands}
            </span>
          )}
          {player.deckMeta.spells != null && player.deckMeta.spells > 0 && (
            <span className="pregameStat" title={t('preSpells')}>
              <Sparkles size={11} /> {player.deckMeta.spells}
            </span>
          )}
          {player.deckMeta.ram != null && (
            <span className="pregameStat" title={t('preRam')}>
              <Cpu size={11} /> {player.deckMeta.ram}
            </span>
          )}
          {player.deckMeta.avgCost != null && player.deckMeta.avgCost > 0 && (
            <span className="pregameStat" title={t('preAvgCost')}>
              <Gauge size={11} /> {player.deckMeta.avgCost}
            </span>
          )}
        </div>
      )}

      {player.deckMeta?.cover && (
        <div
          className="pregameArt pregameScoutArt"
          style={
            player.playmat
              ? ({ ['--pc-seat-mat' as string]: playmatBackground(player.playmat) } as CSSProperties)
              : undefined
          }
        >
          <GameCard
            name={player.deckName || ''}
            imageUrl={resolveCardImage(room.game, player.deckMeta.cover)}
            width={84}
            foil
            tilt={4}
          />
        </div>
      )}
    </div>
  );
}
