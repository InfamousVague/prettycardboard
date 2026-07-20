import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton, Tooltip } from '@glacier/react';
import { Activity, Redo2, RotateCcw, Undo2, X } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useApp } from '../../state/appStore.ts';
import { useGame } from '../../state/gameStore.ts';
import { cardImage } from '../../data/cards.ts';

/**
 * The dedicated timeline card, below the vitals card. It stays compact: just the
 * undo/redo controls plus a Timeline toggle. Pressing Timeline slides up a
 * full-width bar of the game's EVENTS - every recorded move as an evenly-spaced
 * stop with a mini thumbnail of the card it touched. It is a timeline of events,
 * not a clock: stops are spaced equally regardless of how much real time passed,
 * so there is no dead space. Clicking a past stop enters read-only replay and
 * streams that historical board; the live edge returns to now, and the host can
 * rewind the whole table to the inspected point.
 */
export function TimelineCard() {
  const t = useT();
  const myId = useApp((state) => state.identity?.userId);
  const timeline = useGame((state) => state.timeline);
  const undoState = useGame((state) => state.undoState);
  const replay = useGame((state) => state.replay);
  const act = useGame((state) => state.act);
  const redo = useGame((state) => state.redo);
  const replaySeek = useGame((state) => state.replaySeek);
  const replayExit = useGame((state) => state.replayExit);
  const rewindTo = useGame((state) => state.rewindTo);

  // The event strip is hidden by default; pressing Timeline reveals the bar.
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Replay can be driven in from anywhere; whenever it turns on, make sure the
  // bar is up so there is always a visible way back to live.
  const replayActive = replay.active;
  useEffect(() => {
    if (replayActive) setOpen(true);
  }, [replayActive]);

  // Follow the live edge as new events land (but not while inspecting the past).
  const count = timeline.length;
  useEffect(() => {
    if (!open || replayActive) return;
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [open, count, replayActive]);

  if (timeline.length === 0) return null;

  const lastIndex = timeline.length - 1;
  const activeIndex = replay.active ? Math.min(replay.index, lastIndex) : lastIndex;

  const seek = (index: number) => {
    // The live edge returns to now; any earlier stop inspects that point.
    if (index >= lastIndex) replayExit();
    else replaySeek(index);
  };

  // Collapsing the bar also drops out of replay, so a read-only past frame can
  // never linger with its only control hidden.
  const closeBar = () => {
    setOpen(false);
    if (replay.active) replayExit();
  };

  return (
    <div className="timelineCard">
      <div className="timelineTools">
        <Tooltip content={t('gpUndo')}>
          <IconButton
            size="sm"
            variant="soft"
            aria-label={t('gpUndo')}
            disabled={!undoState.canUndo}
            onClick={() => act({ kind: 'undo' })}
          >
            <Undo2 size={15} />
          </IconButton>
        </Tooltip>
        <Button
          size="sm"
          variant={open ? 'solid' : 'soft'}
          className="timelineToggle"
          data-open={open || undefined}
          onClick={() => (open ? closeBar() : setOpen(true))}
        >
          <Activity size={14} />
          {open ? t('gpHideTimeline') : t('gpShowTimeline')}
        </Button>
        <Tooltip content={t('gpRedo')}>
          <IconButton
            size="sm"
            variant="soft"
            aria-label={t('gpRedo')}
            disabled={!undoState.canRedo}
            onClick={() => redo()}
          >
            <Redo2 size={15} />
          </IconButton>
        </Tooltip>
      </div>

      {open &&
        createPortal(
          <div className="timelineBar" data-replay={replay.active || undefined}>
            <span className="timelineBarHead">
              <Activity size={15} />
              {t('gpTimeline')}
            </span>
            <div className="timelineEvents" ref={scrollRef} role="listbox" aria-label={t('gpTimeline')}>
              {timeline.map((entry, index) => {
                const image = entry.card
                  ? entry.card.imageUrl || (entry.card.scryfallId ? cardImage(entry.card.scryfallId) : '')
                  : '';
                const label = entry.label || t('gpTimelineMove');
                return (
                  <button
                    key={index}
                    type="button"
                    className="tlEvent"
                    role="option"
                    aria-selected={index === activeIndex}
                    data-active={index === activeIndex || undefined}
                    data-mine={entry.actor === myId || undefined}
                    title={label}
                    onClick={() => seek(index)}
                  >
                    <span className="tlThumb">
                      {image ? (
                        <img src={image} alt="" loading="lazy" />
                      ) : (
                        <Activity size={16} className="tlThumbIcon" />
                      )}
                    </span>
                    <span className="tlDot" />
                    <span className="tlLabel">{label}</span>
                  </button>
                );
              })}
            </div>
            {replay.active && undoState.isHost && (
              <Tooltip content={t('gpRewindHere')}>
                <IconButton
                  size="sm"
                  variant="soft"
                  aria-label={t('gpRewindHere')}
                  onClick={() => {
                    const target = replay.index;
                    replayExit();
                    rewindTo(target);
                  }}
                >
                  <RotateCcw size={15} />
                </IconButton>
              </Tooltip>
            )}
            {replay.active && (
              <Button size="sm" onClick={replayExit}>
                {t('gpReplayLive')}
              </Button>
            )}
            <Tooltip content={t('gpHideTimeline')}>
              <IconButton size="sm" variant="ghost" aria-label={t('gpHideTimeline')} onClick={closeBar}>
                <X size={15} />
              </IconButton>
            </Tooltip>
          </div>,
          document.body,
        )}
    </div>
  );
}
