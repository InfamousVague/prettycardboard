import { useEffect, useState, type CSSProperties } from 'react';
import {
  Avatar,
  Button,
  IconButton,
  Input,
  Kbd,
  Menu,
  MenuItem,
  MenuSeparator,
  Pill,
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
  Layers,
  Link2,
  Mountain,
  Play,
  Settings2,
  Shield,
  Sparkles,
  Swords,
  ThumbsUp,
  Timer,
  Trophy,
  UserPlus,
  WifiOff,
  X,
} from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useApp } from '../../state/appStore.ts';
import { useGame } from '../../state/gameStore.ts';
import { send } from '../../net/ws.ts';
import { userStats } from '../../net/api.ts';
import { deckSummaryArt } from '../../data/deckCover.ts';
import { rankFor, winRate } from '../../data/ranks.ts';
import { GameTag } from '../../components/GameTag.tsx';
import { GameCard } from '../../components/GameCard.tsx';
import { SaltPile } from '../../components/SaltPile.tsx';
import { playmatBackground } from '../../data/playmats.ts';
import { getGame, resolveCardImage } from '../../data/games.ts';
import { formatFor } from '../../data/formats.ts';
import { LobbyChat } from './LobbyChat.tsx';
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
  // This table drafted its decks and the host locked them in: no swapping the
  // limited pool for something built at home.
  const deckLocked = Boolean(
    room.draft?.lockDecks && room.draft.seats.some((seat) => seat.userId === me?.userId && seat.built),
  );
  const playersBySeat = new Map(room.players.map((player) => [player.seat, player]));
  const seats = Array.from({ length: room.seats }, (_, seat) => playersBySeat.get(seat));

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
  ];

  const offline = room.players.some((player) => player.online === false);
  const missingDeck = room.players.some((player) => !player.deckName);
  const waitingReady = room.players.some((player) => !player.ready);
  const canStart = room.players.length > 0 && !offline && !missingDeck && !waitingReady;
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
          <Text as="span" size={Size.Small} tone={TextTone.Muted}>
            {room.players.length} / {room.seats} {t('playSeats').toLowerCase()}
          </Text>
        </div>
        <Button variant="soft" onClick={onShare}>
          <Link2 size={16} /> {t('tblShare')} <Kbd>{room.code}</Kbd>
        </Button>
      </header>

      <div className="pregameSeats">
        {seats.map((player, seat) =>
          player ? (
            <article
              key={player.userId}
              className="pregameSeat"
              data-ready={player.ready || undefined}
              data-offline={player.online === false || undefined}
            >
              {/* The seat wears the deck it brought: that player's playmat as
                  the felt, their cover card standing on it. */}
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
                  <GameCard
                    name={player.deckName || ''}
                    imageUrl={resolveCardImage(room.game, player.deckMeta.cover)}
                    width={96}
                    foil
                    tilt={6}
                  />
                )}
                <span className="pregameSeatNumber">{t('preSeat')} {seat + 1}</span>
              </div>
              <div className="pregameIdentity">
                <Avatar name={player.username} size="md" />
                <div className="pregamePlayerName">
                  <Text as="span" size={Size.Small} weight="semibold">
                    {player.username}
                  </Text>
                  <span className="pregameBadges">
                    {player.userId === room.hostUserId && (
                      <Pill size="sm" variant="soft" icon={<Crown size={11} />}>
                        {t('tblHost')}
                      </Pill>
                    )}
                    {player.isBot && (
                      <Pill size="sm" variant="soft" icon={<Bot size={11} />}>
                        {t('preBotBadge')}
                      </Pill>
                    )}
                    {player.userId === me?.userId && <span className="playerYou">{t('tblYou')}</span>}
                  </span>
                </div>
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
              </div>
              {player.isBot ? (
                <div className="pregameStats">
                  <span className="pregameStat pregameRank">
                    <Bot size={11} /> {t('preBotTagline')}
                  </span>
                </div>
              ) : (() => {
                const stats = records[player.userId];
                const rank = rankFor(stats?.played ?? 0);
                const rate = stats ? winRate(stats) : null;
                return (
                  <div className="pregameStats">
                    <span className="pregameStat pregameRank" title={`${t('hmLevel')} ${rank.level}`}>
                      <Trophy size={11} /> {rank.title} · {rank.level}
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
                    {/* How salty this seat's DECKS have played, averaged. Held
                        back until more than one opponent has rated something:
                        in a duel a single rating names its rater. Which deck
                        earned it stays on that player's own profile. */}
                    {stats != null && stats.saltCount > 1 && (
                      <span className="pregameStat pregameSalt" title={t('preSaltHint')}>
                        <SaltPile size={11} /> {stats.salt.toFixed(1)}
                      </span>
                    )}
                    {/* How long this player usually takes on a turn - the one
                        number everyone at a four-player table wants. */}
                    {stats != null && stats.avgTurnMs > 0 && (
                      <span className="pregameStat" title={t('preAvgTurn')}>
                        <Timer size={11} /> {fmtTurn(stats.avgTurnMs)}
                      </span>
                    )}
                  </div>
                );
              })()}
              <span className="pregameDeck" data-empty={!player.deckName || undefined}>
                <Layers size={14} /> {player.deckName || t('preNoDeck')}
              </span>
              {/* What the deck is made of. Aggregates only - the list itself is
                  never public - and only once its owner has pushed them. */}
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
                    <Layers size={11} /> {player.deckMeta.size}
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
          ) : isHost && !spectating && game === 'mtg' ? (
            // The host's empty seat offers both fills: a friend via the share
            // link, or one of the server's AI opponents with a play style.
            <div key={seat} className="pregameSeat pregameSeatEmpty pregameSeatChoices">
              <span className="pregameSeatNumber">{t('preSeat')} {seat + 1}</span>
              <button type="button" className="pregameSeatAction" onClick={onShare}>
                <UserPlus size={18} />
                <span>{t('preOpenSeat')}</span>
              </button>
              <Menu
                aria-label={t('preAddBot')}
                trigger={
                  <button type="button" className="pregameSeatAction">
                    <Bot size={18} />
                    <span>{t('preAddBot')}</span>
                  </button>
                }
              >
                <MenuItem
                  icon={<Bot size={14} />}
                  onSelect={() => send({ type: 'bot.add', style: 'casual' })}
                >
                  {t('preBotStyleCasual')}
                </MenuItem>
                <MenuItem
                  icon={<Flame size={14} />}
                  onSelect={() => send({ type: 'bot.add', style: 'aggro' })}
                >
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
            </div>
          ) : (
            <button key={seat} type="button" className="pregameSeat pregameSeatEmpty" onClick={onShare}>
              <span className="pregameSeatNumber">{t('preSeat')} {seat + 1}</span>
              <UserPlus size={22} />
              <span>{t('preOpenSeat')}</span>
            </button>
          ),
        )}
      </div>

      <section className="pregameSettings" aria-labelledby="pregame-settings-title">
        <header className="pregameSettingsHead">
          <Settings2 size={15} />
          <h2 className="pregameSettingsTitle" id="pregame-settings-title">
            {t('preSettings')}
          </h2>
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
                      : { unlimitedMulligans: false, freeMulligans: value === 'default' ? null : Number(value) },
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
                compact fields into extra rows and grow the card. */}
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

      <div className="pregameControls">
        {me && !spectating ? (
          <div
            className="pregameDeckSetup"
            data-has-art={Boolean(selectedArt) || undefined}
            style={selectedArt ? { ['--pregame-deck-art' as string]: `url("${selectedArt}")` } : undefined}
          >
            <div className="pregameDeckSetupBody">
              <label className="pregameDeckLabel" htmlFor="pregame-deck">{t('playPickDeck')}</label>
              {deckLocked ? (
                // A locked draft table plays what it drafted. The server refuses
                // the swap either way; this just stops the picker from offering
                // a choice that is not one.
                <Text size={Size.Small} tone={TextTone.Muted}>
                  {me.deckName ?? t('dfLockOn')}
                </Text>
              ) : gameDecks.length > 0 ? (
                <Select
                  id="pregame-deck"
                  fullWidth
                  value={me.deckId ?? ''}
                  onValueChange={(deckId) => send({ type: 'room.deck.set', deckId })}
                  options={gameDecks.map((deck) => ({ value: deck.id, label: deck.name }))}
                  placeholder={t('playPickDeck')}
                  aria-label={t('playPickDeck')}
                />
              ) : (
                <Button variant="soft" onClick={() => { window.location.hash = '/decks'; }}>
                  <Layers size={15} /> {t('preBuildDeck')}
                </Button>
              )}
            </div>
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
          <div className="pregameWatching">
            <Eye size={17} /> {t('preWatchingSetup')}
          </div>
        )}

        <div className="pregameLaunch" data-ready={canStart || undefined}>
          <span className="pregameLaunchStatus">
            {canStart ? <Check size={16} /> : <Circle size={13} />}
            {status}
          </span>
          {isHost && spectating && room.players.length >= 2 && room.players.every((p) => p.isBot) ? (
            <Button disabled={!canStart} onClick={start}>
              <Play size={16} /> {t('tblStart')}
            </Button>
          ) : isHost && !spectating ? (
            <span className="pregameHostActions">
              <Button disabled={!canStart} onClick={start}>
                <Play size={16} /> {t('tblStart')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  send({ type: 'room.leave' });
                  window.setTimeout(() => send({ type: 'room.spectate', roomId: room.roomId }), 250);
                }}
              >
                <Eye size={15} /> {t('preWatchOnly')}
              </Button>
            </span>
          ) : (
            <Text as="span" size={Size.Small} tone={TextTone.Muted}>
              <Crown size={13} /> {t('preHostStarts')}
            </Text>
          )}
        </div>
      </div>

      <LobbyChat />

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