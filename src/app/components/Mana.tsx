import type { CSSProperties } from 'react';
import type { ManaColor, ManaPool } from '../net/types.ts';

export const MANA_ORDER: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];
export const EMPTY_MANA: ManaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

/**
 * Official MTG mana/card symbols, rendered from the bundled Scryfall SVG set
 * (public/symbols/<SYMBOL>.svg - synced once; 84 glyphs including hybrids,
 * Phyrexian, tap, energy). One component for a single symbol, one for a whole
 * mana cost string like "{2}{G}{U}" or "{X}{W/P}".
 */

const BASE = import.meta.env.BASE_URL;

/** "{W/U}" | "W/U" | "WU" → the bundled file name "WU". */
function fileFor(symbol: string): string {
  return symbol.replace(/[{}/]/g, '').toUpperCase();
}

export function ManaSymbol({
  symbol,
  size = '1em',
  className,
  style,
}: {
  symbol: string;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  const name = fileFor(symbol);
  if (!name) return null;
  return (
    <img
      className={className}
      src={`${BASE}symbols/${name}.svg`}
      alt={`{${name}}`}
      title={`{${name}}`}
      draggable={false}
      style={{ width: size, height: size, display: 'inline-block', verticalAlign: '-0.13em', ...style }}
    />
  );
}

/** Split a cost string "{2}{G}{U}" into its symbols. */
export function parseCost(cost: string | undefined | null): string[] {
  if (!cost) return [];
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]!);
}

export function ManaCost({
  cost,
  size = '1em',
  className,
}: {
  cost: string | undefined | null;
  size?: number | string;
  className?: string;
}) {
  const symbols = parseCost(cost);
  if (symbols.length === 0) return null;
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.14em', flex: 'none' }}
      aria-label={cost ?? undefined}
    >
      {symbols.map((symbol, index) => (
        <ManaSymbol key={`${symbol}-${index}`} symbol={symbol} size={size} />
      ))}
    </span>
  );
}

/** WUBRG identity dots as official symbols (small, for deck rows/headers). */
export function ColorIdentity({ colors, size = '0.95em' }: { colors: string[]; size?: number | string }) {
  const order = ['W', 'U', 'B', 'R', 'G'];
  const shown = order.filter((color) => colors.includes(color));
  if (shown.length === 0) return <ManaSymbol symbol="C" size={size} />;
  return (
    <span style={{ display: 'inline-flex', gap: '0.18em', alignItems: 'center' }}>
      {shown.map((color) => (
        <ManaSymbol key={color} symbol={color} size={size} />
      ))}
    </span>
  );
}

export function ManaPoolReadout({ mana, className }: { mana?: ManaPool; className?: string }) {
  const shown = MANA_ORDER.filter((color) => (mana?.[color] ?? 0) > 0);
  if (shown.length === 0) return null;
  const label = shown.map((color) => `${color}: ${mana?.[color] ?? 0}`).join(', ');
  return (
    <span className={`manaReadout${className ? ` ${className}` : ''}`} aria-label={`Floating mana: ${label}`}>
      {shown.map((color) => (
        <span key={color} className="manaReadoutPip" title={`${color}: ${mana?.[color] ?? 0}`}>
          <ManaSymbol symbol={color} size={15} />
          <span>{mana?.[color] ?? 0}</span>
        </span>
      ))}
    </span>
  );
}
