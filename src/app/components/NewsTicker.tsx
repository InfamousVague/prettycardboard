import { Size, Text, TextTone } from '@glacier/react';
import { CHANGELOG } from '../data/changelog.ts';
import { useT } from '../i18n.ts';
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
 */

/** How many releases back to carry. Older than this is history, not news. */
const RELEASES = 4;

interface Headline {
  version: string;
  text: string;
}

export function NewsTicker() {
  const t = useT();

  // Not memoized, deliberately: useT() returns a fresh closure every render, so
  // a [t] dependency never hits and the memo would be pure overhead. Four
  // array reads and four lookups is cheaper than the cache that would guard it.
  const headlines: Headline[] = [];
  for (const release of CHANGELOG.slice(0, RELEASES)) {
    if (release.headline) {
      headlines.push({ version: release.version, text: t(release.headline) });
      continue;
    }
    // No headline written for this release: its featured entry is the same
    // editorial judgement made in the other place it can be made.
    const featured = release.entries.find((entry) => entry.featured) ?? release.entries[0];
    if (featured) headlines.push({ version: release.version, text: t(featured.title) });
  }

  if (headlines.length === 0) return null;

  const run = (
    <div className="tickerRun" aria-hidden>
      {headlines.map((headline) => (
        <span className="tickerItem" key={headline.version}>
          <span className="tickerVersion">{headline.version}</span>
          <span className="tickerText">{headline.text}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="newsTicker" role="region" aria-label={t('tickerLabel')}>
      <span className="tickerTag">
        <Text as="span" size={Size.XSmall} weight="semibold">
          {t('tickerTag')}
        </Text>
      </span>
      {/* The marquee is TWO identical runs side by side, and the animation
          travels exactly one run's width before resetting. That is what makes
          the loop seamless: at the moment it snaps back, run two is sitting
          precisely where run one started, so there is no gap to see and no
          measurement to keep in sync with the content. Both are aria-hidden -
          a screen reader would otherwise read every headline twice - and the
          real, unduplicated text is carried by the static list below. */}
      <div className="tickerViewport">
        <div className="tickerTrack">
          {run}
          {run}
        </div>
      </div>
      {/* The accessible copy: same headlines, once, no animation, off-screen.
          A marquee is unreadable to anything that does not follow the paint. */}
      <ul className="tickerSr">
        {headlines.map((headline) => (
          <li key={headline.version}>
            <Text as="span" size={Size.XSmall} tone={TextTone.Muted}>
              {headline.version} — {headline.text}
            </Text>
          </li>
        ))}
      </ul>
    </div>
  );
}
