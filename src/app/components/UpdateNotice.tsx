import { Button, Card, Pill, ProgressBar, Size, Text, TextTone } from '@glacier/react';
import { useT } from '../i18n.ts';
import { useGame } from '../state/gameStore.ts';
import { updateHighlights, useUpdate } from '../state/updateStore.ts';
import type { PendingUpdate } from '../updater.ts';
import './updateNotice.css';

/** Enough to say what the release is; more than this and it is a changelog. */
const NOTICE_HIGHLIGHTS = 3;

/**
 * What a pending release actually contains, rendered from the single source
 * updateHighlights() picks. Shared by the notice and Settings > About so the
 * app can never show two disagreeing accounts of one update - which is exactly
 * what the raw `pending.notes` paragraph in About used to be.
 *
 * `limit` caps the rows (the corner notice has no room for eleven); `detail`
 * adds each entry's description, which only the roomier About card affords.
 */
export function UpdateHighlights({
  pending,
  limit,
  detail = false,
}: {
  pending: PendingUpdate;
  limit?: number;
  detail?: boolean;
}) {
  const t = useT();
  const { entries, notes } = updateHighlights(pending);
  if (entries.length > 0) {
    const shown = limit === undefined ? entries : entries.slice(0, limit);
    return (
      <ul className="updHighlights">
        {shown.map((entry) => (
          <li key={entry.title} className="updHighlight">
            <span className="updHighlightIcon" aria-hidden>
              <entry.icon size={16} />
            </span>
            <span className="updHighlightText">
              <Text as="span" size={Size.Small} weight="medium">
                {t(entry.title)}
              </Text>
              {detail && (
                <Text as="span" size={Size.Small} tone={TextTone.Muted}>
                  {t(entry.desc)}
                </Text>
              )}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (notes) {
    return (
      <Text as="p" size={Size.Small} tone={TextTone.Muted}>
        {notes}
      </Text>
    );
  }
  return null;
}

/**
 * The update notice: a global, non-modal card that surfaces an update wherever
 * the player happens to be. It exists because discovery used to require walking
 * to Settings > About and pressing a button, so a player who never went looking
 * never updated.
 *
 * It is a Card in the InvitePopup shape rather than a kit Toast on purpose -
 * ToastOptions carries no action button and the provider is single/latest-wins,
 * so an actionable notice cannot be one.
 *
 * MID-MATCH: installing ends in an unconditional relaunch(), so while the
 * player is seated the notice drops its Restart action entirely and says the
 * update is waiting. The bundle is already staged by then; only the relaunch
 * is destructive, and only the player ever asks for it.
 */
export function UpdateNotice() {
  const t = useT();
  const status = useUpdate((state) => state.status);
  const pending = useUpdate((state) => state.pending);
  const progress = useUpdate((state) => state.progress);
  const dismissedVersion = useUpdate((state) => state.dismissedVersion);
  const dismiss = useUpdate((state) => state.dismiss);
  const apply = useUpdate((state) => state.apply);
  // The same in-match signal the shell reads (App.tsx). A relaunch out of a
  // live game is the one thing this notice must never cause.
  const inRoom = useGame((state) => state.room !== null);

  if (!pending || dismissedVersion === pending.version) return null;
  // 'available' is deliberately silent: the bundle is still being fetched (or a
  // transfer just failed and the cadence will retry), and a card that announced
  // an update it could not yet apply would be lying about being ready.
  if (status !== 'downloading' && status !== 'ready') return null;
  const ready = status === 'ready';
  // The reopen path renders the BUNDLED changelog, so it can only speak for the
  // pending release when this client already carries its entries. When it does
  // not, the button would quietly show the previous releases instead - so it is
  // simply not offered.
  const described = updateHighlights(pending).entries.length > 0;

  return (
    <div
      className="updNotice"
      role="region"
      aria-label={t('updNoticeTitle')}
      data-seated={inRoom || undefined}
    >
      <Card elevation={3} className="updNoticeCard">
        <div className="updNoticeHead">
          <Text as="span" weight="semibold">
            {ready ? t('updNoticeTitle') : t('updDownloading')}
          </Text>
          {/* Bare, like the About tab's pill: a "v" prefix would be one more
              unlabelled latin run inside Arabic for no added meaning. */}
          <Pill tone="accent" size="sm">
            {pending.version}
          </Pill>
        </div>

        {ready ? (
          <UpdateHighlights pending={pending} limit={NOTICE_HIGHLIGHTS} />
        ) : (
          <ProgressBar value={progress} max={100} aria-label={t('updDownloading')} />
        )}

        {inRoom ? (
          <div className="updNoticeActions">
            <Text as="span" size={Size.Small} tone={TextTone.Muted}>
              {t('updNoticeSeated')}
            </Text>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              {t('updLater')}
            </Button>
          </div>
        ) : (
          <div className="updNoticeActions">
            {ready && described && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.dispatchEvent(new CustomEvent('pc:open-whatsnew'))}
              >
                {t('updSeeWhatsNew')}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={dismiss}>
              {t('updLater')}
            </Button>
            {ready && (
              <Button size="sm" onClick={() => void apply()}>
                {t('updRestartNow')}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
