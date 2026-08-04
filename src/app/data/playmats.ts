/**
 * The PrettyCardboard playmats: fifteen wide backgrounds bundled at
 * public/mats/. The chosen mat is a preference; applyPreferences publishes it
 * as the `--pc-playmat` CSS custom property, which both the app backdrop (the
 * glass panels float over it) and the table felt read — one switch, the whole
 * app follows.
 */
import { assetUrl } from './assets.ts';
import { SERVER_URL } from '../net/api.ts';
import type { AssetTheme } from './themes.ts';

export interface Playmat {
  id: string;
  name: string;
  /** Grouping for the customize picker; see [[themes.ts]]. */
  theme: AssetTheme;
  /** Solid-color mats reference a Glacier color token (a CSS custom property
   * name). They render as that live token color under a faint grid instead of
   * bundled artwork, so they follow the active theme. */
  token?: string;
  /** Graph-paper mats: the ruling ink. Drawn, not bundled (see PAPER_PLAYMATS). */
  paper?: string;
  /** Optional paper tone under the ruling; defaults to a warm off-white. */
  tint?: string;
}

/** Image playmats: wide backgrounds bundled at public/mats/. */
const IMAGE_PLAYMATS: Playmat[] = [
  { id: 'arcane-study', name: 'Arcane Study', theme: 'generic' },
  { id: 'tavern', name: 'Tavern Table', theme: 'generic' },
  { id: 'house-felt', name: 'House Felt', theme: 'generic' },
  { id: 'plains', name: 'Plains', theme: 'magic' },
  { id: 'island', name: 'Island', theme: 'magic' },
  { id: 'swamp', name: 'Swamp', theme: 'magic' },
  { id: 'mountain', name: 'Mountain', theme: 'magic' },
  { id: 'forest', name: 'Forest', theme: 'magic' },
  { id: 'confluence', name: 'Confluence Nexus', theme: 'magic' },
  { id: 'marble', name: 'Marble Sanctum', theme: 'magic' },
  { id: 'boneyard', name: 'Misted Boneyard', theme: 'magic' },
  { id: 'forgefloor', name: 'Forgefloor', theme: 'magic' },
  { id: 'fae-glade', name: 'Fae Glade', theme: 'magic' },
  { id: 'planar-sky', name: 'Planar Sky', theme: 'magic' },
  { id: 'neon-grid', name: 'Neon Grid', theme: 'cyberpunk' },
  { id: 'aurora-drift', name: 'Aurora Drift', theme: 'generic' },
  { id: 'deep-field', name: 'Deep Field', theme: 'generic' },
  { id: 'felted-field', name: 'Felted Field', theme: 'generic' },
  { id: 'heirloom-table', name: 'Heirloom Table', theme: 'generic' },
  { id: 'quarry-slab', name: 'Quarry Slab', theme: 'generic' },
  { id: 'back-alley', name: 'Back Alley', theme: 'cyberpunk' },
  { id: 'corporate-arcology', name: 'Corporate Arcology', theme: 'cyberpunk' },
  { id: 'neon-megacity', name: 'Neon Megacity', theme: 'cyberpunk' },
  { id: 'rain-ramen', name: 'Rain Ramen', theme: 'cyberpunk' },
  { id: 'the-net', name: 'The Net', theme: 'cyberpunk' },
  { id: 'burgundy-dotted', name: 'Burgundy Dotted', theme: 'generic' },
  { id: 'navy-dotted', name: 'Navy Dotted', theme: 'generic' },
  { id: 'slate-plus', name: 'Slate Plus', theme: 'generic' },
  { id: 'tan-dotted', name: 'Tan Dotted', theme: 'generic' },
];

/**
 * Solid-color playmats built from the Glacier color-token library: each is a
 * live token color (following the active theme) under a faint SVG grid, a clean
 * low-distraction alternative to the artwork mats. Accent hues use step 5 for a
 * rich felt tone; neutrals use the surface tokens.
 */
export const COLOR_PLAYMATS: Playmat[] = [
  { id: 'solid-blue', name: 'Blue', theme: 'solid', token: '--glacier-blue-5' },
  { id: 'solid-teal', name: 'Teal', theme: 'solid', token: '--glacier-teal-5' },
  { id: 'solid-green', name: 'Green', theme: 'solid', token: '--glacier-green-5' },
  { id: 'solid-amber', name: 'Amber', theme: 'solid', token: '--glacier-amber-5' },
  { id: 'solid-red', name: 'Crimson', theme: 'solid', token: '--glacier-red-5' },
  { id: 'solid-purple', name: 'Purple', theme: 'solid', token: '--glacier-purple-5' },
  { id: 'solid-graphite', name: 'Graphite', theme: 'solid', token: '--glacier-gray-5' },
  { id: 'solid-ink', name: 'Ink', theme: 'solid', token: '--glacier-bg' },
  { id: 'solid-slate', name: 'Slate', theme: 'solid', token: '--glacier-surface-sunken' },
  { id: 'solid-surface', name: 'Surface', theme: 'solid', token: '--glacier-surface' },
];

/**
 * Mood Swings mats. Every card in that game is graphite art sitting on pale
 * engineering graph paper - it is the one thing all 133 of them share - so the
 * table it is played on should be the same sheet, continued. These are drawn
 * rather than bundled for the same reason the solid mats are: it is a grid and
 * a paper tone, and an SVG of that is smaller than the webp of it would be and
 * scales to any table size without resampling.
 *
 * Five ruled tints, one per frame colour, so a table can sit in the mood it is
 * playing. `paper` is the ink; `tint` washes the sheet.
 */
export const PAPER_PLAYMATS: Playmat[] = [
  { id: 'graph-paper', name: 'Graph Paper', theme: 'moodswings', paper: '#3f5c8a' },
  { id: 'graph-rose', name: 'Ruled Rose', theme: 'moodswings', paper: '#a34168', tint: '#f6e7ee' },
  { id: 'graph-sage', name: 'Ruled Sage', theme: 'moodswings', paper: '#3f7a5c', tint: '#e6f1ea' },
  { id: 'graph-ember', name: 'Ruled Ember', theme: 'moodswings', paper: '#9c4a2f', tint: '#f7ebe4' },
  { id: 'graph-graphite', name: 'Ruled Graphite', theme: 'moodswings', paper: '#4a4a52', tint: '#ecebe8' },
];

export const PLAYMATS: Playmat[] = [...COLOR_PLAYMATS, ...PAPER_PLAYMATS, ...IMAGE_PLAYMATS];

export const DEFAULT_PLAYMAT = 'arcane-study';

/** Player-uploaded mats: `custom-<file>`, stored and served by the API. Every
 * viewer resolves the same URL from the synced id alone. */
export const CUSTOM_PLAYMAT_PREFIX = 'custom-';

export function isCustomPlaymat(id: string): boolean {
  return id.startsWith(CUSTOM_PLAYMAT_PREFIX);
}

export function playmatUrl(id: string): string {
  if (isCustomPlaymat(id)) {
    return `${SERVER_URL}/api/mats/${id.slice(CUSTOM_PLAYMAT_PREFIX.length)}`;
  }
  const known = IMAGE_PLAYMATS.some((mat) => mat.id === id) ? id : DEFAULT_PLAYMAT;
  // Absolute: this feeds the --pc-playmat custom property (see assetUrl).
  return assetUrl(`${import.meta.env.BASE_URL}mats/${known}.webp`);
}

/** A faint grid overlay, shared by every solid-color mat. Self-contained SVG so
 * it needs no bundled asset; cover-scaled it keeps square cells. */
const GRID_OVERLAY = (() => {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000'>` +
    `<defs><pattern id='g' width='40' height='40' patternUnits='userSpaceOnUse'>` +
    `<path d='M 20 13 V 27 M 13 20 H 27' fill='none' stroke='white' stroke-opacity='0.11' stroke-width='1.4' stroke-linecap='round'/>` +
    `</pattern></defs>` +
    `<rect width='1600' height='1000' fill='url(#g)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

/**
 * Engineering graph paper: a fine grid with every fifth line inked heavier.
 *
 * Drawn at 1600x1000 like GRID_OVERLAY above rather than as a small repeating
 * tile, because the mats are painted with `background-size: cover` - a 160px
 * tile would be scaled to the viewport and print squares the size of a fist.
 * At sheet size, cover lands near 1:1 on a normal window and the cells stay
 * cell-sized.
 *
 * The ink is a literal rgb() rather than a Glacier token on purpose: the solid
 * mats follow the app theme deliberately, but this one is meant to read as a
 * printed sheet, and paper does not invert when you turn the lights off.
 */
function graphSheet(ink: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
  const line = (alpha: number, width: number) =>
    `stroke='rgb(${r} ${g} ${b} / ${alpha})' stroke-width='${width}'`;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000'>` +
    `<defs>` +
    `<pattern id='fine' width='20' height='20' patternUnits='userSpaceOnUse'>` +
    `<path d='M20 0V20M0 20H20' fill='none' ${line(0.2, 0.8)}/>` +
    `</pattern>` +
    `<pattern id='major' width='100' height='100' patternUnits='userSpaceOnUse'>` +
    `<path d='M100 0V100M0 100H100' fill='none' ${line(0.38, 1.3)}/>` +
    `</pattern>` +
    `</defs>` +
    `<rect width='1600' height='1000' fill='url(#fine)'/>` +
    `<rect width='1600' height='1000' fill='url(#major)'/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Whether a mat is drawn graph paper rather than bundled art or a token. */
export function isPaperPlaymat(id: string): boolean {
  return PAPER_PLAYMATS.some((mat) => mat.id === id);
}

/**
 * The full CSS background value for a playmat, ready to assign to the
 * `--pc-playmat` / `--pc-board-mat` custom properties. Image mats resolve to a
 * single `url()`; solid-color mats resolve to the faint grid layered over the
 * live token color (two layers), so they track the active theme.
 */
export function playmatBackground(id: string): string {
  const mat = PLAYMATS.find((m) => m.id === id);
  if (mat?.token) {
    return `${GRID_OVERLAY}, linear-gradient(var(${mat.token}), var(${mat.token}))`;
  }
  if (mat?.paper) {
    const tint = mat.tint ?? '#f2efe6';
    return `${graphSheet(mat.paper)}, linear-gradient(${tint}, ${tint})`;
  }
  // An account keeps ONE custom mat, so a re-upload (or a server that has since
  // forgotten the file) leaves old ids pointing at nothing. A second layer
  // underneath means that paints the default felt rather than a blank surface:
  // the top layer simply fails to load and the one below shows through.
  if (isCustomPlaymat(id)) {
    return `url("${playmatUrl(id)}"), url("${playmatUrl(DEFAULT_PLAYMAT)}")`;
  }
  return `url("${playmatUrl(id)}")`;
}

/** Whether a playmat id is a solid-color (token) mat rather than bundled art. */
export function isColorPlaymat(id: string): boolean {
  return COLOR_PLAYMATS.some((mat) => mat.id === id);
}
