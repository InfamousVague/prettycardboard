import { useEffect, useMemo, useState } from 'react';
import { Button, MenuItem, SplitButton } from '@glacier/react';
import { Apple, Download, Monitor, Terminal } from '@glacier/icons';
import { useT } from '../i18n.ts';

/**
 * A download control for the desktop app. It reads the latest GitHub Release,
 * detects the visitor's OS, and offers that installer as the primary action —
 * with a dropdown (the same SplitButton used for End turn) for the other
 * platforms and the full release page. Before the first release exists the
 * GitHub API 404s, so it gracefully falls back to linking the releases page.
 */

const REPO = 'InfamousVague/prettycardboard';
const RELEASES = `https://github.com/${REPO}/releases`;
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

type Platform = 'mac' | 'windows' | 'linux-deb' | 'linux-rpm';
interface Asset {
  platform: Platform;
  name: string;
  url: string;
}

function detectOS(): 'mac' | 'windows' | 'linux' | null {
  if (typeof navigator === 'undefined') return null;
  const ua = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  if (/mac|iphone|ipad/.test(ua)) return 'mac';
  if (/win/.test(ua)) return 'windows';
  if (/linux|x11/.test(ua)) return 'linux';
  return null;
}

function classify(name: string): Platform | null {
  const n = name.toLowerCase();
  if (n.endsWith('.dmg')) return 'mac';
  if (n.endsWith('-setup.exe') || n.endsWith('.msi') || n.endsWith('.exe')) return 'windows';
  if (n.endsWith('.deb')) return 'linux-deb';
  if (n.endsWith('.rpm')) return 'linux-rpm';
  return null;
}

interface ReleaseInfo {
  version: string;
  assets: Asset[];
}

export function DownloadButton({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const t = useT();
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { tag_name: string; assets: { name: string; browser_download_url: string }[] }) => {
        if (cancelled) return;
        const assets: Asset[] = [];
        for (const a of data.assets ?? []) {
          const platform = classify(a.name);
          // keep the first (preferred) asset per platform
          if (platform && !assets.some((x) => x.platform === platform)) {
            assets.push({ platform, name: a.name, url: a.browser_download_url });
          }
        }
        setRelease({ version: data.tag_name, assets });
      })
      .catch(() => {
        // no published release yet — fall back to the releases page
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const byPlatform = useMemo(() => {
    const map = new Map<Platform, Asset>();
    for (const a of release?.assets ?? []) map.set(a.platform, a);
    return map;
  }, [release]);

  const os = detectOS();
  const primary: Asset | undefined =
    (os === 'mac' && byPlatform.get('mac')) ||
    (os === 'windows' && byPlatform.get('windows')) ||
    (os === 'linux' && (byPlatform.get('linux-deb') || byPlatform.get('linux-rpm'))) ||
    undefined;

  const go = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

  const label = (p: Platform): string =>
    p === 'mac' ? t('dlMac') : p === 'windows' ? t('dlWindows') : p === 'linux-deb' ? t('dlLinuxDeb') : t('dlLinuxRpm');
  const icon = (p: Platform) =>
    p === 'mac' ? <Apple size={15} /> : p === 'windows' ? <Monitor size={15} /> : <Terminal size={15} />;

  // Before any release exists (or if the fetch fails): a plain button to the
  // releases page.
  if (!release || release.assets.length === 0) {
    return (
      <Button size={size} onClick={() => go(RELEASES)} loading={loading}>
        <Download size={15} /> {t('dlGetDesktop')}
      </Button>
    );
  }

  const others = (['mac', 'windows', 'linux-deb', 'linux-rpm'] as Platform[]).filter(
    (p) => byPlatform.has(p) && byPlatform.get(p) !== primary,
  );

  const menu = (
    <>
      {others.map((p) => (
        <MenuItem key={p} onSelect={() => go(byPlatform.get(p)!.url)}>
          {icon(p)} {label(p)}
        </MenuItem>
      ))}
      <MenuItem onSelect={() => go(RELEASES)}>{t('dlAllVersions')}</MenuItem>
    </>
  );

  const mainAsset = primary ?? byPlatform.values().next().value!;
  const mainLabel = primary
    ? `${t('dlDownloadFor')} ${label(primary.platform)}`
    : t('dlGetDesktop');

  return (
    <SplitButton
      size={size}
      onAction={() => go(mainAsset.url)}
      menu={menu}
      menuLabel={t('dlOtherPlatforms')}
    >
      <Download size={15} /> {mainLabel} <span className="dlVersion">{release.version}</span>
    </SplitButton>
  );
}
