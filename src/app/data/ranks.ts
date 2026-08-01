import type { UserStats } from '../net/types.ts';

/**
 * Player ranking + rating helpers, shared by every surface that grades a player
 * (the Home hero, the pregame lobby roster, the matchup splash). Ranks are a
 * flavor ladder unlocked by lifetime games played; level is sqrt-scaled so it
 * keeps ticking up long after the last title. Everything here is derived from
 * the server's UserStats aggregate - there is no separate rating column.
 */

/** Flavor rank titles, unlocked by lifetime games played.
 *
 * Each tier carries its own IDENTITY - a hue and an emblem shape - so a rank
 * is something you see across a room rather than a word you read. The colours
 * are OKLCH so they hold their weight in both themes, and they climb a
 * deliberate ladder: dull iron at the bottom, through steel and bronze and
 * silver, to gold at the top. `emblem` names the shape RankEmblem draws. */
export const RANKS: {
  at: number;
  title: string;
  /** The tier's colour, used for the emblem, the portrait ring, and the
   *  hero wash behind the identity plate. */
  color: string;
  /** Which insignia RankEmblem draws for this tier. */
  emblem: 'pip' | 'chevron' | 'chevron2' | 'star' | 'wreath' | 'crown' | 'laurel';
}[] = [
  { at: 0, title: 'Fresh Meat', color: 'oklch(0.62 0.02 260)', emblem: 'pip' },
  { at: 1, title: 'Rookie', color: 'oklch(0.68 0.09 235)', emblem: 'chevron' },
  { at: 10, title: 'Regular', color: 'oklch(0.70 0.13 195)', emblem: 'chevron2' },
  { at: 30, title: 'Sharp', color: 'oklch(0.72 0.15 150)', emblem: 'star' },
  { at: 75, title: 'Veteran', color: 'oklch(0.74 0.15 85)', emblem: 'wreath' },
  { at: 150, title: 'Ringer', color: 'oklch(0.74 0.17 55)', emblem: 'crown' },
  { at: 300, title: 'Legend', color: 'oklch(0.80 0.16 95)', emblem: 'laurel' },
];

export interface RankInfo {
  title: string;
  /** Index into RANKS - the tier, for emblem and styling lookups. */
  tier: number;
  /** This tier's identity colour. */
  color: string;
  /** This tier's emblem shape (see RankEmblem). */
  emblem: (typeof RANKS)[number]['emblem'];
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
  const rank = RANKS[idx]!;
  return {
    title: rank.title,
    tier: idx,
    color: rank.color,
    emblem: rank.emblem,
    level: Math.floor(Math.sqrt(played)) + 1,
    floor,
    next,
    progress,
  };
}

/** Win rate as a 0-100 integer, or null with no games played. */
export function winRate(stats: Pick<UserStats, 'wins' | 'played'>): number | null {
  return stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : null;
}
