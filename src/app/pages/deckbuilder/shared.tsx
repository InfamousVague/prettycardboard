import { COLOR_ORDER } from '../../data/cards.ts';
import { manaSymbols, type CardMeta } from '../../data/scryfall.ts';
import { ManaSymbol } from '../../components/Mana.tsx';
import type { MessageKey } from '../../i18n.ts';

/**
 * Small pieces shared across the deck builder: the card-type grouping used by
 * the decklist, and the mana/identity pip renderers. Pip colors come from the
 * Glacier color ramps (amber/blue/gray/red/green) so they follow the theme.
 */

export type TypeBucket =
  | 'creature'
  | 'instant'
  | 'sorcery'
  | 'artifact'
  | 'enchantment'
  | 'planeswalker'
  | 'battle'
  | 'land'
  | 'other';

/** Display order inside the Main group. */
export const TYPE_ORDER: TypeBucket[] = [
  'creature',
  'instant',
  'sorcery',
  'artifact',
  'enchantment',
  'planeswalker',
  'battle',
  'land',
  'other',
];

export const TYPE_LABEL: Record<TypeBucket, MessageKey> = {
  creature: 'dbTypeCreature',
  instant: 'dbTypeInstant',
  sorcery: 'dbTypeSorcery',
  artifact: 'dbTypeArtifact',
  enchantment: 'dbTypeEnchantment',
  planeswalker: 'dbTypePlaneswalker',
  battle: 'dbTypeBattle',
  land: 'dbTypeLand',
  other: 'dbTypeOther',
};

/**
 * Classify a type line into a display bucket. Lands win over creatures
 * (creature lands read as lands, matching common deck tools); creatures win
 * over the remaining artifact/enchantment overlaps.
 */
export function typeBucket(meta: CardMeta | undefined): TypeBucket {
  if (!meta) return 'other';
  const front = meta.typeLine.split(' // ')[0] ?? meta.typeLine;
  if (/\bLand\b/.test(front)) return 'land';
  if (/\bCreature\b/.test(front)) return 'creature';
  if (/\bPlaneswalker\b/.test(front)) return 'planeswalker';
  if (/\bBattle\b/.test(front)) return 'battle';
  if (/\bInstant\b/.test(front)) return 'instant';
  if (/\bSorcery\b/.test(front)) return 'sorcery';
  if (/\bArtifact\b/.test(front)) return 'artifact';
  if (/\bEnchantment\b/.test(front)) return 'enchantment';
  return 'other';
}

/** A row of mana-cost symbols, e.g. {2}{G}{W} - the official Scryfall SVGs. */
export function ManaPips({ cost }: { cost: string | undefined }) {
  const symbols = manaSymbols(cost);
  if (symbols.length === 0) return null;
  return (
    <span className="manaPips" aria-hidden>
      {symbols.map((symbol, index) => (
        <ManaSymbol key={`${symbol}-${index}`} symbol={symbol} size="0.95em" />
      ))}
    </span>
  );
}

/** WUBRG identity as official symbols. */
export function ColorPips({ colors, label }: { colors: string[]; label?: string }) {
  const present = COLOR_ORDER.filter((color) => colors.includes(color));
  if (present.length === 0) return null;
  return (
    <span className="colorPips" role={label ? 'img' : undefined} aria-label={label}>
      {present.map((color) => (
        <ManaSymbol key={color} symbol={color} size="1.05em" />
      ))}
    </span>
  );
}
