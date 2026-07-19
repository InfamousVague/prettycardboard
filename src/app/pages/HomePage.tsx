import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  Avatar,
  Button,
  Card,
  Heading,
  Input,
  Kbd,
  OtpField,
  SegmentedControl,
  Select,
  Size,
  StatusDot,
  Text,
  TextTone,
  useToast,
} from '@glacier/react';
import { Play, Plus, Swords, Ticket } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';
import { useUi } from '../state/uiStore.ts';
import * as api from '../net/api.ts';
import * as ws from '../net/ws.ts';
import type { MyRoom } from '../net/types.ts';
import { cardImage, coverArtCrop } from '../data/cards.ts';
import { featuredDecks } from '../data/catalog.ts';
import { DeckStack } from '../components/DeckStack.tsx';
import { CardRowSkeleton, EmptyFan } from '../components/Skeletons.tsx';
import './home.css';

/**
 * The Home dashboard: a greeting hero, a one-line quick-play form, and three
 * shelves (recent decks, friends online, featured precons). Every shelf links
 * out to its full page; sections stagger in on entrance.
 */

/** A dashboard section that springs in, staggered by its position. */
function Section({ order, className, children }: { order: number; className?: string; children: ReactNode }) {
  return (
    <motion.section
      className={className}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 26, delay: order * 0.07 }}
    >
      {children}
    </motion.section>
  );
}

/** One baseline for every shelf header: title on the left, view-all on the right. */
function SectionHead({ title, onViewAll, viewAllLabel }: { title: string; onViewAll?: () => void; viewAllLabel?: string }) {
  return (
    <div className="homeSectionHead">
      <Heading level={2} noMargin>
        {title}
      </Heading>
      {onViewAll && viewAllLabel && (
        <Button size="sm" variant="ghost" onClick={onViewAll}>
          {viewAllLabel}
        </Button>
      )}
    </div>
  );
}

export function HomePage() {
  return (
    <div className="page homePage">
      <JumpBackIn order={0} />
      <QuickPlay order={1} />
      <RecentDecks order={2} />
      <FriendsOnline order={3} />
      <Featured order={4} />
    </div>
  );
}

/**
 * Jump back in: if a table with your seat is already underway, one banner-style
 * card above Quick play resumes it (most recent started room only). The seat
 * still holds the deck, so the join carries no deckId.
 */
function JumpBackIn({ order }: { order: number }) {
  const t = useT();
  const { toast } = useToast();
  const join = useGame((state) => state.join);
  const closedRoomId = useGame((state) => state.closedRoomId);
  const ackClosed = useGame((state) => state.ackClosed);
  const [room, setRoom] = useState<MyRoom | null>(null);

  const refresh = useCallback(async () => {
    try {
      // The list arrives newest activity first; the first started room wins.
      const rooms = await api.myRooms();
      setRoom(rooms.find((candidate) => candidate.started) ?? null);
    } catch {
      // Offline: keep (or stay without) the banner.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const offMessage = ws.onMessage((message) => {
      if (message.type === 'room.closed') void refresh();
    });
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      offMessage();
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  // Landed back here because the table we sat at was closed; say so once.
  useEffect(() => {
    if (closedRoomId) {
      toast({ tone: 'info', message: t('plTableClosed') });
      ackClosed();
    }
  }, [closedRoomId, ackClosed, toast, t]);

  if (!room) return null;
  return (
    <Section order={order}>
      <div className="homeResume">
        <div className="homeResumeInfo">
          <Play size={18} aria-hidden />
          <Text as="span" className="homeResumeName">
            {room.name}
          </Text>
          <Kbd>{room.code}</Kbd>
        </div>
        <Button size="sm" onClick={() => join(room.roomId)}>
          {t('plResume')}
        </Button>
      </div>
    </Section>
  );
}

/**
 * Quick play as a pair of game-lobby tiles instead of a form: HOST wears the
 * chosen deck's commander art and deals you in; JOIN takes a table code on
 * arcade-style key cells. Same flows as PlayPage underneath.
 */
function QuickPlay({ order }: { order: number }) {
  const t = useT();
  const { toast } = useToast();
  const decks = useApp((state) => state.decks);
  const join = useGame((state) => state.join);

  const [tableName, setTableName] = useState('');
  const [seats, setSeats] = useState('4');
  const [deckId, setDeckId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const chosenDeck = deckId || decks[0]?.id || '';
  const chosen = decks.find((deck) => deck.id === chosenDeck);

  const create = async () => {
    setBusy(true);
    try {
      const room = await api.createRoom(tableName || `${t('playTitle')} - ${new Date().toLocaleTimeString()}`, Number(seats));
      join(room.roomId, chosenDeck || undefined);
    } catch {
      toast({ tone: 'danger', message: t('obOffline') });
    } finally {
      setBusy(false);
    }
  };

  const joinByCode = async (value?: string) => {
    const tableCode = (value ?? code).trim().toUpperCase();
    if (tableCode.length < 6) return;
    setBusy(true);
    try {
      const room = await api.getRoomByCode(tableCode);
      join(room.roomId, chosenDeck || undefined);
    } catch {
      toast({ tone: 'danger', message: t('playCodeBad') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section order={order}>
      <SectionHead title={t('hmQuickPlay')} />
      <div className="qpGrid">
        {/* HOST: the chosen commander presides over the tile */}
        <div className="qpTile qpHost">
          {chosen?.coverImageUrl && (
            <div className="qpHostArt" style={{ backgroundImage: `url(${coverArtCrop(chosen.coverImageUrl)})` }} aria-hidden />
          )}
          <div className="qpTileScrim" aria-hidden />
          <div className="qpTileBody">
            <span className="qpTileTag">
              <Swords size={14} aria-hidden />
              {t('playNewTable')}
            </span>

            <div className="qpField">
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="qpLabel">
                {t('playPickDeck')}
              </Text>
              <div className="qpDeckRow">
                {chosen?.coverImageUrl && (
                  <span className="qpDeckThumb" style={{ backgroundImage: `url(${coverArtCrop(chosen.coverImageUrl)})` }} aria-hidden />
                )}
                <Select
                  fullWidth
                  value={chosenDeck}
                  onValueChange={setDeckId}
                  options={decks.map((deck) => ({ value: deck.id, label: deck.name }))}
                  placeholder={t('playPickDeck')}
                  aria-label={t('playPickDeck')}
                />
              </div>
            </div>

            <div className="qpRow">
              <div className="qpField">
                <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="qpLabel">
                  {t('playSeats')}
                </Text>
                <SegmentedControl
                  value={seats}
                  onValueChange={setSeats}
                  options={['2', '3', '4', '5', '6'].map((n) => ({ value: n, label: n }))}
                  aria-label={t('playSeats')}
                />
              </div>
              <div className="qpField qpFieldGrow">
                <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="qpLabel">
                  {t('playTableName')}
                </Text>
                <Input value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder="Friday pod" />
              </div>
            </div>

            <Button size="lg" onClick={create} loading={busy} disabled={decks.length === 0} className="qpAction">
              <Swords size={17} />
              {t('playCreate')}
            </Button>
          </div>
        </div>

        {/* JOIN: a ticket booth with arcade code cells */}
        <div className="qpTile qpJoin">
          <div className="qpTileBody">
            <span className="qpTileTag">
              <Ticket size={14} aria-hidden />
              {t('playJoin')}
            </span>
            <div className="qpCode" data-no-drag>
              <OtpField
                length={6}
                type="alphanumeric"
                value={code}
                onValueChange={(value) => setCode(value.toUpperCase())}
                onComplete={(value) => void joinByCode(value)}
                aria-label={t('playCodePlaceholder')}
              />
            </div>
            <Text size={Size.XSmall} tone={TextTone.Subtle}>
              {t('playCodePlaceholder')}
            </Text>
            <Button size="lg" variant="soft" onClick={() => void joinByCode()} loading={busy} disabled={code.length < 6} className="qpAction">
              <Ticket size={17} />
              {t('playJoinButton')}
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

/** The four most recently touched decks as physical stacks. */
function RecentDecks({ order }: { order: number }) {
  const t = useT();
  const decks = useApp((state) => state.decks);
  const refreshDecks = useApp((state) => state.refreshDecks);
  const selectDeck = useUi((state) => state.selectDeck);
  // Distinguishes "still loading after boot" from "actually no decks".
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    refreshDecks()
      .catch(() => {
        // Offline is fine, the store keeps whatever it had.
      })
      .finally(() => setSettled(true));
  }, [refreshDecks]);

  const recent = [...decks]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);

  const openDeck = (id: string) => {
    selectDeck(id);
    window.location.hash = '/decks';
  };
  const goDecks = () => {
    selectDeck(null);
    window.location.hash = '/decks';
  };

  return (
    <Section order={order}>
      <SectionHead title={t('hmRecentDecks')} onViewAll={goDecks} viewAllLabel={t('hmViewAll')} />
      {recent.length > 0 ? (
        <div className="homeStackRow">
          {recent.map((deck) => (
            <div key={deck.id} className="homeStackItem">
              <DeckStack
                name={deck.name}
                imageUrl={deck.coverImageUrl || undefined}
                width={150}
                onClick={() => openDeck(deck.id)}
              />
              <Text size={Size.Small} className="homeStackName">
                {deck.name}
              </Text>
              {deck.commander && (
                <Text size={Size.XSmall} tone={TextTone.Subtle} className="homeStackSub">
                  {deck.commander}
                </Text>
              )}
            </div>
          ))}
        </div>
      ) : settled ? (
        <EmptyFan
          quip={t('esDrawStep')}
          action={
            <Button size="sm" onClick={goDecks}>
              <Plus size={16} />
              {t('decksNew')}
            </Button>
          }
        />
      ) : (
        <CardRowSkeleton count={4} width={150} />
      )}
    </Section>
  );
}

/** Who is at the table right now: a strip of online friends. */
function FriendsOnline({ order }: { order: number }) {
  const t = useT();
  const friends = useApp((state) => state.friends);
  const refreshFriends = useApp((state) => state.refreshFriends);

  useEffect(() => {
    refreshFriends().catch(() => {
      // Presence keeps flowing over the socket either way.
    });
  }, [refreshFriends]);

  const online = friends.friends.filter((friend) => friend.online);

  return (
    <Section order={order}>
      <SectionHead
        title={t('hmFriendsOnline')}
        onViewAll={() => {
          window.location.hash = '/friends';
        }}
        viewAllLabel={t('hmViewAll')}
      />
      {online.length === 0 ? (
        <Text tone={TextTone.Muted}>{t('hmNoFriendsOnline')}</Text>
      ) : (
        <div className="homeFriendsRow">
          {online.map((friend) => (
            <div key={friend.userId} className="homeFriend">
              <Avatar name={friend.username} size="sm" />
              <Text as="span" size={Size.Small}>
                {friend.username}
              </Text>
              <StatusDot tone={friend.roomId ? 'accent' : 'success'} size="sm" />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/** A taste of the Browse catalog: the featured precon shelf. */
function Featured({ order }: { order: number }) {
  const t = useT();
  const featured = featuredDecks().slice(0, 4);
  const goBrowse = () => {
    window.location.hash = '/browse';
  };

  return (
    <Section order={order}>
      <SectionHead title={t('hmFeatured')} onViewAll={goBrowse} viewAllLabel={t('hmViewAll')} />
      <div className="homeStackRow">
        {featured.map((deck) => {
          const commander = deck.commanders[0];
          return (
            <div key={deck.id} className="homeStackItem">
              <DeckStack
                name={deck.name}
                imageUrl={commander ? cardImage(commander.sid) : undefined}
                width={150}
                onClick={goBrowse}
              />
              <Text size={Size.Small} className="homeStackName">
                {deck.name}
              </Text>
              {commander && (
                <Text size={Size.XSmall} tone={TextTone.Subtle} className="homeStackSub">
                  {commander.name}
                </Text>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
