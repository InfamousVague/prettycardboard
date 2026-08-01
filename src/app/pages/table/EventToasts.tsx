import { useEffect, useRef } from 'react';
import { useToast } from '@glacier/react';
import { useApp } from '../../state/appStore.ts';
import { useGame } from '../../state/gameStore.ts';
import { classifyEventLine } from './eventLines.ts';

/**
 * The table's narration, surfaced: match events and engine resolutions
 * arrive as toasts the moment their log line lands, so nobody has to keep
 * one eye on the log panel. The chat transcript mirrors the same lines
 * (LobbyChat), sharing the classifier in eventLines.ts.
 *
 * Curation over completeness:
 * - Your OWN actions never toast - you just did them.
 * - Dice and combat damage stay with the center-stage RollBanner.
 * - The match result stays with the PostMatch overlay.
 * - A rate limiter keeps a fast bot chain from burying the screen; lines
 *   marked important (things done TO players) always get through.
 *
 * WHERE a toast lands is not decided here and must not be: every toast in the
 * app shares one kit layer portalled onto document.body. It is kept off the
 * app's chrome centrally - the shell publishes --pc-chrome-block-end /
 * --pc-chrome-inline-start (useChromeInsets in App.tsx) and app.css shrinks
 * that layer to fit - so a per-caller offset here would only desynchronise
 * this table's toasts from every other one.
 */
const WINDOW_MS = 3000;
const SOFT_CAP = 4; // ordinary lines per window
const HARD_CAP = 8; // even important lines stop here

export function EventToasts() {
  const { toast } = useToast();
  const log = useGame((state) => state.log);
  const roomId = useGame((state) => state.joinedRoomId);
  const username = useApp((state) => state.identity?.username);
  const lastSeen = useRef(0);
  const recent = useRef<number[]>([]);

  // Never replay history on mount: a rejoin/resume (or a replay-scrub
  // remount) keeps its whole log. The cursor keys on the store's per-line
  // arrival uid, NOT the server seq - one action's main and extra log lines
  // share a seq (which would swallow every engine-resolution line), and
  // coach notes carry negative seqs (which would replay the whole log).
  useEffect(() => {
    lastSeen.current = useGame.getState().log.at(-1)?.uid ?? 0;
  }, [roomId]);

  useEffect(() => {
    for (const line of log) {
      const uid = line.uid ?? 0;
      if (uid <= lastSeen.current) continue;
      lastSeen.current = uid;
      if (username && line.text.startsWith(`${username} `)) continue;
      const cls = classifyEventLine(line.text);
      if (!cls) continue;
      const now = Date.now();
      recent.current = recent.current.filter((ts) => now - ts < WINDOW_MS);
      if (recent.current.length >= (cls.important ? HARD_CAP : SOFT_CAP)) continue;
      recent.current.push(now);
      toast({ tone: cls.tone, message: line.text });
    }
  }, [log, toast, username]);

  return null;
}
