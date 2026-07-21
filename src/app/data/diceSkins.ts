/**
 * Dice skins for the 3D roller (@3d-dice/dice-box-threejs). Each skin is a
 * colour + built-in material combination — no external texture assets required,
 * so they work offline out of the box. The `accent` skin follows the live theme
 * accent; the rest are fixed jewel/metal tones. If we ever want image-textured
 * dice (marble, galaxy, etc.) that needs bundled texture maps — ask and we can
 * add a `texture` field wired to dice-box's theme_texture.
 */
export interface DiceSkin {
  id: string;
  name: string;
  /** Follow the theme accent instead of the fixed colour. */
  accent?: boolean;
  /** Die body colour (hex). */
  color: string;
  /** Pip / number colour (hex). */
  pip: string;
  /** dice-box material finish. */
  material: 'plastic' | 'metal' | 'glass' | 'wood';
  /** Optional built-in dice-box texture name (assets in public/textures/) for
   * rich "resin"-style dice — e.g. a galaxy/nebula look. */
  texture?: string;
}

export const DICE_SKINS: DiceSkin[] = [
  { id: 'accent', name: 'Accent', accent: true, color: '#f4d03f', pip: '#141018', material: 'plastic' },
  { id: 'ruby', name: 'Ruby', color: '#c0392b', pip: '#f7e9e6', material: 'plastic' },
  { id: 'sapphire', name: 'Sapphire', color: '#2e5cb8', pip: '#eef2fb', material: 'plastic' },
  { id: 'emerald', name: 'Emerald', color: '#1e8449', pip: '#eafaf0', material: 'plastic' },
  { id: 'amethyst', name: 'Amethyst', color: '#7d3c98', pip: '#f6ecfb', material: 'plastic' },
  { id: 'gold', name: 'Gold', color: '#d4af37', pip: '#2a2410', material: 'metal' },
  { id: 'steel', name: 'Steel', color: '#7f8c99', pip: '#12151a', material: 'metal' },
  { id: 'obsidian', name: 'Obsidian', color: '#1b1b22', pip: '#e8e8ef', material: 'metal' },
  { id: 'ivory', name: 'Ivory', color: '#ece6d6', pip: '#20222a', material: 'plastic' },
  { id: 'jade', name: 'Jade', color: '#2aa198', pip: '#04211d', material: 'glass' },
  // Resin-style textured dice (galaxy / nebula / stone) via built-in textures.
  { id: 'cosmos', name: 'Cosmos', color: '#3a2a6a', pip: '#f2ecff', material: 'glass', texture: 'astral' },
  { id: 'nebula', name: 'Nebula', color: '#6a2350', pip: '#ffe9fb', material: 'glass', texture: 'astral' },
  { id: 'starfield', name: 'Starfield', color: '#141a2c', pip: '#eaf0ff', material: 'plastic', texture: 'stars' },
  { id: 'marble', name: 'Marble', color: '#e9e6df', pip: '#20222a', material: 'plastic', texture: 'marble' },
  { id: 'speckle', name: 'Speckle', color: '#2b3040', pip: '#f0f2f6', material: 'plastic', texture: 'speckles' },
];

export const DEFAULT_DICE_SKIN = 'accent';

export function diceSkinById(id: string | undefined): DiceSkin {
  return DICE_SKINS.find((skin) => skin.id === id) ?? DICE_SKINS[0]!;
}
