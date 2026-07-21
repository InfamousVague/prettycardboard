import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton, Tooltip } from '@glacier/react';
import { Activity, Pause, Play, Redo2, RotateCcw, SkipBack, Undo2, X } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useApp } from '../../state/appStore.ts';
import { useGame } from '../../state/gameStore.ts';
import { cardImage } from '../../data/cards.ts';
import type { TimelineEntry } from '../../net/types.ts';

/** Server life labels read "<name> gains/loses N life (total)". A run of them by
 * the same player within a short window collapses into one timeline stop so
 * eight quick −1 taps read as a single "loses 8 life" event. */
const LIFE_LABEL = /^(.+?) (gains|loses) (\d+) life \((-?\d+)\)$/;
const LIFE_MERGE_MS = 6000;

/** A displayed timeline stop, possibly spanning a merged run of raw entries. */
interface TimelineStop {
  /** Index seeked to when clicked (the run's resulting state = its last entry). */
  index: number;
  /** Inclusive raw-entry range this stop represents (for active highlighting). */
  start: number;
  end: number;
  label: string;
  actor: string;
  card?: TimelineEntry['card'];
}

function coalesceTimeline(timeline: TimelineEntry[]): TimelineStop[] {
  const stops: TimelineStop[] = [];
  let runNet = 0;
  let runLastTs = 0;
  timeline.forEach((entry, index) => {
    const match = entry.label.match(LIFE_LABEL);
    const prev = stops[stops.length - 1];
    const mergeable =
      match &&
      prev &&
      prev.actor === entry.actor &&
      LIFE_LABEL.test(prev.label) &&
      entry.ts - runLastTs <= LIFE_MERGE_MS;
    if (match && mergeable) {
      const name = match[1];
      const total = match[4];
      runNet += match[2] === 'gains' ? Number(match[3]) : -Number(match[3]);
      runLastTs = entry.ts;
      prev.end = index;
      prev.index = index;
      prev.label =
        runNet > 0
          ? `${name} gains ${runNet} life (${total})`
          : runNet < 0
            ? `${name} loses ${-runNet} life (${total})`
            : `${name}'s life returns to ${total}`;
      return;
    }
    if (match) {
      runNet = match[2] === 'gains' ? Number(match[3]) : -Number(match[3]);
      runLastTs = entry.ts;
    }
    stops.push({
      index,
      start: index,
      end: index,
      label: entry.label,
      actor: entry.actor,
      card: entry.card,
    });
  });
  return stops;
}

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
  // Auto-playback of the match: steps through stops on a timer.
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const playCursor = useRef(0);
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

  // Collapse rapid life-change runs into single stops for the display.
  const stops = useMemo(() => coalesceTimeline(timeline), [timeline]);
  const stopsRef = useRef(stops);
  stopsRef.current = stops;

  // Auto-playback: advance through the coalesced stops on a timer, driving the
  // replay frame so the match plays out on the board.
  useEffect(() => {
    if (!playing) return;
    const stepMs = speed >= 2 ? 550 : speed <= 0.5 ? 1600 : 950;
    const id = window.setInterval(() => {
      const list = stopsRef.current;
      const next = playCursor.current + 1;
      const stop = list[next];
      if (next >= list.length || !stop) {
        setPlaying(false);
        replayExit();
        return;
      }
      playCursor.current = next;
      replaySeek(stop.index);
    }, stepMs);
    return () => window.clearInterval(id);
  }, [playing, speed, replaySeek, replayExit]);

  // "Watch replay" from the results screen: open the bar and play from the top.
  useEffect(() => {
    const onWatch = () => {
      const list = stopsRef.current;
      const first = list[0];
      if (!first) return;
      setOpen(true);
      playCursor.current = 0;
      replaySeek(first.index);
      setPlaying(true);
    };
    window.addEventListener('pc:watch-replay', onWatch);
    return () => window.removeEventListener('pc:watch-replay', onWatch);
  }, [replaySeek]);

  if (timeline.length === 0) return null;

  const lastIndex = timeline.length - 1;
  const activeIndex = replay.active ? Math.min(replay.index, lastIndex) : lastIndex;

  const stopIndexFor = (raw: number) => {
    const i = stops.findIndex((s) => raw >= s.start && raw <= s.end);
    return i < 0 ? stops.length - 1 : i;
  };

  const startPlay = (fromStart: boolean) => {
    if (stops.length === 0) return;
    const cursor = fromStart ? 0 : replay.active ? stopIndexFor(replay.index) : 0;
    const stop = stops[cursor];
    if (!stop) return;
    playCursor.current = cursor;
    replaySeek(stop.index);
    setPlaying(true);
  };

  const togglePlay = () => (playing ? setPlaying(false) : startPlay(!replay.active));

  const seek = (index: number) => {
    // The live edge returns to now; any earlier stop inspects that point.
    setPlaying(false);
    playCursor.current = stopIndexFor(index);
    if (index >= lastIndex) replayExit();
    else replaySeek(index);
  };

  // Collapsing the bar also drops out of replay, so a read-only past frame can
  // never linger with its only control hidden.
  const closeBar = () => {
    setPlaying(false);
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
            <span className="timelineBarLabel">{t('gpTimeline')}</span>
            <div className="timelineBarRow">
              <div className="timelineEvents" ref={scrollRef} role="listbox" aria-label={t('gpTimeline')}>
                {stops.map((stop) => {
                  const image = stop.card
                    ? stop.card.imageUrl || (stop.card.scryfallId ? cardImage(stop.card.scryfallId) : '')
                    : '';
                  const label = stop.label || t('gpTimelineMove');
                  const active = activeIndex >= stop.start && activeIndex <= stop.end;
                  return (
                    <button
                      key={stop.start}
                      type="button"
                      className="tlEvent"
                      role="option"
                      aria-selected={active}
                      data-active={active || undefined}
                      data-mine={stop.actor === myId || undefined}
                      data-preview-src={image || undefined}
                      data-preview-name={image ? stop.card?.name : undefined}
                      title={label}
                      onClick={() => seek(stop.index)}
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
              <div className="timelinePlayback">
                <Tooltip content={playing ? t('gpPauseReplay') : t('gpPlayReplay')}>
                  <IconButton
                    size="sm"
                    variant={playing ? 'solid' : 'soft'}
                    aria-label={playing ? t('gpPauseReplay') : t('gpPlayReplay')}
                    onClick={togglePlay}
                  >
                    {playing ? <Pause size={15} /> : <Play size={15} />}
                  </IconButton>
                </Tooltip>
                <Tooltip content={t('gpRestartReplay')}>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    aria-label={t('gpRestartReplay')}
                    onClick={() => startPlay(true)}
                  >
                    <SkipBack size={15} />
                  </IconButton>
                </Tooltip>
                <button
                  type="button"
                  className="timelineSpeed"
                  aria-label={t('gpReplaySpeed')}
                  onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 0.5 : 1))}
                >
                  {speed}×
                </button>
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
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
