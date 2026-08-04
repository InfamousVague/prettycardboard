import catalog from './moodswingsCards.json' with { type: 'json' };
import type { DeckCard } from '../net/types.ts';

/**
 * Mood Swings (set code MSW): Mark Rosewater's own 2-4 player card game, sold
 * through Secret Lair. It is NOT Magic and shares nothing with it - no mana, no
 * life totals, no permanents, no combat. Cards are MOODS with a numeric VALUE,
 * everyone plays out of one shared deck, and the highest total wins the round.
 *
 * The catalog is small enough (133 cards, ~44KB) to be a static import, unlike
 * yugioh's ~14,500-card lazy fetch. Written by scripts/sync-moodswings.mjs from
 * Wizards' public card gallery and card-notes pages.
 *
 * Card identity is `msw-<slug>` ("msw-hurt-feelings"). The prefix is doing real
 * work: ids ride the protocol's `scryfallId` slot alongside Magic and Cyberpunk
 * UUIDs and Yu-Gi-Oh passcodes, and a bare slug like "added" is close enough to
 * hex to be worth not gambling on.
 */

export interface MoodCard {
  id: string;
  name: string;
  /** Frame colour: white | blue | black | red | green. Colours have no rules
   *  meaning of their own - cards refer to them, but nothing costs them. */
  color: string;
  rarity: string | null;
  /** Printed value(s). A card with two is one whose text swaps to the second
   *  under some condition; `values[0]` is what it is worth on the table. Values
   *  are read as numerals, so the two dice on Love are 66, not 6 and 6. */
  values: number[];
  /** The value line exactly as the notes print it, e.g. "[4]/[6][6]". */
  valueText: string;
  text: string;
  /** Wizards' hosted card face. Referenced, never vendored. */
  art: string | null;
  /** The set's one headliner (Love), starred in the official gallery. */
  headliner?: boolean;
}

/** Not a deck card: the catch-up marker that passes to whoever scored lowest
 *  in a 3+ player game. */
export interface MoodMarker {
  name: string;
  art: string;
  reminder: string;
  text: string;
}

export const MOOD_PREFIX = 'msw-';

export function moodSlug(name: string): string {
  return (
    MOOD_PREFIX +
    name
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );
}

const RAW = catalog as { set: string; cards: Omit<MoodCard, 'id'>[]; markers: MoodMarker[] };

export const MOOD_CARDS: MoodCard[] = RAW.cards.map((card) => ({ ...card, id: moodSlug(card.name) }));

export const MOOD_MARKERS: MoodMarker[] = RAW.markers;

const BY_ID = new Map(MOOD_CARDS.map((card) => [card.id, card]));
const MARKER_BY_ID = new Map(RAW.markers.map((m) => [moodSlug(m.name), m]));

export function isMoodId(id: string | undefined): boolean {
  return !!id && id.startsWith(MOOD_PREFIX);
}

export function moodCard(id: string | undefined): MoodCard | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** The rendered face for a mood id. Markers resolve too - Hurt Feelings is a
 *  real card you put in front of someone, it just is not one you draw. */
export function moodImage(id: string | undefined): string {
  if (!id) return '';
  return BY_ID.get(id)?.art ?? MARKER_BY_ID.get(id)?.art ?? '';
}

/**
 * The value a mood is worth right now, for the running total the playmat
 * shows.
 *
 * This is the PRINTED value, and deliberately only that. A third of the set has
 * a second value it swaps to under a condition, and cards rewrite each other's
 * values freely - so a total computed from print is an aid for the player doing
 * the adding, not a score the app should assert. `suppressed` is the one state
 * worth honouring here because it is mechanical and visible: a suppressed mood
 * is turned sideways and counts as [0].
 */
export function moodValue(id: string | undefined, suppressed = false): number {
  if (suppressed) return 0;
  return moodCard(id)?.values[0] ?? 0;
}

/** A box is 45 cards, and no two boxes are alike - that is the product, not an
 *  approximation of it: "forty-five randomized cards from a possible one
 *  hundred thirty-three". Distinct cards, so a box is a singleton 45 of the
 *  133 rather than a weighted print run; the rarities ride along wherever the
 *  shuffle drops them. */
export const BOX_SIZE = 45;

export function moodBox(size = BOX_SIZE): DeckCard[] {
  const pool = [...MOOD_CARDS];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j] as MoodCard, pool[i] as MoodCard];
  }
  return pool.slice(0, Math.min(size, pool.length)).map((card) => ({
    scryfallId: card.id,
    name: card.name,
    quantity: 1,
    board: 'main' as DeckCard['board'],
  }));
}

/** Whether any mood in play has a second printed value or rules text that could
 *  move the total - i.e. whether the printed sum is worth a caveat. */
export function totalIsApproximate(ids: (string | undefined)[]): boolean {
  return ids.some((id) => {
    const card = moodCard(id);
    return !!card && (card.values.length > 1 || card.text.length > 0);
  });
}
