import { cloneElement, useEffect, useRef, useState, type ReactElement } from 'react';
import { Popover, ProgressBar, Size, Text, TextTone } from '@glacier/react';
import type { MyDeckStats, UserStats } from '../net/types.ts';
import { winRate } from '../data/ranks.ts';
import { RATING_SEED } from '../data/rankTiers.ts';
import { useT } from '../i18n.ts';
import './heroStatsPanel.css';

/** Rest this long before the panel opens, so crossing the badge on the way to
 *  the menu beside it does not pop a card over the page. Same numbers as
 *  ProfileChip, because it is the same gesture. */
const OPEN_DELAY_MS = 320;
/** And keep it alive this long after leaving, to bridge the gap between the
 *  badge and the panel under it. */
const CLOSE_GRACE_MS = 180;

/** How many decks the panel lists before it stops. Five is about the number a
 *  player actually rotates; past that the panel is taller than the hero it
 *  hangs off, and the full list is what the Decks page is for. */
const DECK_ROWS = 5;

/**
 * The hover panel under the hero badge: the record behind the rank it shows.
 *
 * The badge names a division and draws a bar toward the next one, which says
 * where the player STANDS but nothing about how they got there. This fills
 * that in on hover - the raw rating and ladder place the badge rounds off to a
 * label, the win/loss record, and which decks are actually earning it.
 *
 * It deliberately does not repeat the badge: no name, no avatar, no division.
 * Those are an inch above it and already on screen.
 *
 * Costs no network. Home already fetches both of these for the Career strip
 * and the deck rail, so this is a second reading of numbers the page has.
 */
export function HeroStatsPanel({
  stats,
  deckStats,
  trigger,
}: {
  stats: UserStats | null;
  deckStats: Map<string, MyDeckStats> | null;
  /** The badge itself. Popover clones it in place rather than wrapping it, so
   *  the badge keeps the absolute positioning home.css gives it. */
  trigger: ReactElement;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);

  // Hover is an enhancement, not the way in: Popover puts a click toggle on
  // the trigger, so a tap opens the panel on a touch screen. The timers are
  // gated because mobile browsers synthesise a mouseenter just before that
  // click - the open timer and the tap would race, and the tap would read as
  // doing nothing at all.
  const [canHover] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches,
  );

  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const openSoon = () => {
    window.clearTimeout(closeTimer.current);
    openTimer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };
  const closeSoon = () => {
    window.clearTimeout(openTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  };

  const hover = canHover ? { onMouseEnter: openSoon, onMouseLeave: closeSoon } : {};
  const rate = stats ? winRate(stats) : null;

  // Most-played first, and a deck that has never hit a table is not listed at
  // all - a row of dashes is noise, and `played` is exactly the filter that
  // removes it. Ties break on recency so the deck of the moment sits above an
  // equally-played one from months ago.
  const decks = [...(deckStats?.values() ?? [])]
    .filter((deck) => deck.played > 0)
    .sort((a, b) => b.played - a.played || (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
    .slice(0, DECK_ROWS);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-end"
      className="heroStatsPanel"
      aria-label={t('hmCareer')}
      trigger={cloneElement(trigger as ReactElement<Record<string, unknown>>, hover)}
    >
      {/* The panel is part of the hover target: you can slide down off the
          badge into it without it closing under the pointer. */}
      <div
        className="hsCard"
        onMouseEnter={() => window.clearTimeout(closeTimer.current)}
        onMouseLeave={closeSoon}
      >
        <div className="hsTop">
          <div className="hsFigure">
            <Text as="span" className="hsFigureValue" weight="bold">
              {stats?.rating ?? RATING_SEED}
            </Text>
            <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
              {t('hsRating')}
            </Text>
          </div>
          <div className="hsFigure">
            <Text as="span" className="hsFigureValue" weight="bold">
              {/* Never having finished a ranked match is not 0th place, it is
                  not being on the ladder - so it says so rather than printing
                  a position the player does not hold. */}
              {stats?.position == null ? '—' : `#${stats.position}`}
            </Text>
            <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
              {stats?.position == null ? t('lbUnplaced') : t('navLeaderboard')}
            </Text>
          </div>
        </div>

        <dl className="hsRecord">
          {(
            [
              [t('hmWins'), stats?.wins ?? 0],
              [t('pfLosses'), stats?.losses ?? 0],
              [t('hmWinRate'), rate === null ? '—' : `${rate}%`],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt>
                <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                  {label}
                </Text>
              </dt>
              <dd>
                <Text as="span" size={Size.Small} weight="semibold">
                  {value}
                </Text>
              </dd>
            </div>
          ))}
        </dl>

        <div className="hsDecks">
          <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="hsDecksHead">
            {t('decksTitle')}
          </Text>
          {decks.length === 0 ? (
            <Text as="p" size={Size.XSmall} tone={TextTone.Subtle} className="hsEmpty">
              {t('hsNoDecks')}
            </Text>
          ) : (
            <ul className="hsDeckList">
              {decks.map((deck) => {
                const deckRate = winRate(deck);
                return (
                  <li key={deck.deckId} className="hsDeckRow">
                    <Text as="span" size={Size.XSmall} className="hsDeckName">
                      {deck.name ?? '—'}
                    </Text>
                    <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="hsDeckRec">
                      {deck.wins}W {deck.losses}L
                    </Text>
                    <ProgressBar
                      value={deckRate ?? 0}
                      max={100}
                      size="sm"
                      tone="accent"
                      className="hsDeckBar"
                      aria-label={`${deck.name ?? ''} ${t('hmWinRate')}`}
                    />
                    <Text as="span" size={Size.XSmall} className="hsDeckRate">
                      {deckRate === null ? '—' : `${deckRate}%`}
                    </Text>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Popover>
  );
}
