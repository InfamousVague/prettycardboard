import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@glacier/react';
import { Check, Hourglass, Play, SkipForward } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { usePreference } from '../../hooks/usePreference.ts';
import { enforcedRoom, handPlayability } from './enforce.ts';
import { oracleFacts } from '../../data/printedPt.ts';
import type { RoomState, TablePlayer } from '../../net/types.ts';
import './priorityPrompt.css';

/**
 * Arena's "one big button", adapted: whatever the enforced table is waiting
 * on YOU for right now - passing on a spell, passing an end step, resolving
 * your own top spell, completing your turn - surfaces as a single floating
 * action, so priority never means hunting through the UI.
 *
 * The same component runs AUTO-PASS: when a response window is open and your
 * hand holds nothing castable at instant speed, the pass goes out by itself
 * after a short beat (long enough to read what happened). Two "always stop"
 * preferences (opposing spells / opponents' end steps) hold it for players
 * who want manual control, and holding a castable instant always stops.
 */
const AUTO_PASS_DELAY_MS = 1300;

type Obligation =
  | { kind: 'pass-stack'; label: string; auto: boolean }
  | { kind: 'pass-window'; label: string; auto: boolean }
  | { kind: 'resolve'; label: string; iid: string; toBattlefield: boolean }
  | { kind: 'end-turn'; label: string };

type StackCard = { iid: string; name: string; scryfallId?: string; ownerSeat?: number };

function obligationFor(
  room: RoomState,
  me: TablePlayer,
  t: (key: 'ppResolve' | 'ppPass' | 'ppPassEnd' | 'ppEndTurn') => string,
  stops: { stack: boolean; endStep: boolean },
): Obligation | null {
  const stack = (room.stack ?? []) as unknown as StackCard[];
  const passed = (room.stackPassed ?? []).includes(me.seat);
  // A castable instant means the window is genuinely interesting: never
  // auto-pass it away.
  const holdsTrick = me.hand?.some((c) => {
    const f = oracleFacts(c.scryfallId);
    if (!f) return false;
    const instantSpeed = f.typeLine.includes('Instant') || f.keywords.includes('flash');
    return instantSpeed && handPlayability(room, me, c) === 'cast';
  }) ?? false;

  if (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (!top) return null;
    if (top.ownerSeat === me.seat) {
      // My spell on top: resolvable once everyone else passed (the server
      // also allows a 30s lapse; the button appears on the clean case).
      const others = room.players.filter((p) => !p.conceded && p.seat !== me.seat);
      const allPassed = others.every((p) => (room.stackPassed ?? []).includes(p.seat));
      if (allPassed) {
        const f = oracleFacts(top.scryfallId);
        const toBattlefield = f != null && !f.typeLine.includes('Instant') && !f.typeLine.includes('Sorcery');
        return {
          kind: 'resolve',
          label: `${t('ppResolve')} ${top.name}`,
          iid: top.iid,
          toBattlefield,
        };
      }
      return null;
    }
    if (!passed) {
      return {
        kind: 'pass-stack',
        label: `${t('ppPass')} · ${top.name}`,
        auto: !stops.stack && !holdsTrick,
      };
    }
    return null;
  }
  if (room.endWindow != null) {
    if (room.activeSeat === me.seat) {
      const others = room.players.filter((p) => !p.conceded && p.seat !== me.seat);
      const allPassed = others.every((p) => (room.stackPassed ?? []).includes(p.seat));
      if (allPassed) return { kind: 'end-turn', label: t('ppEndTurn') };
      return null;
    }
    if (!passed) {
      return {
        kind: 'pass-window',
        label: t('ppPassEnd'),
        auto: !stops.endStep && !holdsTrick,
      };
    }
  }
  return null;
}

export function PriorityPrompt({ room, me }: { room: RoomState; me: TablePlayer }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const autoPass = usePreference('autoPass') ?? true;
  const alwaysStopStack = usePreference('alwaysStopStack') ?? false;
  const alwaysStopEndStep = usePreference('alwaysStopEndStep') ?? false;
  const [counting, setCounting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const obligation = useMemo(
    () =>
      enforcedRoom(room) && room.started && !room.matchResult
        ? obligationFor(room, me, t, { stack: alwaysStopStack, endStep: alwaysStopEndStep })
        : null,
    [room, me, t, alwaysStopStack, alwaysStopEndStep],
  );

  const perform = (o: Obligation) => {
    if (o.kind === 'pass-stack' || o.kind === 'pass-window') act({ kind: 'stack.pass' });
    else if (o.kind === 'end-turn') act({ kind: 'turn.pass' });
    else if (o.kind === 'resolve') {
      act(
        o.toBattlefield
          ? { kind: 'stack.resolve', iid: o.iid, to: 'battlefield', x: 0.5, y: 0.5 }
          : { kind: 'stack.resolve', iid: o.iid, to: 'graveyard' },
      );
    }
  };

  // Auto-pass: quiet windows pass themselves after a readable beat. The key
  // resets the timer whenever the obligation (or the stack under it) changes.
  const obligationKey = obligation
    ? `${obligation.kind}:${(room.stack ?? []).length}:${room.endWindow ?? 0}`
    : null;
  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setCounting(false);
    if (!obligationKey || !obligation) return;
    const auto = (obligation.kind === 'pass-stack' || obligation.kind === 'pass-window') && obligation.auto;
    if (!(autoPass && auto)) return;
    setCounting(true);
    timer.current = setTimeout(() => {
      perform(obligation);
      setCounting(false);
    }, AUTO_PASS_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obligationKey, autoPass]);

  if (!obligation) return null;
  const icon =
    obligation.kind === 'resolve' ? (
      <Play size={15} />
    ) : obligation.kind === 'end-turn' ? (
      <Check size={15} />
    ) : counting ? (
      <Hourglass size={15} />
    ) : (
      <SkipForward size={15} />
    );
  return (
    <div className="priorityPrompt" data-counting={counting || undefined}>
      <Button size="sm" variant={obligation.kind === 'resolve' ? 'solid' : 'soft'} onClick={() => perform(obligation)}>
        {icon} {obligation.label}
      </Button>
    </div>
  );
}
