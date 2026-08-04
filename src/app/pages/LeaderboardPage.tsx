import { useEffect, useMemo, useState } from 'react';
import { Avatar, Heading, Pill, ProgressBar, SegmentedControl, Size, Text, TextTone } from '@glacier/react';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import * as api from '../net/api.ts';
import type { LadderEntry, UserStats } from '../net/types.ts';
import { RankBadge } from '../components/RankBadge.tsx';
import { divisionFor, RATING_SEED } from '../data/rankTiers.ts';
import { EmptyFan } from '../components/Skeletons.tsx';
import './social.css';

/**
 * The global ladder.
 *
 * Only players who have FINISHED a ranked match appear: every account seeds at
 * the same rating, so listing everyone would open the board with a wall of
 * identical numbers in signup order - which reads as a ranking and is not one.
 *
 * Two views over the same data. "Everyone" is the board; "Friends" filters it
 * to the roster, which is the question actually being asked most of the time -
 * a global #1400 means nothing next to knowing you are third among the people
 * you play with.
 */
export function LeaderboardPage() {
  const t = useT();
  const identity = useApp((state) => state.identity);
  const friends = useApp((state) => state.friends);
  const refreshFriends = useApp((state) => state.refreshFriends);

  const [entries, setEntries] = useState<LadderEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [scope, setScope] = useState<'all' | 'friends'>('all');

  useEffect(() => {
    let live = true;
    api
      .leaderboard(200)
      .then((payload) => {
        if (live) setEntries(payload.entries ?? []);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    void refreshFriends();
    return () => {
      live = false;
    };
  }, [refreshFriends]);

  const friendIds = useMemo(
    () => new Set(friends.friends.map((f) => f.userId)),
    [friends.friends],
  );

  const shown = useMemo(() => {
    if (!entries) return [];
    if (scope === 'all') return entries;
    // My own row stays in the friends view: a board of everyone I know that
    // does not say where I sit among them is half an answer.
    return entries.filter((e) => friendIds.has(e.userId) || e.userId === identity?.userId);
  }, [entries, scope, friendIds, identity?.userId]);

  // My standing comes from /api/me/stats, NOT from the fetched page of the
  // ladder. The list is the top 200; a player outside it was finding no row
  // for themselves and being told they were unplaced, which is the one group
  // that most needs to see where they stand. The server ranks the whole table
  // (db::ladder_position), so this is a true global position at any depth.
  const [stats, setStats] = useState<UserStats | null>(null);
  useEffect(() => {
    let live = true;
    api
      .myStats()
      .then((next) => {
        if (live) setStats(next);
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, []);

  const rating = stats?.rating ?? RATING_SEED;
  const division = divisionFor(rating);
  const placed = stats != null && stats.position != null && (stats.wins + stats.losses) > 0;
  // How much rating stands between me and the next division, and how far
  // through this one I already am. Mythic has no ceiling, so it has no "next".
  const toNext = division.ceiling != null ? Math.max(0, division.ceiling - rating) : null;
  const nextDivision = division.ceiling != null ? divisionFor(division.ceiling) : null;
  // The player one rung above me on the ladder, when the fetched page reaches
  // that far: "12 rating behind Wren" is a target in a way "#48" is not.
  const ahead = useMemo(() => {
    if (!entries || stats?.position == null) return null;
    return entries.find((e) => e.position === (stats.position as number) - 1) ?? null;
  }, [entries, stats?.position]);

  return (
    <div className="lbPage">
      <header className="lbHead">
        <Heading level={1} noMargin>
          {t('lbTitle')}
        </Heading>
        <Text size={Size.Small} tone={TextTone.Subtle}>
          {t('lbSub')}
        </Text>
      </header>

      {/* Where I sit, before the list - the first thing anyone opening a
          leaderboard wants, and otherwise a scroll away or nowhere at all. */}
      {placed && stats ? (
        <section className="lbMine">
          <span aria-hidden>
            <RankBadge division={division} size={44} />
          </span>
          <div className="lbMineWho">
            <span className="lbMineLabel">{division.label}</span>
            <span className="lbMineSub">
              {t('lbYouAre')} #{stats.position} · {rating} · {stats.wins}W {stats.losses}L
            </span>
            {/* Where the progression is, and where it has to get to. A bar on
                its own only says "somewhere in this division"; the rating it
                takes to leave, and the name of what is next, are the parts a
                player can actually aim at. */}
            <div className="lbProgress">
              <ProgressBar
                value={Math.round(division.progress * 100)}
                max={100}
                size="sm"
                aria-label={t('lbToNext')}
              />
              <span className="lbProgressNote">
                {toNext != null && nextDivision ? (
                  <>
                    {toNext} {t('lbToNext')} <strong>{nextDivision.label}</strong>
                  </>
                ) : (
                  t('lbTopRank')
                )}
                {ahead && (
                  <>
                    {' · '}
                    {Math.max(0, ahead.rating - rating + 1)} {t('lbBehind')} {ahead.username}
                  </>
                )}
              </span>
            </div>
          </div>
        </section>
      ) : entries && identity ? (
        <section className="lbMine lbMineEmpty">
          <span aria-hidden>
            <RankBadge division={divisionFor(0)} size={44} />
          </span>
          <div className="lbMineWho">
            <span className="lbMineLabel">{t('lbUnplaced')}</span>
            <span className="lbMineSub">{t('lbUnplacedHint')}</span>
          </div>
        </section>
      ) : null}

      <div className="lbScope">
        <SegmentedControl
          aria-label={t('lbScope')}
          value={scope}
          onValueChange={(v) => setScope(v as 'all' | 'friends')}
          options={[
            { value: 'all', label: t('lbEveryone') },
            { value: 'friends', label: t('lbFriends') },
          ]}
        />
      </div>

      {failed ? (
        <EmptyFan quip={t('lbFailed')} />
      ) : !entries ? (
        <EmptyFan quip={t('lbLoading')} />
      ) : shown.length === 0 ? (
        <EmptyFan quip={scope === 'friends' ? t('lbNoFriends') : t('lbEmpty')} />
      ) : (
        <ol className="lbList">
          {shown.map((entry) => {
            const division = divisionFor(entry.rating);
            const isMe = entry.userId === identity?.userId;
            return (
              <li
                key={entry.userId}
                className={isMe ? 'lbRow lbRowMe' : 'lbRow'}
                data-top={entry.position <= 3 || undefined}
              >
                <span className="lbPos">#{entry.position}</span>
                <Avatar name={entry.username} size="sm" />
                <span className="lbName">{entry.username}</span>
                {/* aria-hidden: .lbDivision beside it is the label, and the
                    badge would otherwise announce the same rank again. */}
                <span aria-hidden>
                  <RankBadge division={division} size={22} />
                </span>
                <span className="lbDivision">{division.label}</span>
                <span className="lbRating">{entry.rating}</span>
                <span className="lbRecord">
                  {entry.wins}W · {entry.losses}L
                </span>
                {entry.endorsements > 0 && (
                  <Pill size="sm" tone="accent" variant="soft">
                    ♥ {entry.endorsements}
                  </Pill>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
