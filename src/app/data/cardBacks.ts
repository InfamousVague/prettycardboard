/**
 * The PrettyCardboard card backs: the classic Magic back (from Scryfall's
 * card-back CDN) plus seventeen original designs, all bundled at
 * public/backs/. The player's chosen back is a preference; applyPreferences
 * publishes it as the `--pc-card-back` CSS custom property, which every
 * face-down surface (GameCard, DeckStack layers, popup flip, skeletons)
 * reads - one switch, the whole app follows.
 */
import { assetUrl } from './assets.ts';
import type { AssetTheme } from './themes.ts';

export interface CardBack {
  id: string;
  name: string;
  /** Grouping for the customize picker; see [[themes.ts]]. */
  theme: AssetTheme;
}

export const CARD_BACKS: CardBack[] = [
  { id: 'classic', name: 'Classic Magic', theme: 'magic' },
  { id: 'glacier-core', name: 'Glacier Core', theme: 'generic' },
  { id: 'prismatic-holo-burst', name: 'Prismatic Holo Burst', theme: 'generic' },
  { id: 'five-color-stained-glass', name: 'Five-Color Stained Glass', theme: 'magic' },
  { id: 'celestial-atlas', name: 'Celestial Atlas', theme: 'generic' },
  { id: 'arcane-arcade', name: 'Arcane Arcade', theme: 'cyberpunk' },
  { id: 'atomic-lounge', name: 'Atomic Lounge', theme: 'generic' },
  { id: 'abyssal-bloom', name: 'Abyssal Bloom', theme: 'generic' },
  { id: 'crimson-court', name: 'Crimson Court', theme: 'generic' },
  { id: 'damascus-fold', name: 'Damascus Fold', theme: 'generic' },
  { id: 'fae-ring', name: 'Fae Ring', theme: 'magic' },
  { id: 'kintsugi-marble', name: 'Kintsugi Marble', theme: 'generic' },
  { id: 'old-school-woodcut', name: 'Old-School Woodcut', theme: 'generic' },
  { id: 'poison-garden', name: 'Poison Garden', theme: 'generic' },
  { id: 'rubber-hose-1928', name: 'Rubber-Hose 1928', theme: 'generic' },
  { id: 'silver-age-halftone', name: 'Silver-Age Halftone', theme: 'generic' },
  { id: 'sun-temple', name: 'Sun Temple', theme: 'generic' },
  { id: 'wyrmscale', name: 'Wyrmscale', theme: 'magic' },
  { id: 'botanical-arabesque', name: 'Botanical Arabesque', theme: 'generic' },
  { id: 'celestial-compass', name: 'Celestial Compass', theme: 'generic' },
  { id: 'chrome-crest-neon-noir', name: 'Chrome Crest Neon Noir', theme: 'cyberpunk' },
  { id: 'circuit-mandala', name: 'Circuit Mandala', theme: 'cyberpunk' },
  { id: 'damask-medallion', name: 'Damask Medallion', theme: 'generic' },
  { id: 'data-shard-hologram', name: 'Data-Shard Hologram', theme: 'cyberpunk' },
  { id: 'deco-sunburst', name: 'Deco Sunburst', theme: 'generic' },
  { id: 'modern-monogram', name: 'Modern Monogram', theme: 'generic' },
  { id: 'nebula-orb', name: 'Nebula Orb', theme: 'generic' },
  { id: 'netrunner-glyph', name: 'Netrunner Glyph', theme: 'cyberpunk' },
  { id: 'cyberpunk-cardback-1', name: 'Cyberpunk 01', theme: 'cyberpunk' },
  { id: 'cyberpunk-cardback-2', name: 'Cyberpunk 02', theme: 'cyberpunk' },
];

export const DEFAULT_CARD_BACK = 'classic';

/**
 * The default back per game. Leaving the card back on the default gives the
 * game-appropriate one - Magic's classic back, or the official Cyberpunk crest -
 * so face-down cards never wear the wrong game's back.
 */
export const DEFAULT_CARD_BACK_BY_GAME: Record<string, string> = {
  mtg: DEFAULT_CARD_BACK,
  cyberpunk: 'cyberpunk-cardback-2',
};

/**
 * The back a card should actually show for a given game. A player who left the
 * default back on gets the game-appropriate default; an explicit non-default
 * pick is always honored (they chose it on purpose).
 */
export function effectiveCardBack(prefBack: string | undefined, game: string | undefined): string {
  const pref = prefBack || DEFAULT_CARD_BACK;
  if (pref === DEFAULT_CARD_BACK && game) {
    return DEFAULT_CARD_BACK_BY_GAME[game] ?? DEFAULT_CARD_BACK;
  }
  return pref;
}

export function cardBackUrl(id: string): string {
  const known = CARD_BACKS.some((back) => back.id === id) ? id : DEFAULT_CARD_BACK;
  // Absolute: this feeds the --pc-card-back custom property (see assetUrl).
  return assetUrl(`${import.meta.env.BASE_URL}backs/${known}.jpg`);
}
