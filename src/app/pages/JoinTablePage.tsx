import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import {
  Avatar,
  Button,
  Heading,
  Kbd,
  Select,
  Size,
  Spinner,
  Text,
  TextTone,
  useToast,
} from '@glacier/react';
import { Eye, Hash, LogIn, Play, Sparkles, Users } from '@glacier/icons';
import { PlayingCardPack } from '../icons/cards.ts';
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
 * visitor is authenticated.
 *
 * It is a MODAL over a dimmed screen rather than a page in the app frame. An
 * invite is an interruption with exactly three answers - sit down, watch, or
 * not now - and rendering it as an ordinary route left the sidebar and the tab
 * bar live behind it, offering a dozen other things to click instead of
 * answering. Portalled to <body> for the same reason PackOpening is: a
 * transformed ancestor becomes the containing block for a fixed element, and
 * inside the route frame the scrim would only dim the content column.
 *
 * Draft tables are the exception the deck picker has to know about: there you
 * arrive with nothing and build a deck out of packs at the table, so asking
 * for a deck up front asks a question the visitor cannot answer yet - and,
 * worse, disabled the seat button for anyone who owns no decks at all.
 */
export function JoinTablePage({ code }: { code: string }) {
  const t = useT();
  const { toast } = useToast();
  const identity = useApp((state) => state.identity);
  const decks = useApp((state) => state.decks);
  const join = useGame((state) => state.join);
  const spectate = useGame((state) => state.spectate);
  const setPendingJoin = useUi((state) => state.setPendingJoin);

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound'>('loading');
  const [deckId, setDeckId] = useState('');
  const [busy, setBusy] = useState(false);

  const chosenDeck = deckId || decks[0]?.id || '';
  const drafting = (room?.format ?? '').toLowerCase() === 'draft';
  // A player who already holds a seat is never blocked: a full table or an
  // empty deck library only matter to someone who has yet to sit down. The
  // server resumes the existing seat on join, so no deck choice is required.
  const seated = room != null && identity != null
    && room.players.some((player) => player.userId === identity.userId);
  const full = room ? !seated && room.players.length >= room.seats : false;
  const needsDeck = !seated && !drafting && decks.length === 0;

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
  const consume = useCallback(() => {
    clearPendingJoin();
    setPendingJoin(null);
    window.location.hash = '/play';
  }, [setPendingJoin]);

  const dismiss = useCallback(() => {
    consume();
    toast({ tone: 'neutral', message: t('joinDismissed') });
  }, [consume, toast, t]);

  const takeSeat = () => {
    if (!room) return;
    setBusy(true);
    join(room.roomId, drafting ? undefined : chosenDeck || undefined);
    consume();
  };

  const watch = () => {
    if (!room) return;
    spectate(room.roomId);
    consume();
  };

  // Escape answers "not now". A modal that holds you until you find the ghost
  // button is a modal people learn to resent.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss]);

  return createPortal(
    <div
      className="joinScrim"
      role="dialog"
      aria-modal="true"
      aria-label={room?.name ?? t('joinFinding')}
    >
      <motion.div
        className="joinCardWrap"
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 26 }}
      >
        <div className="joinCard" data-draft={drafting || undefined}>
          {status === 'loading' && (
            <div className="joinState">
              <Spinner size="sm" />
              <Heading level={2} align="center" noMargin>
                {t('joinFinding')}
              </Heading>
              <Kbd>{code}</Kbd>
            </div>
          )}

          {status === 'notfound' && (
            <div className="joinState">
              <div className="joinIcon" data-tone="warn" aria-hidden>
                <Hash size={22} />
              </div>
              <Heading level={2} align="center" noMargin>
                {t('joinNotFound')}
              </Heading>
              <Text align="center" tone={TextTone.Muted}>
                {t('joinNotFoundBody')}
              </Text>
              <Button onClick={dismiss}>{t('joinBackToPlay')}</Button>
            </div>
          )}

          {status === 'ready' && room && (
            <>
              <header className="joinHead">
                <div className="joinIcon" aria-hidden>
                  {drafting ? <PlayingCardPack size={22} /> : <Users size={22} />}
                </div>
                <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="joinEyebrow">
                  {drafting ? t('joinInvitedDraft') : t('joinInvited')}
                </Text>
                <Heading level={1} align="center" noMargin className="joinName">
                  {room.name}
                </Heading>
                <div className="joinMeta">
                  <span className="joinTag">
                    <Hash size={12} aria-hidden />
                    <Kbd>{code}</Kbd>
                  </span>
                  <span className="joinTag" data-tone={full ? 'warn' : undefined}>
                    <Users size={12} aria-hidden />
                    {room.players.length} / {room.seats}
                  </span>
                  {room.started && (
                    <span className="joinTag" data-tone="live">
                      <Play size={12} aria-hidden />
                      {t('joinInProgress')}
                    </span>
                  )}
                </div>
              </header>

              <section className="joinWho" aria-label={t('playSeats')}>
                {room.players.length === 0 ? (
                  <Text size={Size.Small} tone={TextTone.Subtle}>
                    {t('joinNobody')}
                  </Text>
                ) : (
                  room.players.map((player) => (
                    <span key={player.userId} className="joinPlayer">
                      <Avatar name={player.username} size="sm" />
                      <Text as="span" size={Size.Small}>
                        {player.username}
                      </Text>
                    </span>
                  ))
                )}
              </section>

              {/* A draft table takes the deck question off the table entirely,
                  so it explains what will happen instead of asking. */}
              {drafting ? (
                <p className="joinNote">
                  <Sparkles size={14} aria-hidden />
                  <Text as="span" size={Size.Small}>
                    {t('joinDraftNote')}
                  </Text>
                </p>
              ) : (
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
              )}

              <div className="joinActions">
                <Button onClick={takeSeat} loading={busy} disabled={needsDeck || full}>
                  {drafting ? <PlayingCardPack size={16} aria-hidden /> : <LogIn size={16} aria-hidden />}
                  {seated ? t('joinResumeSeat') : drafting ? t('joinJoinDraft') : t('joinTakeSeat')}
                </Button>
                <Button variant="soft" onClick={watch}>
                  <Eye size={16} aria-hidden /> {t('joinSpectate')}
                </Button>
                <Button variant="ghost" onClick={dismiss}>
                  {t('joinNotNow')}
                </Button>
              </div>

              {(full || needsDeck) && (
                <Text align="center" size={Size.XSmall} tone={TextTone.Warning}>
                  {full ? t('joinFull') : t('joinNoDecks')}
                </Text>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
