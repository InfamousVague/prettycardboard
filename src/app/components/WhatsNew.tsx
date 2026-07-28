import { Button, Modal, Pill, Size, Text, TextTone } from '@glacier/react';
import { useT } from '../i18n.ts';
import { type ChangelogRelease } from '../data/changelog.ts';
import './whatsnew.css';

/**
 * The release announcement. After an update, the first refresh shows every
 * release the player missed (version-gated via pc.lastSeenVersion in App.tsx);
 * dismissing it caches the current version so it never repeats.
 */
export function WhatsNew({
  releases,
  open,
  onClose,
}: {
  releases: ChangelogRelease[];
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const latest = releases[0];
  if (!latest) return null;
  return (
    <Modal open={open} onClose={onClose} title={t('clTitle')} size="md">
      <div className="wnBody pcMobileFull">
        {releases.map((release) => (
          <section key={release.version} className="wnRelease">
            <Pill size="sm">v{release.version}</Pill>
            <ul className="wnList">
              {release.entries.map((entry) => (
                <li key={entry.title} className="wnItem">
                  <span className="wnIcon" aria-hidden>
                    <entry.icon size={17} />
                  </span>
                  <span className="wnText">
                    <Text as="span" weight="semibold">
                      {t(entry.title)}
                    </Text>
                    <Text as="span" size={Size.Small} tone={TextTone.Muted}>
                      {t(entry.desc)}
                    </Text>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <Button onClick={onClose}>{t('clGotIt')}</Button>
      </div>
    </Modal>
  );
}
