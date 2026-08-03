import { useMemo } from 'react';
import { IconBackfill, Pill, Size, Spinner, Text, TextTone, useLocale } from '@glacier/react';
import { Sparkles } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { cardImage } from '../data/cards.ts';
import type { FeedPull } from '../net/api.ts';

/**
 * The notable-pull feed: what you and your friends have cracked lately.
 *
 * "Notable" is the server's word, not this component's - a row exists because
 * `collection::is_notable` said so (mythic, an old-frame rare, or a foil rare
 * or better), so nothing here re-judges the card. The list is a highlight reel
 * the server already trims, so it renders whatever it is handed.
 */

/**
 * The row's sentence is ONE whole message per case rather than a name, a verb
 * and a timestamp concatenated in JSX. Concatenation bakes English word order
 * into every locale - Arabic puts the verb first - and leaves the translator
 * with a bare third-person verb that cannot be attached to a name at all. Each
 * key carries its own {name}/{when} slots instead.
 */

/** Rarity keys the feed decorates; anything else falls back to plain. */
const RARITY_KEY = {
  mythic: 'boMythic',
  rare: 'boRare',
  uncommon: 'boUncommon',
  common: 'boCommon',
} as const;

export function PullFeed({
  rows,
  failed,
  onRetry,
}: {
  /** Null while the first load is in flight. */
  rows: FeedPull[] | null;
  failed: boolean;
  onRetry: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  // One formatter for the whole list, and locale-aware without a single new
  // string: "3 min ago" is a number and a unit, which Intl already knows in
  // every language the app ships.
  const relative = useMemo(() => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }), [locale]);

  if (failed) {
    return (
      <div className="pdEmpty">
        <Text size={Size.XSmall} tone={TextTone.Muted}>
          {t('pdFeedFailed')}
        </Text>
        <button type="button" className="pdRetry" onClick={onRetry}>
          <Text as="span" size={Size.XSmall}>
            {t('boRetry')}
          </Text>
        </button>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="pdEmpty">
        <Spinner size="sm" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="pdEmpty">
        <IconBackfill aria-hidden>
          <Sparkles size={18} />
        </IconBackfill>
        <Text size={Size.XSmall} tone={TextTone.Subtle}>
          {t('pdFeedEmpty')}
        </Text>
      </div>
    );
  }

  return (
    <ul className="pdFeed">
      {rows.map((row) => {
        const rarity = RARITY_KEY[row.rarity as keyof typeof RARITY_KEY];
        const when = ago(relative, row.ts);
        const line = row.mine
          ? t('pdFeedYouPulled').replace('{when}', when)
          : t('pdFeedPulledBy').replace('{name}', row.username).replace('{when}', when);
        return (
          <li className="pdFeedRow" key={row.id} data-rarity={row.rarity} data-mine={row.mine || undefined}>
            <img className="pdFeedArt" src={cardImage(row.scryfallId)} alt="" aria-hidden loading="lazy" />
            <span className="pdFeedBody">
              <Text as="span" size={Size.XSmall} className="pdFeedName">
                {row.name}
              </Text>
              <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                {line}
              </Text>
            </span>
            <span className="pdFeedTags">
              {row.foil && (
                <Pill size="sm" variant="soft" tone="accent">
                  {t('boFoil')}
                </Pill>
              )}
              {rarity && (
                <Pill size="sm" variant="outline">
                  {t(rarity)}
                </Pill>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "2 min ago" from a unix-millisecond stamp, in the active locale. */
function ago(relative: Intl.RelativeTimeFormat, ts: number): string {
  const seconds = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relative.format(Math.min(seconds, -1), 'second');
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86_400), 'day');
}
