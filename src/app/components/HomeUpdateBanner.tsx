import { Button, Pill, ProgressBar, Size, Text, TextTone } from '@glacier/react';
import { Download, RefreshCw } from '../icons/backfilled.tsx';
import { useT } from '../i18n.ts';
import { useGame } from '../state/gameStore.ts';
import { updateHighlights, useUpdate } from '../state/updateStore.ts';
import { canSelfUpdate } from '../updater.ts';
import './homeUpdateBanner.css';

/**
 * The pending update, stated in the open on the home page.
 *
 * UpdateNotice already surfaces one anywhere in the app, but it is a corner
 * card the player can wave away, and dismissing it is permanent for that
 * version - so an update declined once while mid-something became invisible
 * until the next release. This banner is the standing account: it ignores
 * `dismissedVersion` entirely, because the home page is not somewhere the
 * notice is interrupting anything, and a player who comes back to the menu is
 * exactly the player who might install now.
 *
 * It shares the store, so there is one truth about what is pending and one
 * download; this only renders it, and the Restart it offers is the same
 * consented relaunch the notice's is.
 */
export function HomeUpdateBanner() {
  const t = useT();
  const status = useUpdate((state) => state.status);
  const pending = useUpdate((state) => state.pending);
  const progress = useUpdate((state) => state.progress);
  const apply = useUpdate((state) => state.apply);
  // Installing ends in an unconditional relaunch. Home is not a table, but a
  // player can be seated and looking at the menu in another tab of the app, so
  // this reads the same in-match signal every other install path does.
  const inRoom = useGame((state) => state.room !== null);

  // The web build cannot self-update; it has its own download banner in the
  // shell, and a Restart button there would do nothing.
  if (!canSelfUpdate || !pending) return null;
  // Same rule as the notice: 'available' means the bundle is not staged, and a
  // banner offering a restart that would install nothing is a lie. Downloading
  // is worth showing here though - the home page has the room for a progress
  // bar, and it explains why Restart is not offered yet.
  if (status !== 'downloading' && status !== 'ready') return null;
  const ready = status === 'ready';
  const { entries } = updateHighlights(pending);
  const headline = entries[0];

  return (
    <section className="homeUpdate" data-ready={ready || undefined} aria-label={t('updNoticeTitle')}>
      <span className="homeUpdateIcon" aria-hidden>
        {ready ? <RefreshCw size={18} /> : <Download size={18} />}
      </span>
      <div className="homeUpdateText">
        <div className="homeUpdateHead">
          <Text as="span" weight="semibold">
            {ready ? t('updNoticeTitle') : t('updDownloading')}
          </Text>
          <Pill tone="accent" size="sm">
            {pending.version}
          </Pill>
        </div>
        {ready ? (
          // One line, not the notice's list: this is a banner across the top of
          // a page that is already dense, and the What's New modal is one click
          // away for the rest.
          headline && (
            <Text as="span" size={Size.Small} tone={TextTone.Muted}>
              {t(headline.title)}
            </Text>
          )
        ) : (
          <ProgressBar value={progress} max={100} size="sm" aria-label={t('updDownloading')} />
        )}
      </div>
      {ready && (
        <div className="homeUpdateActions">
          {inRoom ? (
            <Text as="span" size={Size.Small} tone={TextTone.Muted}>
              {t('updNoticeSeated')}
            </Text>
          ) : (
            <Button size="sm" variant="solid" onClick={() => void apply()}>
              {t('updRestartNow')}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
