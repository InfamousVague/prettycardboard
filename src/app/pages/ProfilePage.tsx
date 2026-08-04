import { useEffect, useState, type ReactNode } from 'react';
import {
  Avatar,
  Button,
  Heading,
  Pill,
  ProgressBar,
  ProgressRing,
  Select,
  Size,
  Text,
  TextTone,
  useLocale,
} from '@glacier/react';
import { Crown, ThumbsUp } from '../icons/backfilled.tsx';
import { PlayingCard } from '../icons/cards.ts';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useUi } from '../state/uiStore.ts';
import * as api from '../net/api.ts';
import { COLOR_ORDER, cardImage, commanderArt } from '../data/cards.ts';
import { PRECONS, preconCommander } from '../data/precons.ts';
import { DeckStack } from '../components/DeckStack.tsx';
import { useCardPopup } from '../components/CardPopup.tsx';
import { fmtDuration, relativeWhen } from '../components/MatchHistory.tsx';
import { SaltPile } from '../components/SaltPile.tsx';
import { GameTag } from '../components/GameTag.tsx';
import { RANKS, rankFor, winRate } from '../data/ranks.ts';
import { RankEmblem, RankLadder } from '../components/RankEmblem.tsx';
import { RankBadge, RankAvatarFrame } from '../components/RankBadge.tsx';
import { divisionFor, RANK_META, RATING_SEED } from '../data/rankTiers.ts';
import { deckSummaryArt } from '../data/deckCover.ts';
import { useShowcaseId, writeShowcaseId } from '../data/showcase.ts';
import { useMobileLayout } from '../hooks/useIsPhone.ts';
import type { MatchRow, MyDeckStats, UserStats } from '../net/types.ts';
import './social.css';

/**
 * The career profile: a full-bleed identity plate (showcase art, rank insignia,
 * the win-rate ring), lifetime stats as chamfered plates, the deck reputation
 * boards, the service record, and the Final Fantasy precon shelf. All data
 * fetching is unchanged from the previous incarnation - this file re-clothes
 * it in the gamified idiom the Home page established.
 */

const GAME_TAG: Record<string, string> = {
  'counter-blitz': 'FINAL FANTASY X',
  'limit-break': 'FINAL FANTASY VII',
  'revival-trance': 'FINAL FANTASY VI',
  'scions-spellcraft': 'FINAL FANTASY XIV',
};

function gameTag(id: string, name: string): string {
  const match = /\(([^)]+)\)\s*$/.exec(name);
  return GAME_TAG[id] ?? match?.[1] ?? '';
}

const PIP: Record<string, string> = {
  W: 'oklch(0.92 0.05 95)',
  U: 'oklch(0.62 0.14 250)',
  B: 'oklch(0.38 0.03 300)',
  R: 'oklch(0.6 0.19 30)',
  G: 'oklch(0.55 0.13 150)',
};


/** One big-number stat plate: the value huge, the label small and tracked. */
function Plate({
  value,
  label,
  tone,
  fit,
  hint,
}: {
  value: ReactNode;
  label: ReactNode;
  tone?: 'endorse' | 'salt';
  /** 'text' shrinks the value type for word-sized values (dates). */
  fit?: 'text';
  hint?: string;
}) {
  return (
    <div className="pfPlate" data-tone={tone} data-fit={fit} title={hint}>
      <span className="pfPlateValue">{value}</span>
      <span className="pfPlateLabel">{label}</span>
    </div>
  );
}

/** Identity plate + career plates + reputation + service record + precons. */
export function ProfilePage() {
  const t = useT();
  const locale = useLocale();
  const phone = useMobileLayout();
  const identity = useApp((state) => state.identity);
  const signOut = useApp((state) => state.signOut);
  const decks = useApp((state) => state.decks);
  const selectDeck = useUi((state) => state.selectDeck);
  const popup = useCardPopup();

  // The showcase pick persists per account (see data/showcase.ts - the home
  // page's backdrop reads the same value).
  const showcaseId = useShowcaseId();
  const pickShowcase = (id: string) => {
    if (identity) writeShowcaseId(identity.userId, id);
  };

  // One profile fetch for the account age; omitted quietly when unreachable.
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((info) => {
        if (!cancelled && info.createdAt) setCreatedAt(info.createdAt);
      })
      .catch(() => {
        // stats degrade gracefully offline
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The record: lifetime aggregates, my decks broken down, and the games
  // themselves. All three are garnish - a failure leaves the section off
  // rather than blocking the page.
  const [stats, setStats] = useState<UserStats | null>(null);
  const [deckStats, setDeckStats] = useState<MyDeckStats[] | null>(null);
  const [history, setHistory] = useState<MatchRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [s, d, h] = await Promise.all([
        api.myStats().catch(() => null),
        api.myDeckStats().catch(() => null),
        api.matches().catch(() => null),
      ]);
      if (cancelled) return;
      setStats(s);
      setDeckStats(d);
      setHistory(h);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Only decks the table has actually rated can be ranked by saltiness, and a
  // single rater is identifiable in a duel - so a lone rating stays private.
  const ratedDecks = (deckStats ?? []).filter((deck) => deck.saltCount > 1);
  const saltiest = [...ratedDecks].sort((a, b) => b.salt - a.salt).slice(0, 3);
  const mostEndorsed = [...(deckStats ?? [])]
    .filter((deck) => deck.endorsements > 0)
    .sort((a, b) => b.endorsements - a.endorsements)
    .slice(0, 3);
  const rank = stats ? rankFor(stats.played) : null;
  const rate = stats ? winRate(stats) : null;
  // The competitive ladder, from the server's rating. Falls back to the seed
  // so a server that predates the column still renders a badge rather than a
  // hole - Silver III is what a brand-new account shows anyway.
  const division = stats ? divisionFor(stats.rating ?? RATING_SEED) : null;
  const tier = rank ? Math.max(0, RANKS.findIndex((r) => r.at === rank.floor)) : 0;

  const memberSince = (() => {
    if (!createdAt) return null;
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
  })();

  const showcaseDeck = showcaseId ? decks.find((deck) => deck.id === showcaseId) : undefined;
  // The showcase deck's wide art dresses the identity plate for every game,
  // not just MTG's scan URLs.
  const art = showcaseDeck ? deckSummaryArt(showcaseDeck) : '';

  const openDeck = (id: string) => {
    selectDeck(id);
    window.location.hash = '/decks';
  };

  return (
    <div className="page profilePage">
      {/* ---- identity plate: art band, rank insignia, win-rate ring ---- */}
      <header
        className="pfBand"
        data-has-art={art ? '' : undefined}
        /* The tier's colour drives the whole plate: the wash over the art, the
           portrait ring, the rank line, and the watermark behind it all. */
        style={rank ? ({ ['--pf-rank' as string]: rank.color }) : undefined}
      >
        {art && <div className="pfBandArt" style={{ backgroundImage: `url(${art})` }} aria-hidden />}
        <div className="pfBandScrim" aria-hidden />
        {rank && <div className="pfRankWash" aria-hidden />}
        {rank && (
          <div className="pfRankMark" aria-hidden>
            {division ? <RankBadge division={division} size={104} /> : <RankEmblem rank={rank} size={104} />}
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={signOut} className="pfSignOut">
          {t('pfSignOut')}
        </Button>
        <div className="pfBandMain">
          <div className="pfIdent">
            <span className="pfPortrait" data-ranked={rank ? '' : undefined}>
              {division ? (
                <RankAvatarFrame rank={division.rank} size={104}>
                  <Avatar name={identity?.username ?? '?'} size="xl" shape="circle" />
                </RankAvatarFrame>
              ) : (
                <Avatar name={identity?.username ?? '?'} size="xl" shape="rounded" />
              )}
              {/* Overall level rides the foot of the portrait - the ladder above
                  says how good, this says how long. */}
              {rank && <span className="pfLevelBadge">{rank.level}</span>}
            </span>
            <div className="pfIdText">
              {rank && (
                <span className="pfRankLine">
                  {division && (
                    <span
                      className="pfRankPill"
                      style={{ ['--rank-accent' as string]: RANK_META[division.rank].accent }}
                    >
                      <RankBadge division={division} size={22} />
                      {division.label}
                    </span>
                  )}
                  <RankLadder tier={tier} size={17} />
                  <span className="pfRankTitle">{rank.title}</span>
                  <span className="pfLevel">
                    {t('hmLevel')} {rank.level}
                  </span>
                </span>
              )}
              <Heading level={1} noMargin className="pfName">
                {identity?.username}
              </Heading>
              <Text size={Size.Small} tone={TextTone.Muted}>
                {t('pfTempId')}
              </Text>
              {rank && rank.next != null && stats && (
                <div className="pfNext">
                  <ProgressBar
                    value={Math.round(rank.progress * 100)}
                    max={100}
                    size="sm"
                    tone="accent"
                    aria-label={t('hmNextRank')}
                  />
                  <span className="pfNextLabel">
                    {rank.next - stats.played} {t('hmToNextRank')}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="pfRing">
            <ProgressRing
              value={rate ?? 0}
              max={100}
              size={phone ? 108 : 148}
              thickness={9}
              tone="accent"
              aria-label={t('hmWinRate')}
              label={
                <span className="pfRingLabel">
                  <span className="pfRingValue">{rate != null ? `${rate}%` : '—'}</span>
                  <span className="pfRingCaption">{t('hmWinRate')}</span>
                </span>
              }
            />
          </div>
        </div>
        <div className="pfBandFoot">
          <div className="pfShowcasePick">
            <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
              {t('pfFavDeck')}
            </Text>
            <Select
              size="lg"
              fullWidth
              options={decks.map((deck) => ({ value: deck.id, label: deck.name }))}
              value={showcaseId ?? undefined}
              onValueChange={pickShowcase}
              placeholder={t('pfChooseFav')}
              aria-label={t('pfFavDeck')}
            />
          </div>
          {/* The picker already names the deck, so this is only the commander
              and the way through to the deck itself - repeating the name beside
              the control it came from said nothing twice. */}
          {showcaseDeck?.commander && (
            <button type="button" className="pfShowcaseDeck" onClick={() => openDeck(showcaseDeck.id)}>
              <Text as="span" size={Size.Small} tone={TextTone.Muted}>
                {showcaseDeck.commander}
              </Text>
            </button>
          )}
        </div>
      </header>

      {/* ---- lifetime stats as big chamfered plates ---- */}
      <section className="pfPlates" aria-label={t('hmCareer')}>
        <Heading level={2} noMargin className="pfKicker">
          {t('hmCareer')}
        </Heading>
        <div className="pfPlateRow">
          <Plate value={decks.length} label={t('pfDeckCount')} />
          {memberSince && <Plate value={memberSince} label={t('pfMemberSince')} fit="text" />}
          {stats && stats.played > 0 && (
            <>
              <Plate value={stats.wins} label={t('hmWins')} />
              <Plate value={stats.losses} label={t('pfLosses')} />
              <Plate value={stats.played} label={t('hmGames')} />
              <Plate
                value={
                  <>
                    <ThumbsUp size={16} aria-hidden /> {stats.endorsements}
                  </>
                }
                label={t('pmEndorseCount')}
                tone="endorse"
              />
              <Plate
                value={
                  <>
                    {/* Held back at a single rater: in a duel, one rating names
                        its rater - the same threshold the lobby and the deck
                        boards below use. */}
                    <SaltPile size={16} aria-hidden /> {stats.saltCount > 1 ? stats.salt.toFixed(1) : '—'}
                  </>
                }
                label={t('pfSalt')}
                tone="salt"
                hint={t('pfSaltHint')}
              />
            </>
          )}
        </div>
      </section>

      {/* Your decks, judged by the people who had to play against them. Salt
          rates a DECK, never its owner, so every label here says so. */}
      {(saltiest.length > 0 || mostEndorsed.length > 0) && (
        <section className="pfRep">
          <Heading level={2} noMargin className="pfKicker">
            {t('pfDeckRep')}
          </Heading>
          <Text tone={TextTone.Muted} className="pfRepLede">
            {t('pfDeckRepLede')}
          </Text>
          <div className="pfRepCols">
            {saltiest.length > 0 && (
              <div className="pfRepCol" data-tone="salt">
                <span className="pfRepHead">
                  <SaltPile size={14} aria-hidden /> {t('pfSaltiest')}
                </span>
                {saltiest.map((deck, index) => (
                  <div key={deck.deckId} className="pfRepRow">
                    <span className="pfRepIndex" aria-hidden>
                      {index + 1}
                    </span>
                    <span className="pfRepName">{deck.name ?? t('dbUntitled')}</span>
                    <span className="pfRepFig">
                      {deck.salt.toFixed(1)}
                      <span className="pfRepCount">({deck.saltCount})</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {mostEndorsed.length > 0 && (
              <div className="pfRepCol" data-tone="endorse">
                <span className="pfRepHead">
                  <ThumbsUp size={14} aria-hidden /> {t('pfMostEndorsed')}
                </span>
                {mostEndorsed.map((deck, index) => (
                  <div key={deck.deckId} className="pfRepRow">
                    <span className="pfRepIndex" aria-hidden>
                      {index + 1}
                    </span>
                    <span className="pfRepName">{deck.name ?? t('dbUntitled')}</span>
                    <span className="pfRepFig">{deck.endorsements}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---- service record: the same matches the Play page logs, dressed in
              this page's own career idiom (no shared classes) ---- */}
      {history != null && history.length > 0 && (
        <section className="pfLog">
          <Heading level={2} noMargin className="pfKicker">
            {t('pfService')}
          </Heading>
          <div className="pfLogList">
            {history.map((match, index) => {
              const others = match.players
                .map((player) => player.username)
                .filter((name) => name !== identity?.username);
              return (
                <article key={`${match.playedAt}-${index}`} className="pfLogRow">
                  <span
                    className="pfLogResult"
                    data-result={match.won == null ? undefined : match.won ? 'win' : 'loss'}
                  >
                    {match.won == null ? '·' : match.won ? t('pmWinAbbr') : t('pmLossAbbr')}
                  </span>
                  <div className="pfLogMain">
                    <span className="pfLogName">
                      <GameTag game={match.game} showName={false} /> {match.name || t('playTitle')}
                    </span>
                    <span className="pfLogWith">
                      {others.length > 0 ? `${t('plWith')} ${others.join(', ')}` : t('plSolo')}
                    </span>
                  </div>
                  {match.matchId && (
                    <div className="pfLogStats">
                      {match.winnerUsername && (
                        <span className="pfLogStat">
                          <Crown size={12} aria-hidden /> {match.winnerUsername}
                        </span>
                      )}
                      {match.turns != null && (
                        <span className="pfLogStat">
                          {match.turns} {t('pmTurnsWord')}
                        </span>
                      )}
                      {match.durationMs != null && <span className="pfLogStat">{fmtDuration(match.durationMs)}</span>}
                      {match.cardsPlayed != null && (
                        <span className="pfLogStat">
                          <PlayingCard size={12} aria-hidden /> {match.cardsPlayed}
                        </span>
                      )}
                    </div>
                  )}
                  <span className="pfLogWhen">{relativeWhen(match.playedAt, locale)}</span>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <Heading level={2}>{t('pfPrecons')}</Heading>
        <Text tone={TextTone.Muted}>{t('pfPreconsLede')}</Text>

        <div className="preconGrid">
          {PRECONS.map((deck, index) => {
            const commander = preconCommander(deck);
            const identityColors = COLOR_ORDER.filter((color) => commander.colorIdentity.includes(color));
            const owned = decks.find((entry) => entry.name === deck.name);
            return (
              <article
                key={deck.id}
                className="preconCard pfPreconIn"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div
                  className="preconHero"
                  style={{ backgroundImage: `url(${commanderArt(commander.id)})` }}
                  aria-hidden
                />
                <div className="preconBody">
                  <div className="preconArtCard">
                    <DeckStack
                      name={commander.name}
                      imageUrl={cardImage(commander.id)}
                      width={140}
                      onClick={() => popup.open({ scryfallId: commander.id, name: commander.name, foil: true })}
                    />
                  </div>
                  <div className="preconInfo">
                    <Pill size="sm" variant="outline">
                      {gameTag(deck.id, deck.name)}
                    </Pill>
                    <Heading level={3} noMargin>
                      {deck.name.replace(/\s*\([^)]*\)\s*$/, '')}
                    </Heading>
                    <Text size={Size.Small} tone={TextTone.Muted}>
                      {commander.name}
                    </Text>
                    <span className="preconPips" aria-hidden>
                      {identityColors.map((color) => (
                        <i key={color} style={{ background: PIP[color] }} />
                      ))}
                    </span>
                    <Text size={Size.Small} tone={TextTone.Subtle}>
                      {deck.strategy}
                    </Text>
                    {owned && (
                      <Button size="sm" variant="soft" onClick={() => openDeck(owned.id)}>
                        {t('navDecks')} →
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
