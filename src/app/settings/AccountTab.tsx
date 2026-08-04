import { useState } from 'react';
import { Button, Row, Switch, Text, Size, TextTone } from '@glacier/react';
import { CircleUserRound, HardDrive, LogOut } from '../icons/backfilled.tsx';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { isDesktopApp, isLocalPlay, localServerStart, localServerStop } from '../tauri.ts';

/** Account tab: the signed-in name, sign-out, and (desktop) local play. */
export function AccountTab({ onClose }: { onClose: () => void }) {
  const t = useT();
  const identity = useApp((state) => state.identity);
  const signOut = useApp((state) => state.signOut);
  const [switching, setSwitching] = useState(false);
  const localPlay = isLocalPlay();

  // Flipping the mode changes the server origin and the identity scope, so
  // the cleanest continuation is a reload onto the other world.
  const toggleLocalPlay = async (on: boolean) => {
    if (switching) return;
    setSwitching(true);
    try {
      if (on) {
        const port = await localServerStart();
        if (port == null) {
          setSwitching(false);
          return; // no sidecar in this build; leave the switch off
        }
        localStorage.setItem('pc.local', '1');
        localStorage.setItem('pc.local.port', String(port));
      } else {
        await localServerStop();
        localStorage.removeItem('pc.local');
        localStorage.removeItem('pc.local.port');
      }
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--glacier-space-5)' }}>
      <Row align="center" gap={3}>
        <CircleUserRound size={40} aria-hidden />
        <div style={{ display: 'grid', gap: 'var(--glacier-space-1)' }}>
          <Text as="span" weight="medium">
            {identity?.username ?? '—'}
          </Text>
          <Text as="span" size={Size.Small} tone={TextTone.Muted}>
            {localPlay ? t('acctLocalActive') : t('pfTempId')}
          </Text>
        </div>
      </Row>

      {isDesktopApp() && (
        <div style={{ display: 'grid', gap: 'var(--glacier-space-2)' }}>
          <Row align="center" gap={3}>
            <HardDrive size={18} aria-hidden />
            <Text as="span" weight="medium" style={{ flex: 1 }}>
              {t('acctLocalPlay')}
            </Text>
            <Switch
              checked={localPlay}
              disabled={switching}
              onCheckedChange={(on: boolean) => void toggleLocalPlay(on)}
              aria-label={t('acctLocalPlay')}
            />
          </Row>
          <Text as="span" size={Size.Small} tone={TextTone.Muted}>
            {t('acctLocalBlurb')}
          </Text>
        </div>
      )}

      <div>
        <Button
          variant="danger"
          onClick={() => {
            signOut();
            onClose();
          }}
        >
          <LogOut size={16} />
          {t('pfSignOut')}
        </Button>
      </div>
    </div>
  );
}
