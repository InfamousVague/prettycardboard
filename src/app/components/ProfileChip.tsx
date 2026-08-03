import { useEffect, useRef, useState } from 'react';
import { Avatar, Pill, Popover, Size, Text, TextTone } from '@glacier/react';
import { myStats } from '../net/api.ts';
import type { UserStats } from '../net/types.ts';
import { rankFor, winRate } from '../data/ranks.ts';
import { divisionFor, RATING_SEED } from '../data/rankTiers.ts';
import { useT } from '../i18n.ts';
import { RankBadge } from './RankBadge.tsx';
import './profileChip.css';

/** Rest this long before the preview opens, so crossing the title bar on the
 *  way to somewhere else does not pop a panel over the page. */
const OPEN_DELAY_MS = 320;
/** And keep it alive this long after leaving, to bridge the gap between the
 *  avatar and the panel below it. */
const CLOSE_GRACE_MS = 180;

/**
 * The account chip in the title bar: who you are, and the way to your profile.
 *
 * Profile used to be a destination in the left rail, which put it beside the
 * places you GO - Home, Decks, Browse - when it is really a thing you ARE. The
 * avatar was already sitting in the title bar saying whose app this is; this
 * makes that avatar the door, and the rail one row shorter.
 *
 * Resting on it previews the profile rather than making you visit it: name,
 * competitive division, and the record. Desktop only, and hover only - the
 * phone shell has no title bar, and Profile stays in its You sheet there.
 */
export function ProfileChip({
  username,
  onOpenProfile,
}: {
  username: string;
  onOpenProfile: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);
  // First hover pays for the fetch; every later one is instant. Nothing about
  // the title bar needs these numbers until someone asks to see them, so this
  // costs a logged-in player who never hovers exactly nothing.
  const asked = useRef(false);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open || asked.current) return;
    asked.current = true;
    let alive = true;
    myStats()
      .then((next) => {
        if (alive) setStats(next);
      })
      // A profile preview is not worth a toast. The panel still names the
      // player; it just has no record to show yet.
      .catch(() => {
        if (alive) asked.current = false;
      });
    return () => {
      alive = false;
    };
  }, [open]);

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

  const division = divisionFor(stats?.rating ?? RATING_SEED);
  const rank = rankFor(stats?.played ?? 0);
  const rate = stats ? winRate(stats) : null;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-end"
      className="profileChipPanel"
      aria-label={t('navProfile')}
      trigger={
        <button
          type="button"
          className="profileChipBtn"
          aria-label={t('navProfile')}
          onMouseEnter={openSoon}
          onMouseLeave={closeSoon}
          onFocus={() => setOpen(true)}
          onBlur={closeSoon}
          onClick={() => {
            setOpen(false);
            onOpenProfile();
          }}
        >
          <Avatar name={username} size="sm" />
        </button>
      }
    >
      {/* The panel is part of the hover target: you can slide down into it
          without it closing under the pointer. */}
      <div
        className="profileChipCard"
        onMouseEnter={() => window.clearTimeout(closeTimer.current)}
        onMouseLeave={closeSoon}
      >
        <div className="profileChipHead">
          <Avatar name={username} size="md" />
          <div className="profileChipWho">
            <Text as="span" weight="semibold">
              {username}
            </Text>
            <Pill size="sm" variant="soft">
              {t('hmLevel')} {rank.level}
            </Pill>
          </div>
        </div>
        <div className="profileChipRank">
          <RankBadge division={division} size={34} />
          <div className="profileChipRankText">
            <Text as="span" size={Size.Small} weight="semibold">
              {division.label}
            </Text>
            <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
              {stats?.rating ?? RATING_SEED}
            </Text>
          </div>
        </div>
        <dl className="profileChipStats">
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
      </div>
    </Popover>
  );
}
