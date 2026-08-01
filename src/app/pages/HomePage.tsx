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
  ProgressBar,
  SegmentedControl,
  Select,
  Size,
  StatusDot,
  Text,
  TextTone,
  useToast,
} from '@glacier/react';
import { ChevronRight, Compass, Heart, Play, Plus, Swords, Target, Ticket, Timer, Trophy } from '@glacier/icons';
import { PlayingCardDeck, PlayingCardPack, PlayingCardStack, PlayingCardSwap } from '../icons/cards.ts';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';
import { useUi } from '../state/uiStore.ts';
import * as api from '../net/api.ts';
import * as ws from '../net/ws.ts';
import type { MyDeckStats, MyRoom, UserStats } from '../net/types.ts';
import { artCrop } from '../data/cards.ts';
import { bracketKey } from '../data/brackets.ts';
import { rankFor, winRate } from '../data/ranks.ts';
import { featuredDecks } from '../data/catalog.ts';
import { useVisibleGames } from '../hooks/useVisibleGames.ts';
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
function Section({
  order,
  className,
  ariaLabel,
  children,
}: {
  order: number;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      className={className}
      aria-label={ariaLabel}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 26, delay: order * 0.07 }}
    >
      {children}
    </motion.section>
  );
}

/** Compact per-turn pace, same convention as PostMatch: "1m 35s" / "45s". */
function fmtTurn(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
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
  const [deckStats, setDeckStats] = useState<Map<string, MyDeckStats> | null>(null);
  const [resume, setResume] = useState<MyRoom | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStats(await api.myStats());
    } catch {
      // Offline: keep whatever we had.
    }
    try {
      // One fetch feeds every loadout tile's record; the rail maps by deckId.
      const rows = await api.myDeckStats();
      setDeckStats(new Map(rows.map((row) => [row.deckId, row])));
    } catch {
      // Offline.
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
      <RecentDecks deckStats={deckStats} order={3} />
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
  const { toast } = useToast();
  const decks = useApp((state) => state.decks);
  const join = useGame((state) => state.join);
  const played = stats?.played ?? 0;
  const rank = rankFor(played);

  // Join-by-code lives in the band now: six cells, and filling the last one IS
  // the join - no separate button to find. The code resets on a bad code so
  // the cells are immediately typeable again.
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const joinByCode = async (value: string) => {
    const tableCode = value.trim().toUpperCase();
    if (tableCode.length < 6 || joining) return;
    setJoining(true);
    try {
      const room = await api.getRoomByCode(tableCode);
      join(room.roomId);
    } catch {
      toast({ tone: 'danger', message: t('playCodeBad') });
      setCode('');
    } finally {
      setJoining(false);
    }
  };

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
        <div className="gmBadgeId">
          <span className="gmBadgeRank">{rank.title}</span>
          {/* The page's h1: the badge owns the player's name, like OW's portrait. */}
          <Heading level={1} noMargin className="gmBadgeName">
            {identity?.username}
          </Heading>
          {rank.next != null && (
            <div className="gmBadgeProgress">
              <ProgressBar
                value={Math.round(rank.progress * 100)}
                max={100}
                size="sm"
                tone="accent"
                aria-label={t('hmNextRank')}
              />
              <span className="gmBadgeProgressLabel">
                {rank.next - played} {t('hmToNextRank')}
              </span>
            </div>
          )}
        </div>
        <Pill size="sm" tone="accent" variant="soft">
          {t('hmLevel')} {rank.level}
        </Pill>
      </div>

      {/* One nav landmark, two columns: display:contents lets the primary
          stack and the side stack lay out as band children while staying a
          single list to assistive tech. */}
      <nav className="gmNav" aria-label={t('hmQuickPlay')}>
        <div className="gmMenu">
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
          <button type="button" className="gmItem gmHalf" onClick={() => (window.location.hash = '/collection')}>
            <span className="gmItemInner">
              <PlayingCardStack size={16} className="gmItemIcon" aria-hidden />
              <span className="gmItemTitle">{t('navCollection')}</span>
            </span>
          </button>
          <button type="button" className="gmItem gmHalf" onClick={() => (window.location.hash = '/play')}>
            <span className="gmItemInner">
              <PlayingCardSwap size={16} className="gmItemIcon" aria-hidden />
              <span className="gmItemTitle">{t('navPlay')}</span>
            </span>
          </button>
        </div>
        </div>

        {/* The side column: just the code entry now, bottom-anchored under the
            player badge so the art keeps the middle of the band. */}
        <div className="gmSide">
        {/* The code entry keeps the menu's plate shape but is not a button -
            the cells inside are the control, and filling them is the action. */}
        <div className="gmItem gmJoin" data-busy={joining || undefined}>
          <span className="gmItemInner">
            <span className="gmJoinLabel">
              <Ticket size={16} className="gmItemIcon" aria-hidden />
              <span className="gmItemTitle">{t('playJoin')}</span>
            </span>
            <OtpField
              length={6}
              type="alphanumeric"
              size="sm"
              value={code}
              disabled={joining}
              onValueChange={(value) => setCode(value.toUpperCase())}
              onComplete={(value) => void joinByCode(value)}
              aria-label={t('playCodePlaceholder')}
            />
          </span>
        </div>
        </div>
      </nav>
    </section>
  );
}

/**
 * The career banner, Apex-style: one band of six angled stat plates — big
 * numeral, uppercase micro-label, thin accent underline. The win-rate plate's
 * underline doubles as its meter, filled to the percentage. StatTile can't
 * wear this look (its internals are hashed kit classes), so the plates are
 * app-owned markup on Glacier tokens.
 */
function StatStrip({ stats, order }: { stats: UserStats | null; order: number }) {
  const t = useT();
  const decks = useApp((state) => state.decks);
  const played = stats?.played ?? 0;
  const wr = stats ? winRate(stats) : null;

  const plates: {
    key: string;
    icon: ReactNode;
    value: ReactNode;
    label: string;
    sub?: string;
    fill?: number | null;
  }[] = [
    {
      key: 'wins',
      icon: <Trophy size={13} aria-hidden />,
      value: stats?.wins ?? 0,
      label: t('hmWins'),
      sub: wr != null ? `${wr}% ${t('hmWinRate')}` : undefined,
    },
    { key: 'games', icon: <Swords size={13} aria-hidden />, value: played, label: t('hmGames') },
    {
      key: 'winrate',
      icon: <Target size={13} aria-hidden />,
      value: wr != null ? `${wr}%` : '—',
      label: t('hmWinRate'),
      fill: wr,
    },
    {
      key: 'avgturn',
      icon: <Timer size={13} aria-hidden />,
      value: stats && stats.avgTurnMs > 0 ? fmtTurn(stats.avgTurnMs) : '—',
      label: t('hmAvgTurn'),
    },
    { key: 'endorse', icon: <Heart size={13} aria-hidden />, value: stats?.endorsements ?? 0, label: t('hmEndorse') },
    { key: 'decks', icon: <PlayingCardDeck size={13} aria-hidden />, value: decks.length, label: t('decksTitle') },
  ];

  return (
    <Section order={order} className="hmCareer" ariaLabel={t('hmCareer')}>
      <div className="hmCareerHead">
        <Heading level={2} noMargin className="hmCareerKicker">
          {t('hmCareer')}
        </Heading>
      </div>
      <div className="hmCareerBand">
        {plates.map((plate) => (
          <div key={plate.key} className="hmPlate">
            <span className="hmPlateInner">
              <span className="hmPlateValue">{plate.value}</span>
              {plate.sub && <span className="hmPlateSub">{plate.sub}</span>}
              <span className="hmPlateLabel">
                {plate.icon}
                <span className="hmPlateLabelText">{plate.label}</span>
              </span>
            </span>
            <span
              className="hmPlateEdge"
              style={plate.fill != null ? { inlineSize: `${plate.fill}%` } : undefined}
              aria-hidden
            />
          </div>
        ))}
      </div>
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

  const [tableName, setTableName] = useState('');
  const [seats, setSeats] = useState('4');
  const games = useVisibleGames();
  const [game, setGame] = useState('mtg');
  const [deckId, setDeckId] = useState('');
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

  return (
    <Section order={order}>
      <SectionHead title={t('hmSetupTable')} />
      <div className="qpGrid qpGridSolo">
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

        {/* Join-by-code moved up into the hero band's menu - one join entry on
            the page, not two. */}
      </div>
    </Section>
  );
}

/**
 * The loadout rail: the eight most recently touched decks as Apex loadout
 * cards — the physical stack up top, then a stat block with the bracket chip,
 * card count, and the deck's own record. Records come from HomePage's single
 * myDeckStats fetch, mapped by deckId; a deck that has never hit a table shows
 * an em dash, not a fake 0–0.
 */
function RecentDecks({ deckStats, order }: { deckStats: Map<string, MyDeckStats> | null; order: number }) {
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
    .slice(0, 8);

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
          {recent.map((deck) => {
            const record = deckStats?.get(deck.id);
            const playedIt = record != null && record.played > 0;
            const pct = playedIt ? winRate(record) : null;
            return (
              <div key={deck.id} className="hmLoadout">
                <DeckStack name={deck.name} imageUrl={deckSummaryCover(deck)} width={150} onClick={() => openDeck(deck.id)}>
                  {deck.bracket && (
                    <span
                      className="hmLoadBracket"
                      data-bracket={deck.bracket.bracket}
                      role="img"
                      aria-label={`${t('bkBracket')} ${deck.bracket.bracket}: ${t(bracketKey(deck.bracket.bracket))} (${t('bkEstimate')})`}
                    >
                      <span className="hmLoadBracketNum">{deck.bracket.bracket}</span>
                      <span className="hmLoadBracketName">{t(bracketKey(deck.bracket.bracket))}</span>
                    </span>
                  )}
                </DeckStack>
                <Text size={Size.Small} className="hmLoadName">
                  <GameTag game={deck.game} showName={false} /> {deck.name}
                </Text>
                <div className="hmLoadStats">
                  <span className="hmLoadStat">
                    <span className="hmLoadValue">{deck.cardCount}</span>
                    <span className="hmLoadLabel">{t('decksCards')}</span>
                  </span>
                  <span className="hmLoadStat">
                    <span className="hmLoadValue">{playedIt ? `${record.wins}–${record.losses}` : '—'}</span>
                    <span className="hmLoadLabel">{t('hmRecord')}</span>
                  </span>
                  <span className="hmLoadStat">
                    <span className="hmLoadValue">{pct != null ? `${pct}%` : '—'}</span>
                    <span className="hmLoadLabel">{t('hmWinRate')}</span>
                  </span>
                </div>
              </div>
            );
          })}
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
        <CardRowSkeleton count={8} width={150} />
      )}
    </Section>
  );
}

/**
 * One store-rail banner tile, shared by Featured and both starter shelves so
 * the page reads as consistent rails: art-forward plate, a corner game tag,
 * then name, one-line hook, and the browse affordance over the scrim. Portrait
 * sources (full card scans) crop toward the art box; wide art crops center.
 */
function ShelfBanner({
  art,
  title,
  hook,
  tag,
  portrait,
  onClick,
}: {
  art: string;
  title: string;
  hook?: string;
  tag?: ReactNode;
  portrait?: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button type="button" className={portrait ? 'hmBanner hmBannerPortrait' : 'hmBanner'} onClick={onClick}>
      <span
        className="hmBannerArt"
        style={art ? { backgroundImage: `url(${art})` } : undefined}
        aria-hidden
      />
      <span className="hmBannerScrim" aria-hidden />
      {tag}
      <span className="hmBannerBody">
        <span className="hmBannerTitle">{title}</span>
        {hook && <span className="hmBannerHook">{hook}</span>}
        <span className="hmBannerCta">
          {t('hmViewInBrowse')}
          <ChevronRight size={14} aria-hidden />
        </span>
      </span>
    </button>
  );
}

/** A taste of the Browse catalog: the featured precon shelf as a store rail. */
function Featured({ order }: { order: number }) {
  const t = useT();
  const featured = featuredDecks().slice(0, 8);
  const goBrowse = () => {
    window.location.hash = '/browse';
  };

  return (
    <Section order={order}>
      <SectionHead title={t('hmFeatured')} onViewAll={goBrowse} viewAllLabel={t('hmViewAll')} />
      <Carousel className="homeCarousel" gap="var(--glacier-space-4)" aria-label={t('hmFeatured')}>
        {featured.map((deck) => {
          const hero = deck.commanders[0] ?? deck.face;
          const year = deck.date.slice(0, 4);
          return (
            <ShelfBanner
              key={deck.id}
              art={hero ? artCrop(hero.sid) : ''}
              title={deck.name}
              hook={hero ? `${hero.name} · ${year}` : year}
              onClick={goBrowse}
            />
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
            <ShelfBanner
              key={starter.id}
              art={yugiohImage(starter.cover)}
              title={starter.name}
              hook={coverName}
              tag={<GameTag game="yugioh" showName={false} className="hmBannerTag" />}
              portrait
              onClick={goBrowse}
            />
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
          <ShelfBanner
            key={starter.id}
            art={cyberpunkImage(starter.legend.id)}
            title={starter.name}
            hook={starter.legend.displayName}
            tag={<GameTag game="cyberpunk" showName={false} className="hmBannerTag" />}
            portrait
            onClick={goBrowse}
          />
        ))}
      </Carousel>
    </Section>
  );
}
