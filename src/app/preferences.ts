import { accentOptions, type Density, type SansFont, type MonoFont } from '@glacier/tokens';
import type { VisualFeedbackVariant, VisualFeedbackIntensity } from '@glacier/react';

/**
 * The app-wide look-and-feel knobs. Everything here maps to a Glacier token
 * surface: theme and density and accent are stamped as `data-*` attributes on
 * the document element, which the generated token CSS keys off. Persisted so a
 * reopened window remembers the user's choices.
 */
import type { AppLocale } from './i18n.ts';
import type { Keybinds } from './data/keybinds.ts';
import { DEFAULT_CARD_BACK, cardBackUrl } from './data/cardBacks.ts';
import { DEFAULT_PLAYMAT, playmatBackground } from './data/playmats.ts';
import { DEFAULT_DICE_SKIN } from './data/diceSkins.ts';

export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  density: Density;
  layout: 'floating' | 'full';
  /** How persistent panels present themselves. This is the OCCLUSION axis, and
   * it is not the same thing as `layout` above (which is chrome: detached card
   * vs flush edge). 'float' lets a panel overlay the content it belongs to;
   * 'dock' makes it reserve real layout space so the panel and the content are
   * readable at once. 'auto' follows `layout`, which is what lets the one
   * Settings control move both axes together. Resolved before it ever reaches
   * the DOM or a panel - see resolvePanelDock. */
  panelDock: 'auto' | 'float' | 'dock';
  accent: string;
  /** The sans typeface, stamped as data-font. */
  font: SansFont;
  /** The monospace typeface, stamped as data-mono. */
  mono: MonoFont;
  /** Corner-rounding multiplier for every radius token (1 = default). */
  radiusScale: number;
  /** Backdrop-blur multiplier for every glass surface (1 = default). */
  frostedness: number;
  locale: AppLocale;
  /** Force-minimize animations app-wide, independent of the OS setting. */
  reduceMotion: boolean;
  /** Tactile table/interaction sounds (cards, dice, shuffle). Off by default. */
  soundEffects: boolean;
  /** Alert sounds — the turn indicator and player ping. On by default, and
   * independent of the table sounds. */
  alertSounds: boolean;
  /** Master table-sound volume, normalized from 0 to 1. */
  soundVolume: number;
  haptics: boolean;
  /** The on-screen counterpart to haptics; fires for every pointer type. */
  visualFeedback: boolean;
  visualFeedbackVariant: VisualFeedbackVariant;
  visualFeedbackIntensity: VisualFeedbackIntensity;
  /** The face-down card art, one of the bundled PrettyCardboard backs. */
  cardBack: string;
  /** The table/backdrop artwork, one of the bundled PrettyCardboard mats. */
  playmat: string;
  /** The 3D dice look, one of the entries in data/diceSkins.ts. */
  diceSkin: string;
  /** The player's uploaded custom playmat id (`custom-<file>` on the server),
   * remembered so the upload stays pickable after switching to a bundled mat.
   * Empty = never uploaded. */
  customPlaymat: string;
  /** Every playmat this account has uploaded, newest first - a mat belongs to
   *  the deck that chose it, so there are as many as the player has made.
   *  Mirrored from the account on sign-in; the pickers list them all. */
  customPlaymats: string[];
  /** The account's uploaded card back id, mirrored from /api/me. */
  customCardBack: string;
  /** Lay battlefield cards perfectly upright instead of the natural slight
   * per-card tilt. */
  verticalCards: boolean;
  /** Show a staged opponent's board mirrored 180deg (across-the-table view,
   * cards upside down). Off shows their board upright. */
  mirrorOpponent: boolean;
  /** The phone table layout: 'auto' follows the viewport; 'on'/'off' force it
   * (never trust auto-detection alone on the web). */
  mobileLayout: 'auto' | 'on' | 'off';
  /** Extra eye-candy: a very subtle continuous idle drift on battlefield cards
   * that catches the light and shows off holographic art. Off by default. */
  ambientCards: boolean;
  /** Print each creature's CURRENT power/toughness in its bottom corner -
   * printed base plus every P/T counter - so nobody has to add up counters in
   * their head. On by default. */
  cardTotals: boolean;
  /** Automatically untap your permanents at the start of your turn (off by
   * default; this app is manual-play first). Synced to the table via auto.set. */
  autoUntap: boolean;
  /** Automatically draw a card at the start of your turn (off by default). */
  autoDraw: boolean;
  /** Show private rules advice at the table when a move looks like it breaks a
   * Magic rule. Purely a teaching aid - it never blocks or undoes anything, so
   * house rules and unusual cards are unaffected. Off by default. */
  rulesCoach: boolean;
  /** Enforced rooms: automatically pass priority windows (a spell on the
   * stack, an opponent's end step) when you hold nothing castable. */
  autoPass: boolean;
  /** Always stop on opposing spells even with nothing castable. */
  alwaysStopStack: boolean;
  /** Always stop on opponents' end steps even with nothing castable. */
  alwaysStopEndStep: boolean;
  /** Skip the "add the +1/+1 counters?" prompt and just add them. Off by
   * default: the prompt asks every time until you tell it not to, and this is
   * what its "always apply" answer sets. Only ever touches cards on your own
   * board, so turning it on cannot move an opponent's counters. */
  autoCounters: boolean;
  /** Developer / work-in-progress features (off by default). Gates everything
   * that isn't production-ready — currently the whole Cyberpunk TCG game. */
  enableWip: boolean;
  /** Per-game table keyboard shortcuts (KeyboardEvent.code). Sparse: only
   * user-changed entries; absent actions use the catalog defaults in
   * data/keybinds.ts, so a new action never needs a stored migration. */
  keybinds: Keybinds;
}

export const ACCENTS = accentOptions;

export const SANS_FONTS: Array<{ value: SansFont; label: string }> = [
  { value: 'inter', label: 'Inter' },
  { value: 'noto', label: 'Noto Sans' },
  { value: 'plex', label: 'IBM Plex' },
];

export const MONO_FONTS: Array<{ value: MonoFont; label: string }> = [
  { value: 'jetbrains', label: 'JetBrains' },
  { value: 'plex', label: 'IBM Plex' },
];

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  density: 'comfortable',
  layout: 'floating',
  panelDock: 'auto',
  accent: accentOptions[0]!.name,
  font: 'inter',
  mono: 'jetbrains',
  radiusScale: 0.8,
  frostedness: 1,
  locale: 'en',
  reduceMotion: false,
  soundEffects: false,
  alertSounds: true,
  soundVolume: 0.65,
  haptics: false,
  visualFeedback: false,
  visualFeedbackVariant: 'shockwave',
  visualFeedbackIntensity: 'subtle',
  cardBack: DEFAULT_CARD_BACK,
  playmat: DEFAULT_PLAYMAT,
  diceSkin: DEFAULT_DICE_SKIN,
  customPlaymat: '',
  customPlaymats: [],
  customCardBack: '',
  verticalCards: false,
  // Across-the-table mirroring is a taste, not a default: new players read
  // an upright board faster, and anyone who wants the tabletop feel can
  // still flip it on in Settings -> Table.
  mirrorOpponent: false,
  mobileLayout: 'auto',
  ambientCards: false,
  cardTotals: true,
  autoUntap: false,
  autoDraw: false,
  rulesCoach: false,
  autoPass: true,
  alwaysStopStack: false,
  alwaysStopEndStep: false,
  autoCounters: false,
  enableWip: false,
  keybinds: {},
};

const STORAGE_KEY = 'glacier-starter:preferences';

const PREFS_VERSION = 2;

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const stored = JSON.parse(raw) as Partial<Preferences> & { v?: number };
    // v1 -> v2: the default rounding dropped from 1 to 0.8; a stored 1 from
    // the old default follows the new default rather than pinning the old one.
    if (stored.v === undefined && stored.radiusScale === 1) delete stored.radiusScale;
    return { ...DEFAULT_PREFERENCES, ...stored };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...preferences, v: PREFS_VERSION }));
  } catch {
    /* ignore write failures (private mode, quota) */
  }
}

/** The two ways a persistent panel can present itself. 'auto' is a preference
 *  value only - it is resolved away before anything reads it. */
export type DockMode = 'float' | 'dock';

/**
 * Resolve the dock axis for the whole app.
 *
 * Phones never dock: an inline gutter is width they do not have, and their
 * docked form of a side panel is already a full-width bottom sheet. This is the
 * ONLY place that suppression may live - the phone breakpoint (PHONE_QUERY in
 * hooks/useIsPhone.ts) has a `(max-height: 480px)` clause, so an ordinary short
 * desktop window counts as a phone, and a CSS-only guard would let such a
 * window reserve a gutter with no panel in it.
 */
export function resolvePanelDock(
  preferences: Pick<Preferences, 'panelDock' | 'layout'>,
  phone: boolean,
): DockMode {
  if (phone) return 'float';
  const mode = preferences.panelDock ?? DEFAULT_PREFERENCES.panelDock;
  if (mode !== 'auto') return mode;
  return preferences.layout === 'full' ? 'dock' : 'float';
}

/**
 * Stamp the RESOLVED dock mode on the document element. Always present and
 * never 'auto', so a stylesheet can key on `:root[data-panel-dock='dock']`
 * without knowing about the preference or the breakpoint.
 *
 * Two callers, because the value depends on two things that move separately:
 * applyPreferences below (the preference side) and App's phone effect (the
 * breakpoint side, which is the only place that knows it).
 */
export function applyPanelDock(
  preferences: Pick<Preferences, 'panelDock' | 'layout'>,
  phone: boolean,
): void {
  document.documentElement.setAttribute('data-panel-dock', resolvePanelDock(preferences, phone));
}

/**
 * Reflect the preferences onto the document element. Each value that equals
 * its default clears the attribute so the token `:root` defaults win, exactly
 * how the Glacier docs app drives its own theming.
 */
export function applyPreferences(preferences: Preferences): void {
  const root = document.documentElement;
  const { theme, density, layout, accent, font, mono, radiusScale, frostedness, reduceMotion } = preferences;

  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  if (density === 'comfortable') root.removeAttribute('data-density');
  else root.setAttribute('data-density', density);

  // The portalled kit surfaces (Drawer, Modal) read the layout mode from the
  // root, so it is always stamped.
  root.setAttribute('data-layout', layout);

  // The dock axis resolves from the layout above PLUS the phone breakpoint,
  // which only the shell knows - so read the flag back off the root that App
  // stamps rather than re-deriving it here. App restamps on its own when the
  // breakpoint moves without a preference change.
  applyPanelDock(preferences, root.dataset.phone === 'on');

  if (accent === DEFAULT_PREFERENCES.accent) root.removeAttribute('data-accent');
  else root.setAttribute('data-accent', accent);

  // The default typefaces are the :root values, so clear the attribute for them.
  if (font === DEFAULT_PREFERENCES.font) root.removeAttribute('data-font');
  else root.setAttribute('data-font', font);

  if (mono === DEFAULT_PREFERENCES.mono) root.removeAttribute('data-mono');
  else root.setAttribute('data-mono', mono);

  // Rounding scales every radius token; frostedness scales every glass blur.
  if (radiusScale === 1) root.style.removeProperty('--glacier-radius-scale');
  else root.style.setProperty('--glacier-radius-scale', String(radiusScale));

  if (frostedness === 1) root.style.removeProperty('--glacier-glass-blur-scale');
  else root.style.setProperty('--glacier-glass-blur-scale', String(frostedness));

  // A forced reduce-motion preference stamps the root so CSS (and the app's
  // motion driver via MotionConfig in App.tsx) can quiet every animation. The
  // OS `prefers-reduced-motion` still applies on its own when this is off.
  if (reduceMotion) root.setAttribute('data-reduce-motion', 'true');
  else root.removeAttribute('data-reduce-motion');

  // Every face-down surface in the app paints this one property.
  root.style.setProperty('--pc-card-back', `url("${cardBackUrl(preferences.cardBack)}")`);

  // The playmat backs the whole shell (glass panels float on it) and the table.
  root.style.setProperty('--pc-playmat', playmatBackground(preferences.playmat));
  // Live surfaces (the table felt, the room's synced mat) listen for this.
  window.dispatchEvent(new CustomEvent('pc:preferences', { detail: preferences }));
}
