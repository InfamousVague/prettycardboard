import type { ComponentType } from 'react';
import {
  BarChart2,
  Bell,
  Crown,
  Dices,
  Download,
  Eye,
  Hand,
  Image,
  Keyboard,
  LayoutGrid,
  Palette,
  PanelRightOpen,
  RotateCw,
  ScrollText,
  Smartphone,
  Swords,
  Users,
  Wrench,
} from '@glacier/icons';
import { PlayingCardStack } from '../icons/cards.ts';
import type { MessageKey } from '../i18n.ts';

/**
 * The in-app changelog. Each release lists its player-facing highlights; the
 * WhatsNew modal announces every release newer than the version cached in
 * localStorage (pc.lastSeenVersion), so a returning player sees everything
 * they missed in one pass. Titles/descriptions live in i18n like all app copy.
 *
 * THIS TABLE IS A RELEASE PRECONDITION. CHANGELOG[0].version must equal the
 * version being shipped: the modal only opens for releases newer than the one
 * cached on the device, and closing it is the only thing that advances that
 * cache. 0.5.1 through 0.5.3 shipped with no entry here, which is why the
 * modal did not open once across all three and why their work is folded into
 * 0.6.0 rather than backfilled as invented history.
 */

/**
 * How a change reads to a player. Untagged is a legitimate state: the releases
 * before 0.6.0 were written as one long feature announcement, and retro-sorting
 * 23 of them into new/improved/fixed would be a judgement call per row rather
 * than a record of what happened.
 */
export type ChangelogKind = 'new' | 'improved' | 'fixed';

export interface ChangelogEntry {
  icon: ComponentType<{ size?: number }>;
  title: MessageKey;
  desc: MessageKey;
  /** Stable list key, so a title key reused across releases cannot collide. */
  id?: string;
  kind?: ChangelogKind;
  /** Area chip (clCat*), rendered beside the kind. */
  category?: MessageKey;
  /** The release's headline change: spans both columns when there are two. */
  featured?: boolean;
}

export interface ChangelogRelease {
  version: string;
  entries: ChangelogEntry[];
  /** ISO 8601 (YYYY-MM-DD). Rendered through Intl in the active locale, and
   *  only where it is known - the releases before 0.6.0 predate this field and
   *  a plausible-looking guess is worse than no date at all. */
  date?: string;
  /** One line summing the release up, shown above its entries. */
  headline?: MessageKey;
}

/** Newest release first. `releasesSince` sorts anyway, so a slip here is not
 *  load-bearing, but keep the literal in order for whoever reads it. */
export const CHANGELOG: ChangelogRelease[] = [
  {
    version: '0.8.0',
    date: '2026-08-01',
    headline: 'clHeadline080',
    entries: [
      {
        id: 'game-screens',
        icon: Swords,
        title: 'clGameScreens',
        desc: 'clGameScreensDesc',
        kind: 'new',
        category: 'clCatLayout',
        featured: true,
      },
      {
        id: 'rail-nav',
        icon: PanelRightOpen,
        title: 'clRailNav',
        desc: 'clRailNavDesc',
        kind: 'improved',
        category: 'clCatLayout',
      },
      {
        id: 'career-stats',
        icon: BarChart2,
        title: 'clCareerStats',
        desc: 'clCareerStatsDesc',
        kind: 'new',
        category: 'clCatApp',
      },
      {
        id: 'lobby-picker',
        icon: LayoutGrid,
        title: 'clLobbyPicker',
        desc: 'clLobbyPickerDesc',
        kind: 'fixed',
        category: 'clCatTable',
      },
    ],
  },
  {
    version: '0.7.0',
    date: '2026-08-01',
    headline: 'clHeadline070',
    entries: [
      {
        id: 'landscape-menus',
        icon: Smartphone,
        title: 'clLandscape',
        desc: 'clLandscapeDesc',
        kind: 'new',
        category: 'clCatLayout',
        featured: true,
      },
      {
        id: 'portrait-companion',
        icon: PanelRightOpen,
        title: 'clCompanion',
        desc: 'clCompanionDesc',
        kind: 'new',
        category: 'clCatTable',
      },
      {
        id: 'phone-nav',
        icon: LayoutGrid,
        title: 'clPhoneNav',
        desc: 'clPhoneNavDesc',
        kind: 'improved',
        category: 'clCatLayout',
      },
      {
        id: 'card-menu',
        icon: Hand,
        title: 'clCardMenu',
        desc: 'clCardMenuDesc',
        kind: 'improved',
        category: 'clCatTable',
      },
      {
        id: 'install',
        icon: Download,
        title: 'clInstall',
        desc: 'clInstallDesc',
        kind: 'new',
        category: 'clCatApp',
      },
      {
        id: 'fixes-070',
        icon: Wrench,
        title: 'clFixes070',
        desc: 'clFixes070Desc',
        kind: 'fixed',
        category: 'clCatTable',
      },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-07-31',
    headline: 'clHeadline060',
    entries: [
      {
        id: 'dock-panels',
        icon: PanelRightOpen,
        title: 'clDockPanels',
        desc: 'clDockPanelsDesc',
        kind: 'new',
        category: 'clCatLayout',
        featured: true,
      },
      {
        id: 'auto-updates',
        icon: Download,
        title: 'clAutoUpdates',
        desc: 'clAutoUpdatesDesc',
        kind: 'new',
        category: 'clCatApp',
      },
      {
        id: 'alerts',
        icon: Bell,
        title: 'clAlerts',
        desc: 'clAlertsDesc',
        kind: 'improved',
        category: 'clCatSocial',
      },
      {
        id: 'release-notes',
        icon: ScrollText,
        title: 'clReleaseNotes',
        desc: 'clReleaseNotesDesc',
        kind: 'improved',
        category: 'clCatApp',
      },
      {
        id: 'fixes-060',
        icon: Wrench,
        title: 'clFixes060',
        desc: 'clFixes060Desc',
        kind: 'fixed',
        category: 'clCatApp',
      },
    ],
  },
  {
    version: '0.5.0',
    entries: [
      { id: 'piles', icon: PlayingCardStack, title: 'clPiles', desc: 'clPilesDesc' },
      { id: 'totals', icon: Swords, title: 'clTotals', desc: 'clTotalsDesc' },
      { id: 'deck-mat', icon: Image, title: 'clDeckMat', desc: 'clDeckMatDesc' },
      { id: 'profile-stats', icon: BarChart2, title: 'clProfileStats', desc: 'clProfileStatsDesc' },
      { id: 'grid', icon: LayoutGrid, title: 'clGrid050', desc: 'clGrid050Desc' },
    ],
  },
  {
    version: '0.4.0',
    entries: [
      { id: 'mobile', icon: Smartphone, title: 'clMobile', desc: 'clMobileDesc' },
      { id: 'mobile-table', icon: Hand, title: 'clMobileTable', desc: 'clMobileTableDesc' },
      { id: 'mobile-shell', icon: LayoutGrid, title: 'clMobileShell', desc: 'clMobileShellDesc' },
    ],
  },
  {
    version: '0.3.0',
    entries: [
      { id: 'custom-mat', icon: Image, title: 'clCustomMat', desc: 'clCustomMatDesc' },
      { id: 'reveal-tray', icon: Eye, title: 'clRevealTray', desc: 'clRevealTrayDesc' },
      { id: 'matchup-stats', icon: BarChart2, title: 'clMatchupStats', desc: 'clMatchupStatsDesc' },
      { id: 'polish', icon: Crown, title: 'clPolish030', desc: 'clPolish030Desc' },
    ],
  },
  {
    version: '0.2.0',
    entries: [
      { id: 'mat-editor', icon: LayoutGrid, title: 'clMatEditor', desc: 'clMatEditorDesc' },
      { id: 'formats', icon: Swords, title: 'clFormats', desc: 'clFormatsDesc' },
      { id: 'commander', icon: Crown, title: 'clCommander', desc: 'clCommanderDesc' },
      { id: 'mulligans', icon: RotateCw, title: 'clMulligans', desc: 'clMulligansDesc' },
      { id: 'dice', icon: Dices, title: 'clDice', desc: 'clDiceDesc' },
      { id: 'presence', icon: Users, title: 'clPresence', desc: 'clPresenceDesc' },
      { id: 'giving', icon: Hand, title: 'clGiving', desc: 'clGivingDesc' },
      { id: 'skins', icon: Palette, title: 'clSkins', desc: 'clSkinsDesc' },
      { id: 'replay', icon: ScrollText, title: 'clReplay', desc: 'clReplayDesc' },
      { id: 'keybinds', icon: Keyboard, title: 'clKeybinds', desc: 'clKeybindsDesc' },
      { id: 'table-polish', icon: Eye, title: 'clTablePolish', desc: 'clTablePolishDesc' },
    ],
  },
];

/** Numeric semver compare: is `a` newer than `b`? Unparseable parts count as 0. */
export function versionNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

/**
 * Every release newer than `since` (newest first); all of them when unknown.
 *
 * Always a fresh array, sorted here rather than trusting the literal's
 * hand-kept order: a caller that renders "newest first" should not depend on
 * whoever adds the next release remembering to put it at the top, and nobody
 * downstream should be able to reorder the module's own table by sorting the
 * value they were handed.
 */
export function releasesSince(since: string | null): ChangelogRelease[] {
  const matched = since
    ? CHANGELOG.filter((release) => versionNewer(release.version, since))
    : [...CHANGELOG];
  return matched.sort((a, b) => {
    if (versionNewer(a.version, b.version)) return -1;
    if (versionNewer(b.version, a.version)) return 1;
    return 0;
  });
}
