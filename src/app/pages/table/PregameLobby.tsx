import { useState } from 'react';
import { Avatar, Button, Input, Kbd, Pill, SegmentedControl, Select, Size, StatusDot, Text, TextTone } from '@glacier/react';
import { Check, Circle, Crown, Eye, Layers, Link2, Play, Settings2, UserPlus, WifiOff } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useApp } from '../../state/appStore.ts';
import { useGame } from '../../state/gameStore.ts';
import { send } from '../../net/ws.ts';
import { deckSummaryArt } from '../../data/deckCover.ts';
import { GameTag } from '../../components/GameTag.tsx';
import { formatFor } from '../../data/formats.ts';
import type { GameSettings, RoomState, TablePlayer } from '../../net/types.ts';

const DEFAULT_SETTINGS: GameSettings = {
  startingLife: null,
  startingHand: null,
  freeMulligans: null,
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
  const playersBySeat = new Map(room.players.map((player) => [player.seat, player]));
  const seats = Array.from({ length: room.seats }, (_, seat) => playersBySeat.get(seat));

  // Pre-game rule settings (host-editable in the lobby; read-only for others).
  const cyber = game === 'cyberpunk';
  const settings = room.settings ?? DEFAULT_SETTINGS;
  const lifeDefault = cyber ? 0 : formatFor(room.format).startingLife;
  const handDefault = cyber ? 6 : 7;
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
    {
      label: t('setMullRule'),
      value: settings.mulliganRule === 'vancouver' ? t('setMullVancouver') : t('setMullLondon'),
    },
    {
      label: t('setFreeMulls'),
      value: settings.freeMulligans == null ? t('setDefault') : String(settings.freeMulligans),
    },
    { label: t('setFirstPlayer'), value: firstLabel },
    { label: t('setSkipDraw'), value: skipDrawLabel },
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
              <span className="pregameSeatNumber">{t('preSeat')} {seat + 1}</span>
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
                    {player.userId === me?.userId && <span className="playerYou">{t('tblYou')}</span>}
                  </span>
                </div>
                <StatusDot size="sm" tone={player.online === false ? 'neutral' : 'success'} />
              </div>
              <span className="pregameDeck" data-empty={!player.deckName || undefined}>
                <Layers size={14} /> {player.deckName || t('preNoDeck')}
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
            <label className="pregameSetting">
              <span className="pregameSettingLabel">{t('setFreeMulls')}</span>
              <Select
                fullWidth
                value={settings.freeMulligans == null ? 'default' : String(settings.freeMulligans)}
                onValueChange={(value) =>
                  patchSettings({ freeMulligans: value === 'default' ? null : Number(value) })
                }
                options={[
                  { value: 'default', label: t('setDefault') },
                  { value: '0', label: '0' },
                  { value: '1', label: '1' },
                  { value: '2', label: '2' },
                  { value: '3', label: '3' },
                ]}
              />
            </label>
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
              {gameDecks.length > 0 ? (
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
          {isHost && !spectating ? (
            <Button disabled={!canStart} onClick={start}>
              <Play size={16} /> {t('tblStart')}
            </Button>
          ) : (
            <Text as="span" size={Size.Small} tone={TextTone.Muted}>
              <Crown size={13} /> {t('preHostStarts')}
            </Text>
          )}
        </div>
      </div>

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