import { useState } from 'react';
import { IconButton, Text } from '@glacier/react';
import { Sparkles, X } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { isTauri } from '../tauri.ts';
import { DownloadButton } from './DownloadButton.tsx';
import './downloadBanner.css';

const DISMISS_KEY = 'pc.downloadBannerDismissed';

/**
 * A slim, dismissible banner prompting web visitors to install the desktop app
 * (which auto-updates and gets native window chrome). Hidden inside the desktop
 * app itself, and once dismissed it stays gone.
 */
export function DownloadBanner() {
  const t = useT();
  const [dismissed, setDismissed] = useState(() => isTauri() || localStorage.getItem(DISMISS_KEY) === '1');
  if (dismissed) return null;

  const close = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

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
