/**
 * The PrettyCardboard card backs: the classic Magic back (from Scryfall's
 * card-back CDN) plus seventeen original designs, all bundled at
 * public/backs/. The player's chosen back is a preference; applyPreferences
 * publishes it as the `--pc-card-back` CSS custom property, which every
 * face-down surface (GameCard, DeckStack layers, popup flip, skeletons)
 * reads - one switch, the whole app follows.
 */
import { assetUrl } from './assets.ts';

export interface CardBack {
  id: string;
  name: string;
}

export const CARD_BACKS: CardBack[] = [
  { id: 'classic', name: 'Classic Magic' },
  { id: 'glacier-core', name: 'Glacier Core' },
  { id: 'prismatic-holo-burst', name: 'Prismatic Holo Burst' },
  { id: 'five-color-stained-glass', name: 'Five-Color Stained Glass' },
  { id: 'celestial-atlas', name: 'Celestial Atlas' },
  { id: 'arcane-arcade', name: 'Arcane Arcade' },
  { id: 'atomic-lounge', name: 'Atomic Lounge' },
  { id: 'abyssal-bloom', name: 'Abyssal Bloom' },
  { id: 'crimson-court', name: 'Crimson Court' },
  { id: 'damascus-fold', name: 'Damascus Fold' },
  { id: 'fae-ring', name: 'Fae Ring' },
  { id: 'kintsugi-marble', name: 'Kintsugi Marble' },
  { id: 'old-school-woodcut', name: 'Old-School Woodcut' },
  { id: 'poison-garden', name: 'Poison Garden' },
  { id: 'rubber-hose-1928', name: 'Rubber-Hose 1928' },
  { id: 'silver-age-halftone', name: 'Silver-Age Halftone' },
  { id: 'sun-temple', name: 'Sun Temple' },
  { id: 'wyrmscale', name: 'Wyrmscale' },
];

export const DEFAULT_CARD_BACK = 'classic';

export function cardBackUrl(id: string): string {
  const known = CARD_BACKS.some((back) => back.id === id) ? id : DEFAULT_CARD_BACK;
  // Absolute: this feeds the --pc-card-back custom property (see assetUrl).
  return assetUrl(`${import.meta.env.BASE_URL}backs/${known}.jpg`);
}
