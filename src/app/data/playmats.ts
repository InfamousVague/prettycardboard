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
}

export const PLAYMATS: Playmat[] = [
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
];

export const DEFAULT_PLAYMAT = 'arcane-study';

export function playmatUrl(id: string): string {
  const known = PLAYMATS.some((mat) => mat.id === id) ? id : DEFAULT_PLAYMAT;
  // Absolute: this feeds the --pc-playmat custom property (see assetUrl).
  return assetUrl(`${import.meta.env.BASE_URL}mats/${known}.webp`);
}
