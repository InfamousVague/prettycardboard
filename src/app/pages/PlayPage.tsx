import { useCallback, useEffect, useState } from 'react';
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
  StatusDot,
  Switch,
  Text,
  TextTone,
  useLocale,
  useToast,
} from '@glacier/react';
import { Flag, Swords, Ticket } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';
import * as api from '../net/api.ts';
import * as ws from '../net/ws.ts';
import type { MatchRow, MyRoom } from '../net/types.ts';
import { useVisibleGames } from '../hooks/useVisibleGames.ts';
import { FORMATS } from '../data/formats.ts';
import { GameTag, GameBadge } from '../components/GameTag.tsx';
import { MatchHistory, relativeWhen } from '../components/MatchHistory.tsx';
import './play.css';

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

  const starting = mode === 'new';
  return (
    <div className="page playPage">
      <Heading level={1}>{starting ? t('playTitle') : t('plYourTables')}</Heading>
      <Text size={Size.Large} tone={TextTone.Muted} className="lede">
        {starting ? t('playLede') : t('plTablesLede')}
      </Text>

      {starting && (
      <>
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
