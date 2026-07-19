/**
 * The PrettyCardboard playmats: fifteen wide backgrounds bundled at
 * public/mats/. The chosen mat is a preference; applyPreferences publishes it
 * as the `--pc-playmat` CSS custom property, which both the app backdrop (the
 * glass panels float over it) and the table felt read — one switch, the whole
 * app follows.
 */
import { assetUrl } from './assets.ts';

export interface Playmat {
  id: string;
  name: string;
}

export const PLAYMATS: Playmat[] = [
  { id: 'arcane-study', name: 'Arcane Study' },
  { id: 'tavern', name: 'Tavern Table' },
  { id: 'house-felt', name: 'House Felt' },
  { id: 'plains', name: 'Plains' },
  { id: 'island', name: 'Island' },
  { id: 'swamp', name: 'Swamp' },
  { id: 'mountain', name: 'Mountain' },
  { id: 'forest', name: 'Forest' },
  { id: 'confluence', name: 'Confluence Nexus' },
  { id: 'marble', name: 'Marble Sanctum' },
  { id: 'boneyard', name: 'Misted Boneyard' },
  { id: 'forgefloor', name: 'Forgefloor' },
  { id: 'fae-glade', name: 'Fae Glade' },
  { id: 'planar-sky', name: 'Planar Sky' },
  { id: 'neon-grid', name: 'Neon Grid' },
];

export const DEFAULT_PLAYMAT = 'arcane-study';

export function playmatUrl(id: string): string {
  const known = PLAYMATS.some((mat) => mat.id === id) ? id : DEFAULT_PLAYMAT;
  // Absolute: this feeds the --pc-playmat custom property (see assetUrl).
  return assetUrl(`${import.meta.env.BASE_URL}mats/${known}.webp`);
}
