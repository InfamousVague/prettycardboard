import type { MessageKey } from '../i18n.ts';
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
  /** Booster product name, as players know it. Message keys rather than
   *  English: these are rendered straight onto the boosters page, so a literal
   *  here would stay English in es/fr/ar next to translated copy. */
  labelKey: MessageKey;
  /** What is being simulated, shown under the pack. A LIST because the classic
   *  branch varies structure and foils independently - joined with a space at
   *  the one place it is rendered, so no locale has to own the seam. */
  noteKeys: MessageKey[];
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
const URZAS_LEGACY = '1999-02-15'; // foils debut at all: before this, packs had none
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
      labelKey: 'boSpecPlay',
      noteKeys: ['boNotePlay'],
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
      labelKey: 'boSpecDraft',
      noteKeys: ['boNoteLateDraft'],
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
      labelKey: 'boSpecDraft',
      noteKeys: ['boNoteModernFoil'],
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
      labelKey: 'boSpecDraft',
      noteKeys: ['boNoteMythic'],
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
      labelKey: 'boSpecPack',
      noteKeys: ['boNoteUnified'],
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
  // The separate basic-land slot is a later invention. In 1993-94 (Alpha
  // through Revised) basics rode the common sheet, so those packs are 11
  // commons like an expansion rather than 10 + a land.
  const landSlot = core && released >= '1995-01-01';
  // Foils are a 1999 invention: Urza's Legacy printed the first ones. Alpha
  // through Urza's Saga could not produce one, so the per-rarity foil roll is
  // gated on the debut rather than on the classic era as a whole.
  const foils = released >= URZAS_LEGACY;
  return {
    era: 'classic',
    labelKey: 'boSpecPack',
    // Two independent axes - whether the pack had a land slot, and whether
    // foils had been invented - so they are two separate sentences rather than
    // one string per combination.
    noteKeys: [
      landSlot ? 'boNoteClassicLand' : 'boNoteClassicNoLand',
      foils ? 'boNoteFoilsPerRarity' : 'boNoteNoFoils',
    ],
    size: 15,
    commons: landSlot ? 10 : 11,
    uncommons: 3,
    rares: 1,
    land: landSlot,
    foilChance: 0,
    foilOdds: FOIL_SHEET,
    perRarityFoil: foils,
  };
}

/**
 * How often a pack contains a foil at all, as a probability - `null` when the
 * era predates foils entirely.
 *
 * Three eras, three different questions:
 *
 *   play    the wildcard slot is ALWAYS foil, so the answer is one per pack
 *   unified a single foil slot with its own published rate: read it off
 *   classic no foil slot at all. A foil replaced the card of its OWN rarity,
 *           one roll per rarity slot at the sheet rate of 1 in 70, so the pack
 *           rate is the chance ANY of those rolls lands - which is why this is
 *           a complement of three misses rather than a sum.
 *
 * Shared rather than derived per surface: the dock and the boosters page print
 * the same number, and a "1 in 3.6" that disagreed with itself across two
 * screens would be read as a bug in the simulator rather than in the label.
 */
export function foilChancePerPack(spec: BoosterSpec): number | null {
  if (spec.era === 'play') return 1;
  if (spec.foilChance > 0) return spec.foilChance;
  if (spec.perRarityFoil) {
    return 1 - (1 - spec.commons / 70) * (1 - spec.uncommons / 70) * (1 - spec.rares / 70);
  }
  return null;
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
  // Masters and Conspiracy sets are modern enough to get a land slot from the
  // spec, but shipped no basics in their boosters at all - so the slot has
  // nothing to draw. Those packs were still full size, and dropping the slot
  // outright deals a pack one card short of the 15 `spec.size` and the note
  // both promise, so the empty land slot becomes another common instead.
  const hasLand = spec.land && pool.basic.length > 0;
  const landFallback = spec.land && !hasLand ? 1 : 0;
  const commonCount = Math.max(0, spec.commons + landFallback - (hasFoil ? 1 : 0));

  for (const card of drawCommons(pool, commonCount, used)) {
    out.push({ ...card, foil: false, slot: 'common' });
  }

  if (hasLand) {
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

/** One row of the per-card odds table. */
export interface CardOdds {
  card: PoolCard;
  /** Chance this exact card is somewhere in a pack, 0-1. */
  chance: number;
  /** True for the basic land slot, whose odds come from a different pool. */
  basic: boolean;
}

/**
 * The chance of pulling each individual card in a set, one row per card.
 *
 * The trick is that slots, not cards, are what a pack deals - so this counts
 * how many slots land on each rarity in an average pack, then divides by how
 * many cards share that rarity. Slot counts are expectations rather than whole
 * numbers because several slots are themselves a roll: the unified foil slot
 * only exists `foilChance` of the time and eats a common when it does, the
 * rare slot turns mythic at `mythicChance`, and a Play Booster's two wildcards
 * can come out at any rarity at all.
 *
 * Dividing by the pool size is exact rather than an approximation, which is
 * the one genuinely nice thing about `draw` refusing to repeat a card: drawing
 * k distinct cards from N gives any particular one of them exactly k/N,
 * whatever order they come out in. The commons are colour-balanced rather than
 * uniform, so their row is the pack average across colours rather than a
 * promise about any one card - a mono-white common in a set light on white is
 * a little likelier than this says, and vice versa.
 */
export function cardOdds(pool: SetPool, spec: BoosterSpec, released: string): CardOdds[] {
  const mythicRate = mythicChance(pool, released);
  const hasLand = spec.land && pool.basic.length > 0;
  // Same fallback `openPack` uses: a spec with a land slot but no basics in
  // the pool spends that slot on another common instead.
  const landFallback = spec.land && !hasLand ? 1 : 0;

  const slots: Record<Rarity, number> = {
    common: spec.commons + landFallback - spec.foilChance,
    uncommon: spec.uncommons,
    rare: spec.rares * (1 - mythicRate),
    mythic: spec.rares * mythicRate,
  };

  /** Fold a rolled slot's rarity spread into the running slot counts. */
  const addSlot = (odds: SlotOdds, weight: number) => {
    const spread = resolveFoilOdds(odds, mythicRate);
    for (const rarity of ['common', 'uncommon', 'rare', 'mythic'] as const) {
      // A set with no mythics still has specs that name a mythic share; those
      // rolls fall back to rares in `draw`, so they are counted there.
      const target = rarity === 'mythic' && pool.mythic.length === 0 ? 'rare' : rarity;
      slots[target] += spread[rarity] * weight;
    }
  };

  if (spec.wildcard) addSlot(spec.wildcard, 1);
  // Play Boosters always deal their foil; everything since Coldsnap rolls for
  // one; before that there was no unified foil slot to roll for.
  addSlot(spec.foilOdds, spec.era === 'play' ? 1 : spec.foilChance);

  const rows: CardOdds[] = [];
  for (const rarity of ['mythic', 'rare', 'uncommon', 'common'] as const) {
    const cards = poolFor(pool, rarity);
    if (cards.length === 0) continue;
    const chance = Math.min(1, slots[rarity] / cards.length);
    for (const card of cards) rows.push({ card, chance, basic: false });
  }
  if (hasLand) {
    const chance = 1 / pool.basic.length;
    for (const card of pool.basic) rows.push({ card, chance, basic: true });
  }

  // Rarest first - the cards worth knowing the odds of are the ones you are
  // unlikely to see - then alphabetical, so a named card is findable by eye.
  return rows.sort(
    (a, b) =>
      Number(a.basic) - Number(b.basic) ||
      RARITY_RANK[b.card.rarity] - RARITY_RANK[a.card.rarity] ||
      a.card.name.localeCompare(b.card.name),
  );
}
