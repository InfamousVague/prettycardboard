import gameChangersData from '../../data/gamechangers.json' with { type: 'json' };
import type { DeckCard } from '../net/types.ts';

/**
 * Commander Bracket estimation, grounded in the official Game Changers list
 * (synced from Scryfall's `is:gamechanger`, 53 cards). The estimate follows
 * the published bracket rules where they are name-detectable:
 *
 *   Bracket 2 (Core):      no Game Changers
 *   Bracket 3 (Upgraded):  1-3 Game Changers
 *   Bracket 4 (Optimized): 4+ Game Changers
 *
 * Brackets 1 (Exhibition) and 5 (cEDH) are social judgments a card list
 * cannot make, so the estimator never claims them; the UI labels everything
 * as an estimate and names the Game Changers it found.
 */

const GAME_CHANGERS = new Set(
  (gameChangersData as { names: string[] }).names.map((name) => name.toLowerCase()),
);

export interface BracketEstimate {
  /** 2 | 3 | 4 - the detectable range. */
  bracket: 2 | 3 | 4;
  /** The Game Changer card names found in the deck. */
  gameChangers: string[];
}

export function estimateBracket(cards: DeckCard[]): BracketEstimate {
  const found = new Set<string>();
  for (const card of cards) {
    // Front-face match covers split/double-faced entries ("A // B").
    const name = card.name.toLowerCase();
    const front = name.split(' // ')[0] ?? name;
    if (GAME_CHANGERS.has(name) || GAME_CHANGERS.has(front)) found.add(card.name);
  }
  const count = found.size;
  return {
    bracket: count === 0 ? 2 : count <= 3 ? 3 : 4,
    gameChangers: [...found].sort(),
  };
}

/** i18n key for a bracket's name (bk1..bk5). */
export function bracketKey(bracket: number): 'bk1' | 'bk2' | 'bk3' | 'bk4' | 'bk5' {
  return `bk${Math.min(5, Math.max(1, bracket))}` as 'bk1' | 'bk2' | 'bk3' | 'bk4' | 'bk5';
}
