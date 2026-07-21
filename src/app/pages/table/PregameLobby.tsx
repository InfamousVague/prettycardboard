import { Avatar, Button, Kbd, Pill, Select, Size, StatusDot, Text, TextTone } from '@glacier/react';
import { Check, Circle, Crown, Eye, Layers, Link2, Play, UserPlus, WifiOff } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useApp } from '../../state/appStore.ts';
import { useGame } from '../../state/gameStore.ts';
import { send } from '../../net/ws.ts';
import { deckSummaryArt } from '../../data/deckCover.ts';
import { GameTag } from '../../components/GameTag.tsx';
import type { RoomState, TablePlayer } from '../../net/types.ts';

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
            {room.format}
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