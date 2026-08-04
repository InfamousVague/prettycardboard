import { useState } from 'react';
import { IconButton, Text } from '@glacier/react';
import { Sparkles, X } from '../icons/backfilled.tsx';
import { useT } from '../i18n.ts';
import { isTauri } from '../tauri.ts';
import { DownloadButton } from './DownloadButton.tsx';
import './downloadBanner.css';

/**
 * A slim, dismissible banner prompting web visitors to install the desktop app
 * (which auto-updates and gets native window chrome). Hidden inside the desktop
 * app itself.
 *
 * Dismissal deliberately lives in component state and nowhere else: closing it
 * clears the banner for the rest of this page view, and the next load offers
 * the app again. The web build is the trial, not the destination, so a single
 * dismissal should not opt someone out of the pitch forever.
 */
export function DownloadBanner() {
  const t = useT();
  const [dismissed, setDismissed] = useState(() => isTauri());
  if (dismissed) return null;

  const close = () => setDismissed(true);

  return (
    <div className="downloadBanner" role="region" aria-label={t('dlGetDesktop')}>
      <span className="downloadBannerMark" aria-hidden>
        <Sparkles size={16} />
      </span>
      <Text as="span" size="sm" className="downloadBannerText">
        {t('dlBannerBlurb')}
      </Text>
      <div className="downloadBannerAction">
        <DownloadButton size="sm" />
      </div>
      <IconButton size="sm" variant="ghost" aria-label={t('playDismiss')} onClick={close}>
        <X size={16} />
      </IconButton>
    </div>
  );
}
