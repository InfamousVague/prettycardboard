/**
 * Shared grouping for the customization assets (playmats + card backs). As the
 * catalog grows across games — Magic, the Cyberpunk TCG, and game-agnostic
 * designs — the Customize picker filters by these themes instead of showing
 * one long flat list. A new asset just tags a theme (see [[playmats.ts]] and
 * [[cardBacks.ts]]); the picker discovers which themes are present and only
 * renders chips for those, so no UI change is needed to add a category's art.
 */
import type { MessageKey } from '../i18n.ts';

export type AssetTheme = 'magic' | 'cyberpunk' | 'generic';

/** Canonical display order for theme filters. */
export const THEME_ORDER: AssetTheme[] = ['magic', 'cyberpunk', 'generic'];

/** i18n key for each theme's chip label. */
export const THEME_LABEL_KEY: Record<AssetTheme, MessageKey> = {
  magic: 'custThemeMagic',
  cyberpunk: 'custThemeCyberpunk',
  generic: 'custThemeGeneric',
};

/** Themes actually present in a list, in canonical order (empty ones dropped). */
export function presentThemes(items: ReadonlyArray<{ theme: AssetTheme }>): AssetTheme[] {
  const seen = new Set(items.map((item) => item.theme));
  return THEME_ORDER.filter((theme) => seen.has(theme));
}
