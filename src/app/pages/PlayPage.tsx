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
  useLocale,
  useToast,
} from '@glacier/react';
import { Swords, Ticket, X } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';
import * as api from '../net/api.ts';
import * as ws from '../net/ws.ts';
import type { MatchRow, MyRoom } from '../net/types.ts';
import './play.css';

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

  const [tableName, setTableName] = useState('');
  const [seats, setSeats] = useState('4');
  const [persistent, setPersistent] = useState(true);
  const [deckId, setDeckId] = useState<string>('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<MyRoom[] | null>(null);
  const [history, setHistory] = useState<MatchRow[] | null>(null);
  const [confirmClose, setConfirmClose] = useState<MyRoom | null>(null);
  const [closing, setClosing] = useState(false);

  const chosenDeck = deckId || decks[0]?.id || '';

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
                <div className="myTableActions">
                  <Button size="sm" onClick={() => join(room.roomId)}>
                    {t('plResume')}
                  </Button>
                  {room.players[0]?.userId === identity?.userId && (
                    <IconButton
                      variant="ghost"
                      size="sm"
                      aria-label={t('plCloseTable')}
                      onClick={() => setConfirmClose(room)}
                    >
                      <X size={16} />
                    </IconButton>
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
              const humans = match.players.filter((p) => !p.isBot).map((p) => p.username);
              const bots = match.players.filter((p) => p.isBot).map((p) => p.username);
              const others = [...humans.filter((n) => n !== identity?.username), ...bots];
              return (
                <div key={`${match.playedAt}-${index}`} className="matchRow">
                  <div className="matchRowMain">
                    <Text as="span" className="matchName">
                      {match.name || t('playTitle')}
                    </Text>
                    <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="matchWith">
                      {others.length > 0 ? `${t('plWith')} ${others.join(', ')}` : t('plSolo')}
                    </Text>
                  </div>
                  <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                    {relativeUpdatedAt(match.playedAt, locale)}
                  </Text>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="playGrid">
        <Card elevation={2} className="playCard">
          <div className="playCardIcon" aria-hidden>
            <Swords size={22} />
          </div>
          <Heading level={3} noMargin>
            {t('playNewTable')}
          </Heading>
          <div className="control">
            <Text as="span" size={Size.Small} tone={TextTone.Muted}>
              {t('playTableName')}
            </Text>
            <Input value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder="Friday pod" />
          </div>
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
          <DeckPicker value={chosenDeck} onChange={setDeckId} />
          <Button onClick={create} loading={busy} disabled={decks.length === 0}>
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

      <AlertDialog
        open={confirmClose !== null}
        onClose={() => setConfirmClose(null)}
        title={t('plCloseTable')}
        description={confirmClose?.name}
        tone="danger"
        actionLabel={t('plCloseTable')}
        actionLoading={closing}
        onAction={() => void closeTable()}
        cancelLabel={t('dbCancel')}
      />
    </div>
  );
}

function DeckPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const t = useT();
  const decks = useApp((state) => state.decks);
  return (
    <div className="control">
      <Text as="span" size={Size.Small} tone={TextTone.Muted}>
        {t('playPickDeck')}
      </Text>
      <Select
        value={value}
        onValueChange={onChange}
        options={decks.map((deck) => ({ value: deck.id, label: deck.name }))}
        placeholder={t('playPickDeck')}
      />
    </div>
  );
}
