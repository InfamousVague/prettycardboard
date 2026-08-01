import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  Avatar,
  Button,
  Carousel,
  Heading,
  Input,
  OtpField,
  Pill,
  SegmentedControl,
  Select,
  Size,
  StatTile,
  StatusDot,
  Text,
  TextTone,
  useToast,
} from '@glacier/react';
import { Compass, Heart, Play, Plus, Swords, Ticket, Trophy } from '@glacier/icons';
import { PlayingCardDeck, PlayingCardPack } from '../icons/cards.ts';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';
import { useUi } from '../state/uiStore.ts';
import * as api from '../net/api.ts';
import * as ws from '../net/ws.ts';
import type { MyRoom, UserStats } from '../net/types.ts';
import { cardImage } from '../data/cards.ts';
import { rankFor, winRate } from '../data/ranks.ts';
import { featuredDecks } from '../data/catalog.ts';
import { useVisibleGames } from '../hooks/useVisibleGames.ts';
import { useMobileLayout } from '../hooks/useIsPhone.ts';
import { cyberpunkImage, cyberpunkStarters } from '../data/cyberpunk.ts';
import { yugiohImage, yugiohStarters } from '../data/yugioh.ts';
import { deckSummaryArt, deckSummaryCover } from '../data/deckCover.ts';
import { DEFAULT_PLAYMAT, playmatBackground } from '../data/playmats.ts';
import { DeckStack } from '../components/DeckStack.tsx';
import { GameTag } from '../components/GameTag.tsx';
import { CardRowSkeleton, EmptyFan } from '../components/Skeletons.tsx';
import './home.css';

/**
 * The Home dashboard: the game-menu band (full-bleed deck art + the big
 * actions), the KPI strip, the table-setup machinery, and the shelves. Every
 * shelf links out to its full page; sections stagger in on entrance.
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
  const t = useT();
  const { toast } = useToast();
  const identity = useApp((state) => state.identity);
  const closedRoomId = useGame((state) => state.closedRoomId);
  const ackClosed = useGame((state) => state.ackClosed);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [resume, setResume] = useState<MyRoom | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStats(await api.myStats());
    } catch {
      // Offline: keep whatever we had.
    }
    try {
      // Newest activity first; the first started room is what "Continue" resumes.
      const rooms = await api.myRooms();
      setResume(rooms.find((candidate) => candidate.started) ?? null);
    } catch {
      // Offline.
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

  // Landed here because the table we sat at was closed; say so once.
  useEffect(() => {
    if (closedRoomId) {
      toast({ tone: 'info', message: t('plTableClosed') });
      ackClosed();
    }
  }, [closedRoomId, ackClosed, toast, t]);

  // Cyberpunk is a WIP game — its discover shelf only shows with the dev toggle on.
  const showCyber = useVisibleGames().some((g) => g.id === 'cyberpunk');
  return (
    <div className="page homePage">
      <GameMenu identity={identity} stats={stats} resume={resume} />
      <StatStrip stats={stats} order={1} />
      <TableSetup order={2} />
      <RecentDecks order={3} />
      <Featured order={4} />
      <YugiohStarters order={5} />
      {showCyber && <CyberpunkStarters order={6} />}
    </div>
  );
}

/**
 * The game menu band, Overwatch main-menu idiom: the most recent deck's
 * commander art full-bleed behind a stacked, skewed menu of the big actions,
 * with the player badge in the far corner. Presentation only — `resume` and
 * `stats` arrive from HomePage's existing fetching, untouched.
 */
function GameMenu({
  identity,
  stats,
  resume,
}: {
  identity: { username: string } | null;
  stats: UserStats | null;
  resume: MyRoom | null;
}) {
  const t = useT();
  const decks = useApp((state) => state.decks);
  const join = useGame((state) => state.join);
  const rank = rankFor(stats?.played ?? 0);

  // The most recently touched deck dresses the band; a fresh account gets the
  // default felt the tables use.
  const art = useMemo(() => {
    const recent = [...decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const wide = recent ? deckSummaryArt(recent) : '';
    return wide ? `url("${wide}")` : playmatBackground(DEFAULT_PLAYMAT);
  }, [decks]);

  const openPacks = () => {
    // Latch BEFORE the event: the pack dock chunk may still be streaming and
    // reads the latch when it mounts (see App.tsx requestPackDock).
    (window as { __pcPackDock?: 'open' | 'show' }).__pcPackDock = 'open';
    window.dispatchEvent(new CustomEvent('pc:open-packdock', { detail: { open: true } }));
  };

  return (
    <section className="gmBand">
      <div className="gmArt" style={{ backgroundImage: art }} aria-hidden />
      <div className="gmScrim" aria-hidden />

      <div className="gmBadge">
        <span className="gmBadgeAvatar">
          <Avatar name={identity?.username} size="lg" />
          <StatusDot tone="success" pulse className="gmBadgePresence" />
        </span>
        <span className="gmBadgeId">
          <span className="gmBadgeRank">{rank.title}</span>
          <span className="gmBadgeName">{identity?.username}</span>
        </span>
        <Pill size="sm" tone="accent" variant="soft">
          {t('hmLevel')} {rank.level}
        </Pill>
      </div>

      <nav className="gmMenu" aria-label={t('hmQuickPlay')}>
        <button type="button" className="gmItem gmPrimary" onClick={() => (window.location.hash = '/new')}>
          <span className="gmItemInner">
            <span className="gmItemText">
              <span className="gmItemTitle">{t('playTitle')}</span>
              <span className="gmItemSub">{t('hmStartTableSub')}</span>
            </span>
            <Swords size={26} className="gmItemIcon" aria-hidden />
          </span>
        </button>

        {resume && (
          <button type="button" className="gmItem gmResume" onClick={() => join(resume.roomId)}>
            <span className="gmItemInner">
              <span className="gmItemText">
                <span className="gmItemTitle">{t('hmContinue')}</span>
                <span className="gmItemSub gmResumeSub">
                  <StatusDot tone="success" pulse size="sm" label={t('hmInProgress')} />
                  <span className="gmResumeName">{resume.name}</span>
                  <GameTag game={resume.game} showName={false} />
                </span>
              </span>
              <Play size={20} className="gmItemIcon" aria-hidden />
            </span>
          </button>
        )}

        <button type="button" className="gmItem" onClick={openPacks}>
          <span className="gmItemInner">
            <span className="gmItemText">
              <span className="gmItemTitle">{t('hmOpenPacks')}</span>
              <span className="gmItemSub">{t('hmOpenPacksSub')}</span>
            </span>
            <PlayingCardPack size={20} className="gmItemIcon" aria-hidden />
          </span>
        </button>

        <div className="gmHalfRow">
          <button type="button" className="gmItem gmHalf" onClick={() => (window.location.hash = '/decks')}>
            <span className="gmItemInner">
              <PlayingCardDeck size={16} className="gmItemIcon" aria-hidden />
              <span className="gmItemTitle">{t('navDecks')}</span>
            </span>
          </button>
          <button type="button" className="gmItem gmHalf" onClick={() => (window.location.hash = '/browse')}>
            <span className="gmItemInner">
              <Compass size={16} className="gmItemIcon" aria-hidden />
              <span className="gmItemTitle">{t('navBrowse')}</span>
            </span>
          </button>
        </div>
      </nav>
    </section>
  );
}

/** The KPI strip: wins, games, endorsements, decks. */
function StatStrip({ stats, order }: { stats: UserStats | null; order: number }) {
  const t = useT();
  const decks = useApp((state) => state.decks);
  const played = stats?.played ?? 0;
  const wr = stats ? winRate(stats) : null;
  return (
    <Section order={order} className="homeStats">
      <StatTile
        glass
        icon={<Trophy size={18} />}
        value={stats?.wins ?? 0}
        label={t('hmWins')}
        hint={wr != null ? `${wr}% ${t('hmWinRate')}` : undefined}
      />
      <StatTile glass icon={<Swords size={18} />} value={played} label={t('hmGames')} />
      <StatTile glass icon={<Heart size={18} />} value={stats?.endorsements ?? 0} label={t('hmEndorse')} />
      <StatTile glass icon={<PlayingCardDeck size={18} />} value={decks.length} label={t('decksTitle')} />
    </Section>
  );
}

/**
 * The detailed table machinery under the game menu: HOST with game/deck/seats/
 * name, JOIN by code on arcade-style key cells. Same flows as PlayPage
 * underneath; the hero art moved up into the GameMenu band.
 */
function TableSetup({ order }: { order: number }) {
  const t = useT();
  const { toast } = useToast();
  const decks = useApp((state) => state.decks);
  const join = useGame((state) => state.join);
  const phone = useMobileLayout();

  const [tableName, setTableName] = useState('');
  const [seats, setSeats] = useState('4');
  const games = useVisibleGames();
  const [game, setGame] = useState('mtg');
  const [deckId, setDeckId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  // Only the chosen game's decks are eligible; fall back to its first deck.
  const gameDecks = decks.filter((deck) => (deck.game || 'mtg') === game);
  const chosenDeck = (deckId && gameDecks.some((deck) => deck.id === deckId) ? deckId : gameDecks[0]?.id) || '';
  const chosen = decks.find((deck) => deck.id === chosenDeck);
  const chosenArt = chosen ? deckSummaryArt(chosen) : '';

  const create = async () => {
    setBusy(true);
    try {
      const room = await api.createRoom(
        tableName || `${t('playTitle')} - ${new Date().toLocaleTimeString()}`,
        Number(seats),
        undefined,
        { game },
      );
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
      <SectionHead title={t('hmSetupTable')} />
      <div className="qpGrid">
        {/* HOST: game, deck, seats, name — the working half of the band above */}
        <div className="qpTile qpHost">
          <div className="qpTileBody">
            <span className="qpTileTag">
              <Swords size={14} aria-hidden />
              {t('playNewTable')}
              <GameTag game={game} />
            </span>

            <div className="qpField">
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="qpLabel">
                {t('playGame')}
              </Text>
              <SegmentedControl
                fullWidth
                value={game}
                onValueChange={setGame}
                options={games.map((g) => ({ value: g.id, label: g.name.replace('Magic: The Gathering', 'Magic') }))}
                aria-label={t('playGame')}
              />
            </div>

            <div className="qpField">
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="qpLabel">
                {t('playPickDeck')}
              </Text>
              <div className="qpDeckRow">
                {chosenArt && (
                  <span className="qpDeckThumb" style={{ backgroundImage: `url(${chosenArt})` }} aria-hidden />
                )}
                <Select
                  fullWidth
                  value={chosenDeck}
                  onValueChange={setDeckId}
                  options={gameDecks.map((deck) => ({ value: deck.id, label: deck.name }))}
                  placeholder={gameDecks.length === 0 ? t('playNoDecksForGame') : t('playPickDeck')}
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
                size={phone ? 'sm' : 'md'}
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
  const newDeck = () => {
    useUi.getState().requestNewDeck();
    window.location.hash = '/decks';
  };

  return (
    <Section order={order}>
      <SectionHead title={t('hmRecentDecks')} onViewAll={goDecks} viewAllLabel={t('hmViewAll')} />
      {recent.length > 0 ? (
        <Carousel className="homeCarousel" gap="var(--glacier-space-4)" aria-label={t('hmRecentDecks')}>
          {recent.map((deck) => (
            <div key={deck.id} className="homeStackItem">
              <DeckStack
                name={deck.name}
                imageUrl={deckSummaryCover(deck)}
                width={150}
                onClick={() => openDeck(deck.id)}
              />
              <Text size={Size.Small} className="homeStackName">
                <GameTag game={deck.game} showName={false} /> {deck.name}
              </Text>
              {deck.commander && (
                <Text size={Size.XSmall} tone={TextTone.Subtle} className="homeStackSub">
                  {deck.commander}
                </Text>
              )}
            </div>
          ))}
        </Carousel>
      ) : settled ? (
        <EmptyFan
          quip={t('esDrawStep')}
          action={
            <Button size="sm" onClick={newDeck}>
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
      <Carousel className="homeCarousel" gap="var(--glacier-space-4)" aria-label={t('hmFeatured')}>
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
      </Carousel>
    </Section>
  );
}

/** Discover shelf for Yu-Gi-Oh: the bundled starter decks, linking into the
 * Browse page's Yu-Gi-Oh tab. */
function YugiohStarters({ order }: { order: number }) {
  const t = useT();
  const starters = useMemo(() => yugiohStarters(), []);
  const goBrowse = () => {
    sessionStorage.setItem('pc_browse_game', 'yugioh');
    window.location.hash = '/browse';
  };
  if (starters.length === 0) return null;
  return (
    <Section order={order}>
      <SectionHead title={t('hmYugiohStarters')} onViewAll={goBrowse} viewAllLabel={t('hmViewAll')} />
      <Carousel className="homeCarousel" gap="var(--glacier-space-4)" aria-label={t('hmYugiohStarters')}>
        {starters.map((starter) => {
          const coverName = starter.cards.find((card) => card.scryfallId === starter.cover)?.name ?? starter.name;
          return (
            <div key={starter.id} className="homeStackItem">
              <DeckStack name={coverName} imageUrl={yugiohImage(starter.cover)} width={150} onClick={goBrowse} />
              <Text size={Size.Small} className="homeStackName">
                <GameTag game="yugioh" showName={false} /> {starter.name}
              </Text>
              <Text size={Size.XSmall} tone={TextTone.Subtle} className="homeStackSub">
                {coverName}
              </Text>
            </div>
          );
        })}
      </Carousel>
    </Section>
  );
}

/** Discover shelf for the other game: the Cyberpunk starter decks, linking into
 * the Browse page's Cyberpunk tab. */
function CyberpunkStarters({ order }: { order: number }) {
  const t = useT();
  const starters = useMemo(() => cyberpunkStarters(), []);
  const goBrowse = () => {
    sessionStorage.setItem('pc_browse_game', 'cyberpunk');
    window.location.hash = '/browse';
  };
  if (starters.length === 0) return null;
  return (
    <Section order={order}>
      <SectionHead title={t('hmCyberStarters')} onViewAll={goBrowse} viewAllLabel={t('hmViewAll')} />
      <Carousel className="homeCarousel" gap="var(--glacier-space-4)" aria-label={t('hmCyberStarters')}>
        {starters.map((starter) => (
          <div key={starter.id} className="homeStackItem">
            <DeckStack name={starter.legend.displayName} imageUrl={cyberpunkImage(starter.legend.id)} width={150} onClick={goBrowse} />
            <Text size={Size.Small} className="homeStackName">
              <GameTag game="cyberpunk" showName={false} /> {starter.name}
            </Text>
            <Text size={Size.XSmall} tone={TextTone.Subtle} className="homeStackSub">
              {starter.legend.displayName}
            </Text>
          </div>
        ))}
      </Carousel>
    </Section>
  );
}
