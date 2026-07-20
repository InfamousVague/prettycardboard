import { useEffect, useState } from 'react';
import { Button, Pill, ProgressBar, Row, Text, Size, TextTone } from '@glacier/react';
import { Download, ExternalLink, RefreshCw } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { canSelfUpdate, checkForUpdate, currentVersion, installUpdate, type PendingUpdate } from '../updater.ts';
import { isTauri } from '../tauri.ts';

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

type UpdateState = 'idle' | 'checking' | 'uptodate' | 'available' | 'installing' | 'error';

/** About & Updates: version, self-update flow (desktop only), and links. */
export function AboutTab() {
  const t = useT();
  const [version, setVersion] = useState<string | null>(null);
  const [state, setState] = useState<UpdateState>('idle');
  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let alive = true;
    void currentVersion().then((v) => {
      if (alive) setVersion(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const runCheck = async () => {
    setState('checking');
    try {
      const update = await checkForUpdate();
      if (update) {
        setPending(update);
        setState('available');
      } else {
        setState('uptodate');
      }
    } catch {
      setState('error');
    }
  };

  const runInstall = async () => {
    if (!pending) return;
    setState('installing');
    setProgress(0);
    try {
      await installUpdate(pending, setProgress);
      // On success the app relaunches; nothing more to do here.
    } catch {
      setState('error');
    }
  };

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
        <Pill tone="neutral" size="md">
          {t('setVersion')} {version ?? '…'}
        </Pill>
      </Row>

      {canSelfUpdate ? (
        <div style={{ display: 'grid', gap: 'var(--glacier-space-3)' }}>
          <Row align="center" gap={3} wrap>
            <Button
              variant="outline"
              loading={state === 'checking'}
              disabled={state === 'installing'}
              onClick={runCheck}
            >
              <RefreshCw size={16} />
              {state === 'checking' ? t('setChecking') : t('setCheckUpdates')}
            </Button>
            {state === 'uptodate' && (
              <Text as="span" size={Size.Small} tone={TextTone.Muted}>
                {t('setUpToDate')}
              </Text>
            )}
            {state === 'error' && (
              <Text as="span" size={Size.Small} tone={TextTone.Danger}>
                {t('setUpdateFailed')}
              </Text>
            )}
          </Row>

          {(state === 'available' || state === 'installing') && pending && (
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
              {pending.notes && (
                <Text as="p" size={Size.Small} tone={TextTone.Muted}>
                  {pending.notes}
                </Text>
              )}
              {state === 'installing' ? (
                <div style={{ display: 'grid', gap: 'var(--glacier-space-2)' }}>
                  <ProgressBar value={progress} max={100} aria-label={t('setUpdating')} />
                  <Text as="span" size={Size.Small} tone={TextTone.Muted} mono>
                    {t('setUpdating')} {progress}%
                  </Text>
                </div>
              ) : (
                <div>
                  <Button onClick={runInstall}>
                    <Download size={16} />
                    {t('setUpdateInstall')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
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
