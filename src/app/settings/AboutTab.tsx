import { useEffect, useState } from 'react';
import { Button, Pill, ProgressBar, Row, Text, Size, TextTone } from '@glacier/react';
import { Download, ExternalLink, RefreshCw, Sparkles } from '../icons/backfilled.tsx';
import { useT } from '../i18n.ts';
import { canSelfUpdate, currentVersion } from '../updater.ts';
import { useUpdate } from '../state/updateStore.ts';
import { useGame } from '../state/gameStore.ts';
import { UpdateHighlights } from '../components/UpdateNotice.tsx';
import { isTauri } from '../tauri.ts';
import { useMobileLayout } from '../hooks/useIsPhone.ts';
// The settings-wide stylesheet (the short-but-wide two-pane layout, decision
// 10). It belongs to the whole settings tree rather than to this tab, and it
// hangs here because About is the one section that is always in the rail - the
// import only has to put the file in the modal's chunk, and every rule inside
// is scoped to .pcSettings.
import './settings.css';

/** The public marketing name, brand-fixed across locales. */
const APP_NAME = 'PrettyCardboard';
const DOWNLOAD_URL = 'https://prettycardboard.com/download';
const SITE_URL = 'https://prettycardboard.com';

/** Open a URL in the user's browser — via the Tauri opener when desktop, else a new tab. */
async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { openUrl } = await import(/* @vite-ignore */ '@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch {
      // fall through to the web path
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** About & Updates: version, self-update flow (desktop only), and links. */
export function AboutTab() {
  const t = useT();
  const phone = useMobileLayout();
  const [version, setVersion] = useState<string | null>(null);
  // The update lives in a store, not in this tab: UpdateHost checks in the
  // background, so a release found while the player was on the home page is
  // already waiting here when they arrive, and the button below is a
  // force-check rather than the only way anyone ever learns about a release.
  const status = useUpdate((state) => state.status);
  const pending = useUpdate((state) => state.pending);
  const progress = useUpdate((state) => state.progress);
  const check = useUpdate((state) => state.check);
  const apply = useUpdate((state) => state.apply);
  // Settings opens from the in-game toolbar (App.tsx:354), and installing ends
  // in an unconditional relaunch - so this tab has to know about the table.
  const inRoom = useGame((state) => state.room !== null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    void currentVersion().then((v) => {
      if (alive) setVersion(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const busy = status === 'downloading' || status === 'installing';

  return (
    <div style={{ display: 'grid', gap: 'var(--glacier-space-5)' }}>
      <Row justify="between" align="center" gap={3} wrap>
        <div style={{ display: 'grid', gap: 'var(--glacier-space-1)' }}>
          <Text as="span" weight="medium">
            {APP_NAME}
          </Text>
          <Text as="span" size={Size.Small} tone={TextTone.Muted}>
            {t('setCredits')}
          </Text>
        </div>
        <Row align="center" gap={2}>
          {/* The changelog used to be a one-shot: dismiss it and this device
              could never see the release notes again. This is the way back. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.dispatchEvent(new CustomEvent('pc:open-whatsnew'))}
          >
            <Sparkles size={16} />
            {t('updSeeWhatsNew')}
          </Button>
          <Pill tone="neutral" size="md">
            {t('setVersion')} {version ?? '…'}
          </Pill>
        </Row>
      </Row>

      {canSelfUpdate ? (
        <div style={{ display: 'grid', gap: 'var(--glacier-space-3)' }}>
          <Row align="center" gap={3} wrap>
            {/* Disabled once something is found: the card right below already
                answers the question, and re-checking would hand back a second
                handle for the release we are in the middle of staging. */}
            <Button
              variant="outline"
              loading={status === 'checking'}
              disabled={busy || pending !== null}
              onClick={() => void check()}
            >
              <RefreshCw size={16} />
              {status === 'checking' ? t('setChecking') : t('setCheckUpdates')}
            </Button>
            {status === 'uptodate' && (
              <Text as="span" size={Size.Small} tone={TextTone.Muted}>
                {t('setUpToDate')}
              </Text>
            )}
            {status === 'error' && (
              <Text as="span" size={Size.Small} tone={TextTone.Danger}>
                {t('setUpdateFailed')}
              </Text>
            )}
          </Row>

          {pending && (
            <div
              style={{
                display: 'grid',
                gap: 'var(--glacier-space-3)',
                padding: 'var(--glacier-space-4)',
                borderRadius: 'var(--glacier-radius-md)',
                border: 'var(--glacier-hairline) solid var(--glacier-border)',
                background: 'var(--glacier-surface-raised)',
              }}
            >
              <Row justify="between" align="center" gap={3} wrap>
                <Text as="span" weight="medium">
                  {t('setUpdateAvailable')}
                </Text>
                <Pill tone="accent" size="sm">
                  {pending.version}
                </Pill>
              </Row>
              {/* The curated changelog, not the raw release body. `notes` is
                  the GitHub release text, which both release paths hardcode to
                  a line about the download page - printing it here put a second
                  changelog next to the real one, saying something else. */}
              <UpdateHighlights pending={pending} detail />
              {busy ? (
                <div style={{ display: 'grid', gap: 'var(--glacier-space-2)' }}>
                  <ProgressBar
                    value={progress}
                    max={100}
                    aria-label={status === 'installing' ? t('setUpdating') : t('updDownloading')}
                  />
                  <Text as="span" size={Size.Small} tone={TextTone.Muted} mono>
                    {status === 'installing' ? t('setUpdating') : t('updDownloading')} {progress}%
                  </Text>
                </div>
              ) : confirming ? (
                /* Installing relaunches the app unconditionally, and this tab
                   is one tap from the in-game toolbar. Nobody gets there by
                   accident, and a seated player is told what it costs. */
                <div style={{ display: 'grid', gap: 'var(--glacier-space-2)' }}>
                  <Text as="span" weight="medium">
                    {t('updConfirmRestart')}
                  </Text>
                  <Text as="p" size={Size.Small} tone={TextTone.Muted}>
                    {t('updConfirmRestartBody')}
                  </Text>
                  {inRoom && (
                    <Text as="p" size={Size.Small} tone={TextTone.Danger}>
                      {t('updSeatedWarn')}
                    </Text>
                  )}
                  <Row align="center" gap={2} wrap>
                    <Button onClick={() => void apply()}>
                      <Download size={16} />
                      {t('updRestartNow')}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming(false)}>
                      {t('dbCancel')}
                    </Button>
                  </Row>
                </div>
              ) : (
                <div>
                  <Button onClick={() => setConfirming(true)}>
                    <Download size={16} />
                    {t('setUpdateInstall')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : phone ? null : (
        <div style={{ display: 'grid', gap: 'var(--glacier-space-3)' }}>
          <Text as="span" size={Size.Small} tone={TextTone.Muted}>
            {t('setDesktopAutoUpdates')}
          </Text>
          <div>
            <Button variant="outline" onClick={() => void openExternal(DOWNLOAD_URL)}>
              <Download size={16} />
              {t('setDownloadDesktop')}
            </Button>
          </div>
        </div>
      )}

      <Row align="center" gap={2}>
        <Button variant="ghost" size="sm" onClick={() => void openExternal(SITE_URL)}>
          <ExternalLink size={16} />
          prettycardboard.com
        </Button>
      </Row>
    </div>
  );
}
