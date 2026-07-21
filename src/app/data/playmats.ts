/**
 * The PrettyCardboard playmats: fifteen wide backgrounds bundled at
 * public/mats/. The chosen mat is a preference; applyPreferences publishes it
 * as the `--pc-playmat` CSS custom property, which both the app backdrop (the
 * glass panels float over it) and the table felt read — one switch, the whole
 * app follows.
 */
import { assetUrl } from './assets.ts';
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

export const PLAYMATS: Playmat[] = [...COLOR_PLAYMATS, ...IMAGE_PLAYMATS];

export const DEFAULT_PLAYMAT = 'arcane-study';

export function playmatUrl(id: string): string {
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
  return `url("${playmatUrl(id)}")`;
}

/** Whether a playmat id is a solid-color (token) mat rather than bundled art. */
export function isColorPlaymat(id: string): boolean {
  return COLOR_PLAYMATS.some((mat) => mat.id === id);
}
