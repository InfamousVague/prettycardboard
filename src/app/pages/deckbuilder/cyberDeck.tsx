import type { ReactNode } from 'react';
import { Boxes, Cog, Cpu, Crown, ScrollText, Shapes, Swords, Zap } from '@glacier/icons';
import type { Deck, DeckCard } from '../../net/types.ts';
import { cyberpunkCard, CYBERPUNK_COLOR_HEX } from '../../data/cyberpunk.ts';

/**
 * Cyberpunk-specific deck analytics. The deck editor's MTG stats (mana curve,
 * lands, color identity, bracket) are meaningless here — a Cyberpunk deck is
 * read through its Legends' RAM budget, its colour spread, and the average
 * Cost/Power of the crew — so the view swaps in these instead.
 */

export interface CyberGroup {
  type: string;
  cards: DeckCard[];
  count: number;
}

export interface CyberDeckStats {
  legends: DeckCard[];
  legendCount: number;
  groups: CyberGroup[];
  /** RAM budget = sum of the Legends' RAM per colour (the deck-building cap). */
  ramBudget: { color: string; ram: number }[];
  colorCounts: { color: string; count: number }[];
  avgCost: number;
  avgPower: number;
  /** Non-Legend card count. */
  mainCount: number;
  total: number;
}

// Non-Legend card types in a sensible reading order; anything unrecognised sorts
// after these, alphabetically.
const TYPE_ORDER = ['Unit', 'Gear', 'Program', 'Action', 'Event', 'Location'];

export const CYBER_TYPE_ICON: Record<string, ReactNode> = {
  Legend: <Crown size={13} />,
  Unit: <Swords size={13} />,
  Gear: <Cog size={13} />,
  Program: <Cpu size={13} />,
  Action: <Zap size={13} />,
  Event: <ScrollText size={13} />,
  Location: <Boxes size={13} />,
};

export function cyberTypeIcon(type: string): ReactNode {
  return CYBER_TYPE_ICON[type] ?? <Shapes size={13} />;
}

export function cyberColorHex(color: string): string {
  return CYBERPUNK_COLOR_HEX[color] ?? 'var(--glacier-text-muted)';
}

export function cyberDeckStats(deck: Deck): CyberDeckStats {
  const legends = deck.cards.filter((c) => c.board === 'commander');
  const mains = deck.cards.filter((c) => c.board === 'main');

  // Group the mains by printed type.
  const byType = new Map<string, DeckCard[]>();
  for (const card of mains) {
    const type = cyberpunkCard(card.scryfallId)?.type ?? 'Other';
    const list = byType.get(type);
    if (list) list.push(card);
    else byType.set(type, [card]);
  }
  const groups: CyberGroup[] = [...byType.entries()]
    .map(([type, cards]) => ({
      type,
      cards: [...cards].sort((a, b) => a.name.localeCompare(b.name)),
      count: cards.reduce((sum, c) => sum + c.quantity, 0),
    }))
    .sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type);
      const bi = TYPE_ORDER.indexOf(b.type);
      if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      return a.type.localeCompare(b.type);
    });

  // RAM budget: each Legend contributes its RAM to its colour's cap.
  const budget = new Map<string, number>();
  for (const legend of legends) {
    const card = cyberpunkCard(legend.scryfallId);
    if (card?.color && card.ram != null) budget.set(card.color, (budget.get(card.color) ?? 0) + card.ram * legend.quantity);
  }
  const ramBudget = [...budget.entries()]
    .map(([color, ram]) => ({ color, ram }))
    .sort((a, b) => b.ram - a.ram);

  // Colour spread across the whole deck (Legends + mains), by copy count.
  const colors = new Map<string, number>();
  let costSum = 0;
  let costCount = 0;
  let powerSum = 0;
  let powerCount = 0;
  for (const entry of deck.cards) {
    const card = cyberpunkCard(entry.scryfallId);
    if (!card) continue;
    if (card.color) colors.set(card.color, (colors.get(card.color) ?? 0) + entry.quantity);
    if (entry.board === 'main') {
      if (card.cost != null) {
        costSum += card.cost * entry.quantity;
        costCount += entry.quantity;
      }
      if (card.power != null) {
        powerSum += card.power * entry.quantity;
        powerCount += entry.quantity;
      }
    }
  }
  const colorCounts = [...colors.entries()]
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count);

  const legendCount = legends.reduce((sum, c) => sum + c.quantity, 0);
  const mainCount = mains.reduce((sum, c) => sum + c.quantity, 0);
  return {
    legends,
    legendCount,
    groups,
    ramBudget,
    colorCounts,
    avgCost: costCount > 0 ? costSum / costCount : 0,
    avgPower: powerCount > 0 ? powerSum / powerCount : 0,
    mainCount,
    total: legendCount + mainCount,
  };
}
