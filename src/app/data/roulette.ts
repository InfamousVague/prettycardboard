import type { MessageKey } from '../i18n.ts';

/**
 * Roulette: sit down with nothing and play immediately.
 *
 * Every other way into a game asks you for something first - a deck you built,
 * a format, who else is coming. Roulette asks for nothing: one click creates
 * the table, seats the bots, has the TABLE deal every seat a random bundled
 * deck (quickplay, dealt server-side in ws.rs so an empty collection is no
 * obstacle), and starts the game. You find out what you are playing by looking
 * at your opening hand.
 *
 * It is deliberately two entries and not a format picker. The two shapes people
 * actually want are "a quick duel" and "a pod", and each already implies its
 * format, its seat count and its deck pool:
 *
 *   Standard  - 1v1, 60-card decks, 20 life.
 *   Commander - 1v4, 100-card singleton precons, 40 life.
 *
 * WHAT THE POOL ACTUALLY IS. The decks come from the server's embedded pool
 * (`bot::decks_for`, which splits on format), not from the player's collection:
 * Standard draws the 50 archetype decks in bot_decks_standard.json, Commander
 * the official precons in bot_data.json.
 *
 * Commander's pool is FOUR decks and its table is five seats, so a pod is
 * guaranteed to show at least one deck twice, and often will anyway since each
 * seat draws independently. That is a data limit rather than a fault in the
 * deal - the fix is more decks in bot_data.json, not different dealing - but it
 * is worth knowing before anyone files "roulette gave us two of the same deck"
 * as a bug.
 */

export interface RoulettePreset {
  id: 'standardRoulette' | 'commanderRoulette';
  /** MTG format, which also fixes the starting life and the deck pool. */
  format: 'standard' | 'commander';
  /** Total seats, mine included - so `seats - 1` bots are added. */
  seats: number;
  title: MessageKey;
  blurb: MessageKey;
  /** Plate accent, matching the tints the quick-start strip already uses. */
  tint: string;
}

export const ROULETTES: RoulettePreset[] = [
  {
    id: 'standardRoulette',
    format: 'standard',
    seats: 2,
    title: 'rlStandardTitle',
    blurb: 'rlStandardBlurb',
    tint: 'oklch(0.72 0.14 250)',
  },
  {
    // Five seats - you against four - which is one wider than the `pod` quick
    // start and than a typical Commander night. Deliberate: roulette is the
    // loud entry, and the extra seat is what makes it read as a spectacle
    // rather than as `pod` with the deck picker hidden.
    id: 'commanderRoulette',
    format: 'commander',
    seats: 5,
    title: 'rlCommanderTitle',
    blurb: 'rlCommanderBlurb',
    tint: 'oklch(0.8 0.14 85)',
  },
];

/** How the shape reads on the plate: "1v1" for a duel, "4-player" for a pod. */
export function rouletteShape(seats: number): string {
  return seats === 2 ? '1v1' : `1v${seats - 1}`;
}
