import { useCallback, useEffect, useState } from 'react';
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
  StatusDot,
  Switch,
  Text,
  TextTone,
  Tooltip,
  useLocale,
  useToast,
} from '@glacier/react';
import { Crown, Flag, Layers, Play, Swords, Ticket } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';
import * as api from '../net/api.ts';
import * as ws from '../net/ws.ts';
import type { MatchRow, MyRoom } from '../net/types.ts';
import { useVisibleGames } from '../hooks/useVisibleGames.ts';
import { FORMATS } from '../data/formats.ts';
import { GameTag, GameBadge } from '../components/GameTag.tsx';
import './play.css';

/** "1h 02m" / "18m 30s" / "42s" from milliseconds. */
function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

/**
 * The lobby: your saved tables (rooms survive server restarts now), create a
 * table, join by code, and answer invites. Joining always asks which deck to
 * bring - the fanned-out game itself lives in TablePage. Resuming a saved
 * table sends no deckId: the seat already holds the deck.
 */

/** Coarse "5 minutes ago" style label from an ISO timestamp. */
function relativeUpdatedAt(when: string | number, locale: string): string {
  const then = typeof when === 'number' ? when : new Date(when).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(seconds, 'second');
}

export function PlayPage() {
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

  // Only decks for the chosen game are eligible; if the current pick belongs to
  // another game (or none), fall back to the first deck of this game.
  const gameDecks = decks.filter((deck) => (deck.game || 'mtg') === game);
  const chosenDeck = (deckId && gameDecks.some((deck) => deck.id === deckId) ? deckId : gameDecks[0]?.id) || '';

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

  const create = async () => {
    setBusy(true);
    try {
      const room = await api.createRoom(
        tableName || `${t('playTitle')} - ${new Date().toLocaleTimeString()}`,
        Number(seats),
        persistent,
        // The format preset drives starting life + commander machinery server-side.
        { game, ...(game === 'mtg' ? { format } : {}) },
      );
      join(room.roomId, chosenDeck || undefined);
      void refreshRooms();
    } catch {
      toast({ tone: 'danger', message: t('obOffline') });
    } finally {
      setBusy(false);
    }
  };

  const joinByCode = async () => {
    setBusy(true);
    try {
      const room = await api.getRoomByCode(code.trim().toUpperCase());
      join(room.roomId, chosenDeck || undefined);
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

  return (
    <div className="page playPage">
      <Heading level={1}>{t('playTitle')}</Heading>
      <Text size={Size.Large} tone={TextTone.Muted} className="lede">
        {t('playLede')}
      </Text>

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
                  label: `${f.name} · ${f.startingLife} ${t('tblLife').toLowerCase()}`,
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
          <DeckPicker value={chosenDeck} onChange={setDeckId} game={game} />
          <Button onClick={create} loading={busy} disabled={gameDecks.length === 0}>
            {t('playCreate')}
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

      <section className="myTables">
        <Heading level={2}>{t('plYourTables')}</Heading>
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
                      {relativeUpdatedAt(room.updatedAt, locale)}
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
          <div className="matchList">
            {history.map((match, index) => {
              const others = match.players
                .map((p) => p.username)
                .filter((n) => n !== identity?.username);
              return (
                <div key={`${match.playedAt}-${index}`} className="matchRow">
                  <div className="matchRowMain">
                    <span className="matchName">
                      <GameTag game={match.game} showName={false} /> {match.name || t('playTitle')}
                    </span>
                    <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="matchWith">
                      {others.length > 0 ? `${t('plWith')} ${others.join(', ')}` : t('plSolo')}
                    </Text>
                    {match.matchId && (
                      <span className="matchStats">
                        {match.won != null && (
                          <span className="matchStat" data-win={match.won || undefined}>
                            {match.won ? t('pmWinAbbr') : t('pmLossAbbr')}
                          </span>
                        )}
                        {match.winnerUsername && (
                          <span className="matchStat">
                            <Crown size={11} /> {match.winnerUsername}
                          </span>
                        )}
                        {match.turns != null && (
                          <span className="matchStat">
                            {match.turns} {t('pmTurnsWord')}
                          </span>
                        )}
                        {match.durationMs != null && <span className="matchStat">{fmtDuration(match.durationMs)}</span>}
                        {match.cardsPlayed != null && (
                          <span className="matchStat">
                            <Layers size={11} /> {match.cardsPlayed}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="matchRowSide">
                    <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                      {relativeUpdatedAt(match.playedAt, locale)}
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
