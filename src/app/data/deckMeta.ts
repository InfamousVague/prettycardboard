import { getCardMeta, hydrateCardMeta } from './scryfall.ts';
import { typeBucket } from '../pages/deckbuilder/shared.tsx';
import { cyberDeckStats } from '../pages/deckbuilder/cyberDeck.tsx';
import type { Deck, DeckMeta } from '../net/types.ts';

/**
 * The public deck-metrics blob for the matchup splash, computed by the deck
 * OWNER's client (the server stores decks as bare card ids). MTG metrics run
 * off the CardMeta registry (hydrated first, so imported decks beyond the
 * bundled catalog still count); Cyberpunk metrics reuse the deck builder's
 * cyberDeckStats. Deliberately coarse - aggregates only, never the list.
 */
export async function computeDeckMeta(deck: Deck, game: string): Promise<DeckMeta> {
  if (game === 'cyberpunk') {
    const stats = cyberDeckStats(deck);
    return {
      size: stats.total,
      ram: stats.ramBudget.reduce((sum, entry) => sum + entry.ram, 0),
      avgCost: round1(stats.avgCost),
    };
  }
  await hydrateCardMeta(deck.cards.map((card) => card.scryfallId));
  let size = 0;
  let mvSum = 0;
  let mvCount = 0;
  let creatures = 0;
  let lands = 0;
  let spells = 0;
  let other = 0;
  const colors = new Set<string>();
  for (const entry of deck.cards) {
    size += entry.quantity;
    const meta = getCardMeta(entry.scryfallId);
    if (!meta) continue;
    for (const color of meta.colorIdentity) colors.add(color);
    const bucket = typeBucket(meta);
    if (bucket === 'creature') creatures += entry.quantity;
    else if (bucket === 'land') lands += entry.quantity;
    else if (bucket === 'instant' || bucket === 'sorcery') spells += entry.quantity;
    else other += entry.quantity;
    if (bucket !== 'land') {
      mvSum += meta.manaValue * entry.quantity;
      mvCount += entry.quantity;
    }
  }
  const ORDER = ['W', 'U', 'B', 'R', 'G'];
  return {
    size,
    colors: ORDER.filter((color) => colors.has(color)),
    avgMv: mvCount > 0 ? round1(mvSum / mvCount) : 0,
    creatures,
    lands,
    spells,
    other,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
