import { useState } from 'react';
import { Announcements, Button, Modal, Pill } from '@glacier/react';
import { CHANGELOG, type ChangelogRelease } from '../data/changelog.ts';
import { useT } from '../i18n.ts';
import { WnRelease } from './WhatsNew.tsx';
import './newsTicker.css';

/**
 * A scrolling headline strip of what has changed lately, along the top of the
 * home page.
 *
 * The changelog already exists and is already translated, but until now the
 * only way to read it was the What's New modal - which by design opens once
 * per release and never again. So everything the app had to say about itself
 * was either interrupting you or invisible. The ticker is the third state:
 * always there, never in the way.
 *
 * WHAT COUNTS AS A HEADLINE. Each release's own `headline` if it has one, and
 * otherwise its `featured` entry - the two fields that already mean "this is
 * the thing about this release". Ordinary entries are deliberately excluded:
 * a ticker carrying every fixed-typo row is a ticker nobody reads.
 *
 * A headline is one line about a release, which is exactly as much as a strip
 * this size can carry - so clicking one opens that release's notes in full.
 *
 * THE STRIP ITSELF IS THE KIT'S. This used to be a hand-rolled marquee here:
 * two runs, an inert clone, a travel keyframe, a pause-on-hover rule and a
 * reduced-motion fallback. Glacier's Announcements grew the same marquee, so
 * the local copy was a second implementation of one idea - and the one that
 * would quietly fall behind, because only the kit's is spec-tested. What is
 * left in this file is the part that is actually PrettyCardboard's: which
 * releases count as news, and what a headline opens.
 */

/** How many releases back to carry. Older than this is history, not news. */
const RELEASES = 4;

interface Headline {
  version: string;
  text: string;
  release: ChangelogRelease;
}

export function NewsTicker() {
  const t = useT();
  const [open, setOpen] = useState<ChangelogRelease | null>(null);

  // Not memoized, deliberately: useT() returns a fresh closure every render, so
  // a [t] dependency never hits and the memo would be pure overhead. Four
  // array reads and four lookups is cheaper than the cache that would guard it.
  const headlines: Headline[] = [];
  for (const release of CHANGELOG.slice(0, RELEASES)) {
    if (release.headline) {
      headlines.push({ version: release.version, text: t(release.headline), release });
      continue;
    }
    // No headline written for this release: its featured entry is the same
    // editorial judgement made in the other place it can be made.
    const featured = release.entries.find((entry) => entry.featured) ?? release.entries[0];
    if (featured) headlines.push({ version: release.version, text: t(featured.title), release });
  }

  if (headlines.length === 0) return null;

  return (
    <>
      <Announcements
        className="newsTicker"
        motion="marquee"
        tone="neutral"
        aria-label={t('tickerLabel')}
        // The strip's own name, pinned outside the travelling area - it says
        // what the strip IS rather than anything about one release, so it must
        // not scroll away with the first headline. That is the `tag` slot.
        tag={
          <Pill size="sm" tone="accent" variant="soft" className="tickerTag">
            {t('tickerTag')}
          </Pill>
        }
        items={headlines.map((headline) => ({
          id: headline.version,
          label: headline.version,
          content: headline.text,
        }))}
        // Supplying this is what makes each headline activatable at all: the
        // kit renders read-only text without it.
        onItemSelect={(item) => {
          const found = headlines.find((headline) => headline.version === item.id);
          if (found) setOpen(found.release);
        }}
      />
      {/* Small on purpose: this is one release, opened from one headline. The
          full history is a click further on, through the same modal the app
          already opens after an update. */}
      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? `${t('clTitle')} · v${open.version}` : ''}
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(null);
                window.dispatchEvent(new CustomEvent('pc:open-whatsnew'));
              }}
            >
              {t('clSeeAll')}
            </Button>
            <Button onClick={() => setOpen(null)}>{t('clGotIt')}</Button>
          </>
        }
      >
        <div className="tickerNote pcMobileFull">{open && <WnRelease release={open} />}</div>
      </Modal>
    </>
  );
}
