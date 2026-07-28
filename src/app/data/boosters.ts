import type { PoolCard, Rarity, SetPool } from './boosterSets.ts';

/**
 * Booster structures and pull rates, as Magic actually printed them.
 *
 * Scryfall has no booster data of any kind, so the slot structures here are
 * encoded from Wizards' published collation (the "Collecting <Set>" articles,
 * Project Booster Fun, the Play Booster announcement) and cross-checked
 * against MTGJSON's per-set sheet weights. The one number that is NOT
 * hardcoded is the mythic rate: mythics share the rare print sheet, where each
 * rare appears twice and each mythic once, so the real odds fall out of the
 * set's own rarity counts - see `mythicChance`.
 *
 * Everything is expressed as slots over a set's pool, which is how packs are
 * physically collated: a slot draws from a print sheet, not from "the set".
 */

/** Which structure a set's boosters used. */
export type BoosterEra = 'classic' | 'unified-foil' | 'mythic' | 'modern-foil' | 'late-draft' | 'play';

export interface SlotOdds {
  common: number;
  uncommon: number;
  rare: number;
  mythic: number;
}

export interface BoosterSpec {
  era: BoosterEra;
  /** Booster product name, as players know it. */
  label: string;
  /** One line explaining what is being simulated, shown under the pack. */
  note: string;
  /** Playable cards per pack (the marketing/token card is not counted). */
  size: number;
  commons: number;
  uncommons: number;
  rares: number;
  /** A basic land slot (Shards of Alara onward for expansions). */
  land: boolean;
  /** Chance the pack contains the unified foil slot, which replaces a common. */
  foilChance: number;
  /** Rarity mix of that foil slot. */
  foilOdds: SlotOdds;
  /** Play Boosters only: the guaranteed non-foil wildcard. */
  wildcard?: SlotOdds;
  /** Pre-Time-Spiral sets: a foil replaced the card of its OWN rarity. */
  perRarityFoil?: boolean;
}

// Era boundaries, by the set that introduced each change.
const COLDSNAP = '2006-07-21'; // unified foil sheet: the foil replaces a common
const SHARDS = '2008-10-03'; // mythic rare debuts
const M20 = '2019-07-12'; // foil rate 1 in 67 cards -> 1 in 45
const ZENDIKAR_RISING = '2020-09-25'; // mythic rate moves off the sheet math to ~1:7.4
const KARLOV_MANOR = '2024-02-09'; // Play Boosters replace Draft and Set Boosters

/** The foil sheet has been 60% common / 25% uncommon / 15% rare-or-mythic
 *  since the unified sheet arrived; the rare share splits by the set's own
 *  mythic ratio, which `resolveFoilOdds` applies. */
const FOIL_SHEET: SlotOdds = { common: 0.6, uncommon: 0.25, rare: 0.15, mythic: 0 };

/** Play Booster foil wildcard, averaged over the sets Wizards has published. */
const PLAY_FOIL: SlotOdds = { common: 0.6, uncommon: 0.3, rare: 0.085, mythic: 0.015 };

/** Play Booster non-foil wildcard - the 2025-era mix (uncommon-heavy). */
const PLAY_WILDCARD: SlotOdds = { common: 0.15, uncommon: 0.65, rare: 0.175, mythic: 0.025 };

/**
 * The odds a rare slot yields a mythic. Mythics are printed on the rare sheet
 * at half the frequency of a rare, so with R rares and M mythics the sheet has
 * 2R + M slots and P(mythic) = M / (2R + M) - about 1 in 8 for a set with 53
 * rares and 15 mythics. From Zendikar Rising on, Wizards set the rate directly
 * (~1 in 7.4), and Play Boosters publish a flat 1 in 7.
 */
export function mythicChance(pool: SetPool, released: string): number {
  const rares = pool.rare.length;
  const mythics = pool.mythic.length;
  if (mythics === 0) return 0;
  if (released >= KARLOV_MANOR) return 1 / 7;
  if (released >= ZENDIKAR_RISING) return 1 / 7.4;
  const slots = 2 * rares + mythics;
  return slots > 0 ? mythics / slots : 0;
}

/** The booster a set of this vintage shipped in. */
export function specFor(released: string, setType: string): BoosterSpec {
  if (released >= KARLOV_MANOR) {
    return {
      era: 'play',
      label: 'Play Booster',
      note: '14 cards: 7 commons, 3 uncommons, a rare or mythic, two wildcards (one always foil) and a land.',
      size: 14,
      // Seven, not six: the last common slot is the one Wizards gives over to a
      // Special Guest 1.5% of the time. Those cards are not part of the set, so
      // this draws a common there rather than inventing a pool for them.
      commons: 7,
      uncommons: 3,
      rares: 1,
      land: true,
      // Play Boosters guarantee a foil in the foil-wildcard slot instead.
      foilChance: 0,
      foilOdds: PLAY_FOIL,
      wildcard: PLAY_WILDCARD,
    };
  }
  if (released >= ZENDIKAR_RISING) {
    return {
      era: 'late-draft',
      label: 'Draft Booster',
      note: '15 cards: 10 commons, 3 uncommons, a rare or mythic and a land. A foil replaces a common in 1 pack in 3.',
      size: 15,
      commons: 10,
      uncommons: 3,
      rares: 1,
      land: true,
      foilChance: 1 / 3,
      foilOdds: FOIL_SHEET,
    };
  }
  if (released >= M20) {
    return {
      era: 'modern-foil',
      label: 'Draft Booster',
      note: '15 cards: 10 commons, 3 uncommons, a rare or mythic and a land. From Core Set 2020 the foil rate rose to 1 in 3 packs.',
      size: 15,
      commons: 10,
      uncommons: 3,
      rares: 1,
      land: true,
      foilChance: 1 / 3,
      foilOdds: FOIL_SHEET,
    };
  }
  if (released >= SHARDS) {
    return {
      era: 'mythic',
      label: 'Draft Booster',
      note: '15 cards: 10 commons, 3 uncommons, a rare or mythic and a land. A foil replaces a common in 1 pack in 4.4.',
      size: 15,
      commons: 10,
      uncommons: 3,
      rares: 1,
      land: true,
      foilChance: 0.225,
      foilOdds: FOIL_SHEET,
    };
  }
  if (released >= COLDSNAP) {
    return {
      era: 'unified-foil',
      label: 'Booster Pack',
      note: '15 cards: 10 commons, 3 uncommons, a rare and a land. Mythic rares did not exist yet.',
      size: 15,
      commons: 10,
      uncommons: 3,
      rares: 1,
      land: true,
      foilChance: 0.225,
      foilOdds: FOIL_SHEET,
    };
  }
  // Pre-Coldsnap: no unified foil sheet, and expansions had no land slot -
  // core sets did, which is why the common count differs between them.
  const core = setType === 'core';
  return {
    era: 'classic',
    label: 'Booster Pack',
    note: core
      ? '15 cards: 10 commons, 3 uncommons, a rare and a land. A foil replaced a card of its own rarity, about 1 card in 70.'
      : '15 cards: 11 commons, 3 uncommons and a rare. A foil replaced a card of its own rarity, about 1 card in 70.',
    size: 15,
    commons: core ? 10 : 11,
    uncommons: 3,
    rares: 1,
    land: core,
    foilChance: 0,
    foilOdds: FOIL_SHEET,
    perRarityFoil: true,
  };
}

/** The foil/wildcard sheet's rare share, split into rare vs mythic for a set. */
function resolveFoilOdds(odds: SlotOdds, mythicRate: number): SlotOdds {
  // Older specs fold mythics into the rare share; split it by the set's rate.
  if (odds.mythic > 0) return odds;
  return {
    common: odds.common,
    uncommon: odds.uncommon,
    rare: odds.rare * (1 - mythicRate),
    mythic: odds.rare * mythicRate,
  };
}

// --- drawing --------------------------------------------------------------

/** One card in an opened pack. */
export interface PackCard extends PoolCard {
  foil: boolean;
  /** Which slot produced it, for the "what am I looking at" caption. */
  slot: 'common' | 'uncommon' | 'rare' | 'land' | 'foil' | 'wildcard';
}

function pickRarity(odds: SlotOdds): Rarity {
  const roll = Math.random();
  let floor = 0;
  for (const rarity of ['mythic', 'rare', 'uncommon', 'common'] as const) {
    floor += odds[rarity];
    if (roll < floor) return rarity;
  }
  return 'common';
}

function poolFor(pool: SetPool, rarity: Rarity): PoolCard[] {
  return rarity === 'mythic'
    ? pool.mythic
    : rarity === 'rare'
      ? pool.rare
      : rarity === 'uncommon'
        ? pool.uncommon
        : pool.common;
}

/** One card of `rarity`, never repeating a card already in the pack. */
function draw(pool: SetPool, rarity: Rarity, used: Set<string>): PoolCard | null {
  let candidates = poolFor(pool, rarity);
  // A set with no mythics (or an empty rarity) falls back to rares.
  if (candidates.length === 0 && rarity === 'mythic') candidates = pool.rare;
  if (candidates.length === 0) return null;
  const fresh = candidates.filter((card) => !used.has(card.id));
  // Only a pool smaller than the slot count can exhaust; then repeats are fine.
  const from = fresh.length > 0 ? fresh : candidates;
  const card = from[Math.floor(Math.random() * from.length)]!;
  used.add(card.id);
  return card;
}

/**
 * The commons of a real pack are colour-balanced: the common sheet is laid out
 * so a pack tends to carry about two commons of each colour rather than ten
 * independent draws. This picks the least-represented colour each time, which
 * reproduces the feel without pretending to model the physical sheet.
 */
function drawCommons(pool: SetPool, count: number, used: Set<string>): PoolCard[] {
  const out: PoolCard[] = [];
  const perColor = new Map<string, number>();
  for (const color of ['W', 'U', 'B', 'R', 'G']) perColor.set(color, 0);

  for (let i = 0; i < count; i += 1) {
    let available = pool.common.filter((card) => !used.has(card.id));
    // A partial pool (spoiler season) can run out of distinct commons; real
    // packs repeat commons freely, so repeats beat an eight-card pack.
    if (available.length === 0) available = pool.common;
    if (available.length === 0) break;
    // The colours currently furthest behind, in this pack.
    const lowest = Math.min(...perColor.values());
    const wanted = [...perColor.entries()].filter(([, n]) => n === lowest).map(([color]) => color);
    const preferred = available.filter((card) => card.colors.length === 1 && wanted.includes(card.colors[0]!));
    const from = preferred.length > 0 ? preferred : available;
    const card = from[Math.floor(Math.random() * from.length)]!;
    used.add(card.id);
    out.push(card);
    for (const color of card.colors) perColor.set(color, (perColor.get(color) ?? 0) + 1);
  }
  return out;
}

/**
 * Open one pack of `code`. Slots are filled in the order a pack is collated,
 * then handed back for the reveal: commons first, the rare last, so the fan
 * builds to the card players actually care about.
 */
export function openPack(pool: SetPool, spec: BoosterSpec, released: string): PackCard[] {
  const used = new Set<string>();
  const mythicRate = mythicChance(pool, released);
  const out: PackCard[] = [];

  // The unified foil slot replaces a common, so it is rolled first.
  const hasFoil = spec.foilChance > 0 && Math.random() < spec.foilChance;
  const commonCount = Math.max(0, spec.commons - (hasFoil ? 1 : 0));

  for (const card of drawCommons(pool, commonCount, used)) {
    out.push({ ...card, foil: false, slot: 'common' });
  }

  if (spec.land && pool.basic.length > 0) {
    const card = pool.basic[Math.floor(Math.random() * pool.basic.length)]!;
    // Play Boosters foil the land slot 1 time in 5.
    const foil = spec.era === 'play' && Math.random() < 0.2;
    out.push({ ...card, foil, slot: 'land' });
  }

  for (let i = 0; i < spec.uncommons; i += 1) {
    const card = draw(pool, 'uncommon', used);
    if (card) out.push({ ...card, foil: false, slot: 'uncommon' });
  }

  // Play Boosters carry a guaranteed non-foil wildcard of any rarity.
  if (spec.wildcard) {
    const card = draw(pool, pickRarity(resolveFoilOdds(spec.wildcard, mythicRate)), used);
    if (card) out.push({ ...card, foil: false, slot: 'wildcard' });
  }

  if (hasFoil) {
    const card = draw(pool, pickRarity(resolveFoilOdds(spec.foilOdds, mythicRate)), used);
    if (card) out.push({ ...card, foil: true, slot: 'foil' });
  }
  if (spec.era === 'play') {
    const card = draw(pool, pickRarity(resolveFoilOdds(spec.foilOdds, mythicRate)), used);
    if (card) out.push({ ...card, foil: true, slot: 'foil' });
  }

  // The rare goes last: it is the card at the back of a real pack, and the
  // reveal should build to it rather than trail off into basics.
  for (let i = 0; i < spec.rares; i += 1) {
    const rarity: Rarity = Math.random() < mythicRate ? 'mythic' : 'rare';
    const card = draw(pool, rarity, used);
    if (card) out.push({ ...card, foil: false, slot: 'rare' });
  }
  // Pre-Time-Spiral packs foiled a card of its own rarity, independently, at
  // roughly 1 card in 70 - so a pack could hold a foil rare AND a foil common.
  if (spec.perRarityFoil) {
    for (const [rarity, slots] of [
      ['common', spec.commons],
      ['uncommon', spec.uncommons],
      ['rare', spec.rares],
    ] as const) {
      if (Math.random() < slots / 70) {
        const index = out.findIndex((card) => card.slot === rarity && !card.foil);
        if (index >= 0) out[index] = { ...out[index]!, foil: true };
      }
    }
  }

  return out;
}

/** Rarity ordering for the "best card last" reveal and for sorting a pool. */
export const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, mythic: 3 };
