import type { ReactNode } from 'react';
import { ScrollText, Shapes, Shield, Swords } from '@glacier/icons';
import { PlayingCardDeck } from '../../icons/cards.ts';
import type { Deck, DeckCard } from '../../net/types.ts';
import { isExtraDeckCard, yugiohCard, yugiohKind } from '../../data/yugioh.ts';

/**
 * Yu-Gi-Oh-specific deck analytics, the yugioh analogue of cyberDeck.tsx. The
 * MTG stats (mana curve, color identity, bracket) are meaningless here — a
 * Yu-Gi-Oh deck is read through its Main/Extra/Side section sizes, its
 * Monster/Spell/Trap split, and the 3-copies-per-name rule. All lookups go
 * through the lazily-loaded catalog, so counts refine themselves once it
 * arrives (unknown cards group under "other" until then).
 */

export type YugiohGroupKind = 'monster' | 'spell' | 'trap' | 'other';

export interface YugiohGroup {
  kind: YugiohGroupKind;
  cards: DeckCard[];
  count: number;
}

export interface YugiohDeckStats {
  /** Extra Deck (the 'commander' anchor board). */
  extra: DeckCard[];
  extraCount: number;
  sideCount: number;
  /** Main Deck grouped Monsters / Spells / Traps (unknown ids under other). */
  groups: YugiohGroup[];
  mainCount: number;
  monsterCount: number;
  spellCount: number;
  trapCount: number;
  /** Average ATK of the known Main Deck monsters. */
  avgAtk: number;
  /** Card ids carrying a name that exceeds 3 copies across Main+Extra+Side. */
  copyWarnings: Set<string>;
  total: number;
}

export const YUGIOH_KIND_ICON: Record<YugiohGroupKind | 'extra', ReactNode> = {
  monster: <Swords size={13} />,
  spell: <ScrollText size={13} />,
  trap: <Shield size={13} />,
  extra: <PlayingCardDeck size={13} />,
  other: <Shapes size={13} />,
};

/** Reading order for the Main Deck groups. */
const GROUP_ORDER: YugiohGroupKind[] = ['monster', 'spell', 'trap', 'other'];

/** Monsters sort by Level/Rank desc then ATK desc (how a duelist scans a
 * list); spells/traps alphabetically. */
function sortGroup(kind: YugiohGroupKind, cards: DeckCard[]): DeckCard[] {
  if (kind !== 'monster') return [...cards].sort((a, b) => a.name.localeCompare(b.name));
  return [...cards].sort((a, b) => {
    const ca = yugiohCard(a.scryfallId);
    const cb = yugiohCard(b.scryfallId);
    const level = (cb?.level ?? cb?.linkval ?? 0) - (ca?.level ?? ca?.linkval ?? 0);
    if (level !== 0) return level;
    const atk = (cb?.atk ?? 0) - (ca?.atk ?? 0);
    if (atk !== 0) return atk;
    return a.name.localeCompare(b.name);
  });
}

export function yugiohDeckStats(deck: Deck): YugiohDeckStats {
  const extra = deck.cards.filter((c) => c.board === 'commander');
  const mains = deck.cards.filter((c) => c.board === 'main');
  const sides = deck.cards.filter((c) => c.board === 'side');

  const byKind = new Map<YugiohGroupKind, DeckCard[]>();
  let atkSum = 0;
  let atkCount = 0;
  for (const entry of mains) {
    const card = yugiohCard(entry.scryfallId);
    const kind: YugiohGroupKind = card ? yugiohKind(card) : 'other';
    const list = byKind.get(kind);
    if (list) list.push(entry);
    else byKind.set(kind, [entry]);
    // A printed '?' ATK arrives as -1 from YGOPRODeck; averaging the sentinel
    // would drag the number below zero, so those cards count for neither half.
    if (card && kind === 'monster' && card.atk != null && card.atk >= 0) {
      atkSum += card.atk * entry.quantity;
      atkCount += entry.quantity;
    }
  }
  const groups: YugiohGroup[] = GROUP_ORDER.flatMap((kind) => {
    const cards = byKind.get(kind);
    if (!cards || cards.length === 0) return [];
    return [{ kind, cards: sortGroup(kind, cards), count: cards.reduce((sum, c) => sum + c.quantity, 0) }];
  });

  // The 3-copies rule counts a NAME across every section of the deck.
  const byName = new Map<string, number>();
  for (const entry of deck.cards) {
    const key = entry.name.toLowerCase();
    byName.set(key, (byName.get(key) ?? 0) + entry.quantity);
  }
  const copyWarnings = new Set<string>();
  for (const entry of deck.cards) {
    if ((byName.get(entry.name.toLowerCase()) ?? 0) > 3) copyWarnings.add(entry.scryfallId);
  }

  const count = (cards: DeckCard[]) => cards.reduce((sum, c) => sum + c.quantity, 0);
  const kindCount = (kind: YugiohGroupKind) => groups.find((g) => g.kind === kind)?.count ?? 0;
  const mainCount = count(mains);
  const extraCount = count(extra);
  return {
    extra: sortGroup('monster', extra),
    extraCount,
    sideCount: count(sides),
    groups,
    mainCount,
    monsterCount: kindCount('monster'),
    spellCount: kindCount('spell'),
    trapCount: kindCount('trap'),
    avgAtk: atkCount > 0 ? atkSum / atkCount : 0,
    copyWarnings,
    total: mainCount + extraCount,
  };
}

/** A search-result / decklist chip kind, including the Extra Deck facet. */
export function yugiohFilterKind(id: string): YugiohGroupKind | 'extra' {
  const card = yugiohCard(id);
  if (!card) return 'other';
  if (isExtraDeckCard(card)) return 'extra';
  return yugiohKind(card);
}
