import type { CSSProperties } from 'react';
import { getGame } from '../data/games.ts';

const BASE = import.meta.env.BASE_URL;

/**
 * Optical size correction, per game.
 *
 * `mask-size: contain` fits by the LONGEST edge, so a tall narrow mark ends up
 * carrying far less ink than a square one in the same box and reads as smaller.
 * The planeswalker symbol is 54x100 - roughly half the width of the eye and the
 * chip - so it gets scaled up until the three sit at matching visual weight.
 * Anything not listed renders at its nominal size.
 */
const OPTICAL: Record<string, number> = { mtg: 1.18 };

/**
 * A game's own mark, from `public/games/<id>.svg`.
 *
 * Rendered as a CSS MASK rather than an <img>: an external SVG in an <img> is
 * an opaque document that cannot inherit `currentColor`, so it would ignore the
 * per-game accent entirely and force a colour into the file. As a mask the file
 * supplies only the silhouette and the accent paints it, which is what lets one
 * mark serve the tinted pill, the solid badge and a large hero treatment.
 *
 * Magic uses the planeswalker symbol, which the Scryfall symbology sync already
 * bundles. Yu-Gi-Oh and Cyberpunk are authored here - see the note in
 * `public/games/` on swapping in official brand art.
 */
export function GameMark({
  game,
  size = 20,
  className,
  style,
}: {
  game: string | undefined | null;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  const def = getGame(game);
  const url = `url("${BASE}games/${def.id}.svg")`;
  const scale = OPTICAL[def.id] ?? 1;
  // The correction grows the BOX, not the mask inside it, so the mark stays
  // centred on the same point and callers still reason in one number.
  const box = typeof size === 'number' ? size * scale : size;
  return (
    <span
      className={['gameMark', className].filter(Boolean).join(' ')}
      aria-hidden
      style={{
        inlineSize: box,
        blockSize: box,
        // Both spellings: WebKit still wants the prefix for mask-image.
        WebkitMaskImage: url,
        maskImage: url,
        ...style,
      }}
    />
  );
}
