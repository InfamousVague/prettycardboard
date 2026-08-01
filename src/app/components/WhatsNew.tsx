import {
  Accordion,
  Button,
  Modal,
  Pill,
  Size,
  Text,
  TextTone,
  useLocale,
  type PillTone,
} from '@glacier/react';
import { useT, type MessageKey } from '../i18n.ts';
import { CHANGELOG, type ChangelogKind, type ChangelogRelease } from '../data/changelog.ts';
import './whatsnew.css';

/** The chip a change wears: accent for something that did not exist, info for
 *  a change to something that did, success for a defect gone. */
const KIND_TONE: Record<ChangelogKind, PillTone> = {
  new: 'accent',
  improved: 'info',
  fixed: 'success',
};

const KIND_LABEL: Record<ChangelogKind, MessageKey> = {
  new: 'clKindNew',
  improved: 'clKindImproved',
  fixed: 'clKindFixed',
};

/**
 * Dates are stored as plain YYYY-MM-DD and read in the player's locale.
 *
 * The `T00:00:00` matters: a bare date string parses as UTC midnight, which is
 * the previous day everywhere west of Greenwich - a release would be dated the
 * 30th for most of the Americas. Anything unparseable renders nothing rather
 * than the string "Invalid Date".
 */
function formatReleaseDate(date: string | undefined, locale: string): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

/** One release: a rail naming it, and its highlights beside it. */
function WnRelease({ release }: { release: ChangelogRelease }) {
  const t = useT();
  const locale = useLocale();
  const released = formatReleaseDate(release.date, locale);
  return (
    <section className="wnRelease">
      <header className="wnRail">
        {/* A version number is a latin run wherever it lands; pinning its
            direction keeps "v0.6.0" whole inside Arabic copy. */}
        <Pill size="sm" dir="ltr">
          v{release.version}
        </Pill>
        {released && (
          <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
            {t('clReleased')} {released}
          </Text>
        )}
        {release.headline && (
          <Text as="span" size={Size.Small} tone={TextTone.Muted}>
            {t(release.headline)}
          </Text>
        )}
      </header>
      <ul className="wnList">
        {release.entries.map((entry) => (
          <li
            key={entry.id ?? entry.title}
            className="wnItem"
            data-featured={entry.featured ? '' : undefined}
          >
            <span className="wnIcon" aria-hidden>
              <entry.icon size={18} />
            </span>
            <span className="wnText">
              <span className="wnHead">
                <Text as="span" weight="semibold">
                  {t(entry.title)}
                </Text>
                {entry.kind && (
                  <Pill size="sm" variant="soft" tone={KIND_TONE[entry.kind]}>
                    {t(KIND_LABEL[entry.kind])}
                  </Pill>
                )}
                {entry.category && (
                  <Pill size="sm" variant="outline">
                    {t(entry.category)}
                  </Pill>
                )}
              </span>
              <Text as="span" size={Size.Small} tone={TextTone.Muted}>
                {t(entry.desc)}
              </Text>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The release announcement. After an update, the first refresh shows every
 * release the player missed (version-gated via pc.lastSeenVersion in
 * WhatsNewHost); dismissing it caches the current version so it never repeats.
 *
 * The newest release is the page. Everything older collapses behind one row -
 * a player who has been away for four releases was reading a ~4000px scroll
 * before, and the point of the announcement is the release they just got.
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
  const [newest, ...older] = releases;
  if (!newest) return null;
  // Reopening always asks for the full history (WhatsNewHost's listener), so
  // the shortcut only earns its place while this is a partial announcement.
  const partial = releases.length < CHANGELOG.length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('clTitle')}
      size="xl"
      footer={
        <>
          {partial && (
            <Button
              variant="ghost"
              onClick={() => window.dispatchEvent(new CustomEvent('pc:open-whatsnew'))}
            >
              {t('clSeeAll')}
            </Button>
          )}
          <Button onClick={onClose}>{t('clGotIt')}</Button>
        </>
      }
    >
      <div className="wnBody pcMobileFull">
        <WnRelease release={newest} />
        {older.length > 0 && (
          <Accordion
            className="wnOlder"
            items={[
              {
                id: 'wnOlder',
                title: t('clOlder'),
                content: (
                  <div className="wnOlderList">
                    {older.map((release) => (
                      <WnRelease key={release.version} release={release} />
                    ))}
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
    </Modal>
  );
}
