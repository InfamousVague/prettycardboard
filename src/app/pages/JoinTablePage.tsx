import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Avatar,
  Button,
  Card,
  Heading,
  Kbd,
  Pill,
  Select,
  Size,
  Text,
  TextTone,
  useToast,
} from '@glacier/react';
import { Eye, LogIn, Users } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';
import { useUi } from '../state/uiStore.ts';
import * as api from '../net/api.ts';
import type { RoomInfo } from '../net/types.ts';
import { clearPendingJoin } from '../data/pendingJoin.ts';
import './play.css';

/**
 * The landing screen for a shared table link (#/join/CODE), shown once the
 * visitor is authenticated. It resolves the code to the live table, previews
 * who's already seated, and lets the player pick a deck and take a seat (or
 * spectate). Joining hands off to the game store, and TablePage takes over.
 */
export function JoinTablePage({ code }: { code: string }) {
  const t = useT();
  const { toast } = useToast();
  const decks = useApp((state) => state.decks);
  const join = useGame((state) => state.join);
  const spectate = useGame((state) => state.spectate);
  const setPendingJoin = useUi((state) => state.setPendingJoin);

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound'>('loading');
  const [deckId, setDeckId] = useState('');
  const [busy, setBusy] = useState(false);

  const chosenDeck = deckId || decks[0]?.id || '';

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    api
      .getRoomByCode(code)
      .then((info) => {
        if (cancelled) return;
        setRoom(info);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('notfound');
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  // Consuming the invite: drop the pending code and normalise the URL so a
  // refresh or a later "leave table" never bounces back through this screen.
  const consume = () => {
    clearPendingJoin();
    setPendingJoin(null);
    window.location.hash = '/play';
  };

  const dismiss = () => {
    consume();
    toast({ tone: 'neutral', message: t('joinDismissed') });
  };

  const takeSeat = () => {
    if (!room) return;
    setBusy(true);
    join(room.roomId, chosenDeck || undefined);
    consume();
  };

  const watch = () => {
    if (!room) return;
    spectate(room.roomId);
    consume();
  };

  return (
    <div className="page joinPage">
      <motion.div
        className="joinCardWrap"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 150, damping: 20 }}
      >
        <Card elevation={3} className="joinCard">
          <div className="joinCardIcon" aria-hidden>
            <Users size={24} />
          </div>

          {status === 'loading' && (
            <>
              <Heading level={2} align="center" noMargin>
                {t('joinFinding')}
              </Heading>
              <Text align="center" tone={TextTone.Muted}>
                <Kbd>{code}</Kbd>
              </Text>
            </>
          )}

          {status === 'notfound' && (
            <>
              <Heading level={2} align="center" noMargin>
                {t('joinNotFound')}
              </Heading>
              <Text align="center" tone={TextTone.Muted}>
                {t('joinNotFoundBody')}
              </Text>
              <Button onClick={dismiss}>{t('joinBackToPlay')}</Button>
            </>
          )}

          {status === 'ready' && room && (
            <>
              <Text align="center" size={Size.Small} tone={TextTone.Subtle}>
                {t('joinInvited')}
              </Text>
              <Heading level={1} align="center" noMargin>
                {room.name}
              </Heading>
              <div className="joinMeta">
                <Pill size="sm" variant="outline">
                  <Kbd>{code}</Kbd>
                </Pill>
                <Pill size="sm" tone={room.players.length >= room.seats ? 'warning' : 'neutral'}>
                  {room.players.length} / {room.seats} {t('playSeats').toLowerCase()}
                </Pill>
                {room.started && <Pill size="sm" tone="accent">{t('joinInProgress')}</Pill>}
              </div>

              {room.players.length > 0 && (
                <div className="joinPlayers">
                  {room.players.map((player) => (
                    <span key={player.userId} className="joinPlayer">
                      <Avatar name={player.username} size="sm" />
                      <Text as="span" size={Size.Small}>
                        {player.username}
                      </Text>
                    </span>
                  ))}
                </div>
              )}

              <div className="joinDeck control">
                <Text as="span" size={Size.Small} tone={TextTone.Muted}>
                  {t('playPickDeck')}
                </Text>
                <Select
                  value={chosenDeck}
                  onValueChange={setDeckId}
                  options={decks.map((deck) => ({ value: deck.id, label: deck.name }))}
                  placeholder={t('playPickDeck')}
                />
              </div>

              <div className="joinActions">
                <Button
                  onClick={takeSeat}
                  loading={busy}
                  disabled={decks.length === 0 || room.players.length >= room.seats}
                >
                  <LogIn size={16} /> {t('joinTakeSeat')}
                </Button>
                <Button variant="soft" onClick={watch}>
                  <Eye size={16} /> {t('joinSpectate')}
                </Button>
                <Button variant="ghost" onClick={dismiss}>
                  {t('joinNotNow')}
                </Button>
              </div>
              {room.players.length >= room.seats && (
                <Text align="center" size={Size.XSmall} tone={TextTone.Warning}>
                  {t('joinFull')}
                </Text>
              )}
            </>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
