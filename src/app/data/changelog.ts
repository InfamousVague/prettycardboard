import type { ComponentType } from 'react';
import {
  BarChart2,
  Crown,
  Dices,
  Eye,
  Hand,
  Image,
  Keyboard,
  LayoutGrid,
  Palette,
  RotateCw,
  ScrollText,
  Swords,
  Users,
} from '@glacier/icons';
import type { MessageKey } from '../i18n.ts';

/**
 * The in-app changelog. Each release lists its player-facing highlights; the
 * WhatsNew modal announces every release newer than the version cached in
 * localStorage (pc.lastSeenVersion), so a returning player sees everything
 * they missed in one pass. Titles/descriptions live in i18n like all app copy.
 */

export interface ChangelogEntry {
  icon: ComponentType<{ size?: number }>;
  title: MessageKey;
  desc: MessageKey;
}

export interface ChangelogRelease {
  version: string;
  entries: ChangelogEntry[];
}

/** Newest release first. */
export const CHANGELOG: ChangelogRelease[] = [
  {
    version: '0.3.0',
    entries: [
      { icon: Image, title: 'clCustomMat', desc: 'clCustomMatDesc' },
      { icon: Eye, title: 'clRevealTray', desc: 'clRevealTrayDesc' },
      { icon: BarChart2, title: 'clMatchupStats', desc: 'clMatchupStatsDesc' },
      { icon: Crown, title: 'clPolish030', desc: 'clPolish030Desc' },
    ],
  },
  {
    version: '0.2.0',
    entries: [
      { icon: LayoutGrid, title: 'clMatEditor', desc: 'clMatEditorDesc' },
      { icon: Swords, title: 'clFormats', desc: 'clFormatsDesc' },
      { icon: Crown, title: 'clCommander', desc: 'clCommanderDesc' },
      { icon: RotateCw, title: 'clMulligans', desc: 'clMulligansDesc' },
      { icon: Dices, title: 'clDice', desc: 'clDiceDesc' },
      { icon: Users, title: 'clPresence', desc: 'clPresenceDesc' },
      { icon: Hand, title: 'clGiving', desc: 'clGivingDesc' },
      { icon: Palette, title: 'clSkins', desc: 'clSkinsDesc' },
      { icon: ScrollText, title: 'clReplay', desc: 'clReplayDesc' },
      { icon: Keyboard, title: 'clKeybinds', desc: 'clKeybindsDesc' },
      { icon: Eye, title: 'clTablePolish', desc: 'clTablePolishDesc' },
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

/** Every release newer than `since` (newest first); all of them when unknown. */
export function releasesSince(since: string | null): ChangelogRelease[] {
  if (!since) return CHANGELOG;
  return CHANGELOG.filter((release) => versionNewer(release.version, since));
}
