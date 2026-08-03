import { useState } from 'react';
import { Button, Modal, Pill } from '@glacier/react';
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

  const run = (
    <div className="tickerRun">
      {headlines.map((headline) => (
        <span className="tickerItem" key={headline.version}>
          <button
            type="button"
            className="tickerButton"
            onClick={() => setOpen(headline.release)}
            aria-label={`${t('tickerOpen')}: ${headline.version} — ${headline.text}`}
          >
            <span className="tickerVersion">{headline.version}</span>
            <span className="tickerText">{headline.text}</span>
          </button>
        </span>
      ))}
    </div>
  );

  return (
    <>
      <div className="newsTicker" role="region" aria-label={t('tickerLabel')}>
        {/* A kit Pill, not a hand-padded span. The span version put a 12px
            Text inside a box that inherited the app's 16px font-size, so the
            label baseline-aligned to the taller strut and sat 2.7px below the
            chip's centre. Pill is inline-flex, centred, line-height:1, and
            carries its own font-size, so there is no strut to fight. */}
        <Pill size="sm" tone="accent" variant="soft" className="tickerTag">
          {t('tickerTag')}
        </Pill>
        {/* The marquee is TWO identical runs side by side, and the animation
            travels exactly one run's width before resetting. That is what makes
            the loop seamless: at the moment it snaps back, run two is sitting
            precisely where run one started, so there is no gap to see and no
            measurement to keep in sync with the content. */}
        <div className="tickerViewport">
          <div className="tickerTrack">
            {run}
            {/* Run two is scenery. `inert` keeps its copy of every headline out
                of the accessibility tree AND out of the tab order, so the news
                is announced once and Tab visits each headline once - while run
                one above stays a real, focusable, clickable copy. */}
            <div className="tickerClone" aria-hidden inert>
              {run}
            </div>
          </div>
        </div>
      </div>
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
