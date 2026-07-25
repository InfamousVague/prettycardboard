import type { UserStats } from '../net/types.ts';

/**
 * Player ranking + rating helpers, shared by every surface that grades a player
 * (the Home hero, the pregame lobby roster, the matchup splash). Ranks are a
 * flavor ladder unlocked by lifetime games played; level is sqrt-scaled so it
 * keeps ticking up long after the last title. Everything here is derived from
 * the server's UserStats aggregate - there is no separate rating column.
 */

/** Flavor rank titles, unlocked by lifetime games played. */
export const RANKS: { at: number; title: string }[] = [
  { at: 0, title: 'Fresh Meat' },
  { at: 1, title: 'Rookie' },
  { at: 10, title: 'Regular' },
  { at: 30, title: 'Sharp' },
  { at: 75, title: 'Veteran' },
  { at: 150, title: 'Ringer' },
  { at: 300, title: 'Legend' },
];

export interface RankInfo {
  title: string;
  /** Sqrt-scaled level; keeps rising past the top title. */
  level: number;
  /** Games played at which the current rank unlocked. */
  floor: number;
  /** Games needed for the next rank, or null at the top of the ladder. */
  next: number | null;
  /** 0..1 progress from this rank's floor toward the next (1 at the cap). */
  progress: number;
}

/** Rank title + level + progress toward the next rank, from lifetime games. */
export function rankFor(played: number): RankInfo {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (played >= RANKS[i]!.at) idx = i;
  const floor = RANKS[idx]!.at;
  const next = idx + 1 < RANKS.length ? RANKS[idx + 1]!.at : null;
  const progress = next == null ? 1 : Math.min(1, (played - floor) / (next - floor));
  return { title: RANKS[idx]!.title, level: Math.floor(Math.sqrt(played)) + 1, floor, next, progress };
}

/** Win rate as a 0-100 integer, or null with no games played. */
export function winRate(stats: Pick<UserStats, 'wins' | 'played'>): number | null {
  return stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : null;
}
