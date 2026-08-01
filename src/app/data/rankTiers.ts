/**
 * The competitive ladder: eight ranks, five tiers each, plus an untiered apex.
 *
 * This is DELIBERATELY separate from `ranks.ts`. That file is the lifetime-games
 * flavour ladder (Fresh Meat -> Legend) which every game feeds, including bot
 * practice and tables with friends. This one is the competitive ladder, which
 * only ranked play moves. Two progressions on purpose: playing with friends
 * should never be a thing you avoid to protect a number.
 *
 * Art lives at `public/ranks/` - see `~/Desktop/pc-rank-art-prompts.md` for the
 * generation brief and the material direction behind each rank.
 */

/** The eight rungs, lowest first. */
export const RANK_IDS = [
  'iron',
  'bronze',
  'silver',
  'gold',
  'platinum',
  'emerald',
  'diamond',
  'mythic',
] as const;

export type RankId = (typeof RANK_IDS)[number];

/** Tiers run V (entry) to I (top). Mythic has none - it carries a ladder
 *  position instead, the way Arena's Mythic and LoL's Challenger do. */
export const TIERS = [5, 4, 3, 2, 1] as const;
export type Tier = (typeof TIERS)[number];

/** Roman numerals for display; the numeral is live type, never baked art. */
export const TIER_NUMERAL: Record<Tier, string> = {
  5: 'V',
  4: 'IV',
  3: 'III',
  2: 'II',
  1: 'I',
};

/**
 * Rating width of one rank. Every tiered rank spans the same width and splits
 * evenly into five divisions, so a division is always 60 rating points and
 * "one division" means the same amount of work at Iron as at Diamond.
 */
export const RANK_SPAN = 300;
export const DIVISION_SPAN = RANK_SPAN / 5;

/** Where Iron V begins. Ratings below this floor clamp to it. */
export const RATING_FLOOR = 600;

/** A new account starts here - the middle of Silver, so the ladder can sort a
 *  player upward or downward without either direction feeling like a punishment. */
export const RATING_SEED = RATING_FLOOR + RANK_SPAN * 2 + DIVISION_SPAN * 2;

/** Mythic begins where Diamond I ends: there is no Mythic V. */
export const MYTHIC_FLOOR = RATING_FLOOR + RANK_SPAN * 7;

/** Per-rank display metadata. `accent` is the emblem's dominant hue, measured
 *  from the art itself, for tinting chrome that sits beside the badge. */
export const RANK_META: Record<RankId, { name: string; accent: string }> = {
  iron: { name: 'Iron', accent: 'oklch(0.62 0.02 209)' },
  bronze: { name: 'Bronze', accent: 'oklch(0.58 0.11 40)' },
  silver: { name: 'Silver', accent: 'oklch(0.78 0.03 216)' },
  gold: { name: 'Gold', accent: 'oklch(0.76 0.14 85)' },
  platinum: { name: 'Platinum', accent: 'oklch(0.82 0.04 196)' },
  emerald: { name: 'Emerald', accent: 'oklch(0.60 0.14 151)' },
  diamond: { name: 'Diamond', accent: 'oklch(0.72 0.12 215)' },
  mythic: { name: 'Mythic', accent: 'oklch(0.65 0.20 30)' },
};

export interface Division {
  rank: RankId;
  /** null at Mythic, which is untiered. */
  tier: Tier | null;
  /** "Gold III" / "Mythic". */
  label: string;
  /** Rating at which this division starts. */
  floor: number;
  /** Rating at which the next division starts; null at the top of Mythic. */
  ceiling: number | null;
  /** 0..1 through this division. Mythic reports 1 - it has no ceiling. */
  progress: number;
}

/**
 * Map a rating onto its division.
 *
 * Ratings are clamped at the floor rather than allowed to go negative: a player
 * on a long losing run should bottom out at Iron V, not fall off the ladder.
 */
export function divisionFor(rating: number): Division {
  const clamped = Math.max(RATING_FLOOR, Math.round(rating));

  if (clamped >= MYTHIC_FLOOR) {
    return {
      rank: 'mythic',
      tier: null,
      label: RANK_META.mythic.name,
      floor: MYTHIC_FLOOR,
      ceiling: null,
      progress: 1,
    };
  }

  const above = clamped - RATING_FLOOR;
  const rankIndex = Math.min(6, Math.floor(above / RANK_SPAN));
  const withinRank = above - rankIndex * RANK_SPAN;
  const divisionIndex = Math.min(4, Math.floor(withinRank / DIVISION_SPAN));
  // Division 0 of a rank is its ENTRY tier, which is tier V - so the numeral
  // counts down as the index counts up.
  const tier = (5 - divisionIndex) as Tier;
  const rank = RANK_IDS[rankIndex]!;
  const floor = RATING_FLOOR + rankIndex * RANK_SPAN + divisionIndex * DIVISION_SPAN;

  return {
    rank,
    tier,
    label: `${RANK_META[rank].name} ${TIER_NUMERAL[tier]}`,
    floor,
    ceiling: floor + DIVISION_SPAN,
    progress: (clamped - floor) / DIVISION_SPAN,
  };
}

/** Every division on the ladder, lowest first. For the ladder gallery. */
export function allDivisions(): Division[] {
  const out: Division[] = [];
  for (let r = 0; r < 7; r++) {
    for (let d = 0; d < 5; d++) {
      out.push(divisionFor(RATING_FLOOR + r * RANK_SPAN + d * DIVISION_SPAN));
    }
  }
  out.push(divisionFor(MYTHIC_FLOOR));
  return out;
}

// ---- art -------------------------------------------------------------------

const BASE = import.meta.env.BASE_URL;

/** The rank emblem: the badge itself. 512px square, transparent. */
export const rankEmblem = (rank: RankId): string => `${BASE}ranks/${rank}.webp`;

/** The avatar ring for a rank. Its centre is transparent - the portrait shows
 *  through it, so it composites OVER an avatar rather than beside one. */
export const rankFrame = (rank: RankId): string => `${BASE}ranks/frames/${rank}.webp`;

/** The wide profile-header backdrop. No alpha; it is a background, not an overlay. */
export const rankBanner = (rank: RankId): string => `${BASE}ranks/banners/${rank}.webp`;

/** The nameplate the rank label sits on. */
export const RANK_PLATE = `${BASE}ranks/plate.webp`;
