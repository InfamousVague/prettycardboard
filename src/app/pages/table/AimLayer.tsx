import { useEffect, useRef, useState } from 'react';
import { onMessage } from '../../net/ws.ts';
import { useGame } from '../../state/gameStore.ts';
import { seatColor } from './seatColors.ts';

/**
 * The pointing arrows: when someone aims a spell (or just points), the whole
 * table sees a drawn arrow from the source to whatever it is aimed at.
 *
 * Why an overlay and not a per-card effect: an arrow spans two boards that
 * live in different scroll/transform contexts, so it can only be drawn in one
 * shared surface on top of everything. The geometry is re-measured every
 * frame from the cards' own `data-iid` elements, so an arrow stays glued
 * through scrolls, board-mode reflows, tap animations and window resizes
 * rather than being a stale line drawn once.
 *
 * Several arrows coexist - one per sender, keyed by user id and coloured by
 * seat (the same palette as the cursors and the markers), so a four-player
 * table pointing at once reads unambiguously. Each fades out on its own timer.
 *
 * Purely ephemeral: it rides the `aim` relay and never touches game state.
 * The persistent cousin is the table MARKER (`mark.set`), which lives in room
 * state - an arrow says "right now, this"; a marker says "remember this".
 */

/** How long an arrow stays up before it fades, and the fade's own length. */
const ARROW_LIFE_MS = 4200;
const ARROW_FADE_MS = 450;

interface Aim {
  userId: string;
  username: string;
  seat: number;
  fromIid?: string | null;
  toIid?: string | null;
  toSeat?: number | null;
  /** Ward tax the server attached to this aim, if the target has one. */
  ward?: string | null;
  ts: number;
}

/** One arrow, ready to draw: the curve, its head, and its label anchor. */
interface Drawn {
  key: string;
  color: string;
  mine: boolean;
  label: string;
  opacity: number;
  d: string;
  hx: number;
  hy: number;
  angle: number;
  mx: number;
  my: number;
}

function centerOf(el: HTMLElement | null): { x: number; y: number } | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** The centre of a card on screen. */
function cardAnchor(iid?: string | null): { x: number; y: number } | null {
  if (!iid) return null;
  return centerOf(document.querySelector<HTMLElement>(`[data-iid="${CSS.escape(iid)}"]`));
}

/** The centre of a seat's board. */
function seatAnchor(seat?: number | null): { x: number; y: number } | null {
  if (seat == null) return null;
  return centerOf(document.querySelector<HTMLElement>(`[data-seat-anchor="${seat}"]`));
}

/** Which seat owns a card, from room state - so an arrow can still be drawn
 *  to (or from) a card whose own element is not currently rendered. */
function ownerSeatOf(iid?: string | null): number | null {
  if (!iid) return null;
  const room = useGame.getState().room;
  for (const player of room?.players ?? []) {
    const zones = [player.battlefield, player.graveyard, player.exile, player.command, player.hand ?? []];
    if (zones.some((zone) => zone?.some((card) => card.iid === iid))) return player.seat;
  }
  return null;
}

/**
 * Where an arrow's end should sit. The card itself is the truth, but the
 * table is rarely showing every board at once: in the staged view only one
 * board is on screen. Fall back to the owning SEAT's board when that is
 * rendered - the arrow still says "from that player, at this card".
 */
function anchorFor(iid: string | null | undefined, seat: number | null | undefined) {
  return cardAnchor(iid) ?? seatAnchor(seat) ?? seatAnchor(ownerSeatOf(iid));
}

/**
 * The source is off-view entirely (their board is not staged): bring the
 * arrow in over the top edge instead of dropping it. Dropping it would hide
 * the gesture exactly when it is least obvious - you would see a ring on your
 * card and no idea who put it there. Fanned by seat so two off-view pointers
 * never draw the same line.
 */
function offscreenSource(to: { x: number; y: number }, seat: number) {
  const spread = ((seat % 4) - 1.5) * 90;
  return {
    x: Math.max(48, Math.min(window.innerWidth - 48, to.x + spread)),
    y: Math.max(40, to.y - 230),
  };
}

/** A gentle arc between two points: straight lines between two boards read as
 *  UI chrome, a curve reads as a gesture. The bow scales with distance and
 *  always bends the same way relative to travel direction, so two arrows
 *  crossing the table never lie exactly on top of each other. */
function geometry(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  // Stop the head just short of the target's centre so the arrow points AT
  // the card rather than burying its tip in the middle of the art.
  const inset = Math.min(26, dist / 2.5);
  const tipX = to.x - (dx / dist) * inset;
  const tipY = to.y - (dy / dist) * inset;
  // Control point: perpendicular offset from the midpoint.
  const bow = Math.min(90, dist * 0.22);
  const cx = (from.x + tipX) / 2 + (-dy / dist) * bow;
  const cy = (from.y + tipY) / 2 + (dx / dist) * bow;
  // The tangent at the endpoint of a quadratic curve points away from its
  // control point - that is the angle the head must wear.
  const angle = (Math.atan2(tipY - cy, tipX - cx) * 180) / Math.PI;
  return {
    d: `M ${from.x} ${from.y} Q ${cx} ${cy} ${tipX} ${tipY}`,
    hx: tipX,
    hy: tipY,
    angle,
    // The label rides the curve itself (a quadratic's own midpoint), not the
    // chord, so it never floats off the arrow on a long bow.
    mx: 0.25 * from.x + 0.5 * cx + 0.25 * tipX,
    my: 0.25 * from.y + 0.5 * cy + 0.25 * tipY,
  };
}

/** Cheap change detector: geometry is only re-rendered when it actually
 *  moves, so a still board costs one measure per frame and no React work. */
function signature(drawn: Drawn[]): string {
  return drawn
    .map((a) => `${a.key}:${a.d}|${Math.round(a.angle)}|${a.opacity.toFixed(2)}`)
    .join(';');
}

export function AimLayer({ meId }: { meId: string | undefined }) {
  // Live aims keyed by sender: a second point from the same player replaces
  // their first rather than stacking a second arrow on the table.
  const aims = useRef(new Map<string, Aim>());
  const [drawn, setDrawn] = useState<Drawn[]>([]);
  const lastSig = useRef('');

  useEffect(() => {
    return onMessage((message) => {
      if (message.type !== 'aim') return;
      // Marker kinds ride the same relay but are not pointing gestures.
      const kind = message.kind ?? 'target';
      if (kind !== 'target' && kind !== 'point') return;
      // An aim with no target is a cancel (the client clears its gesture).
      if (message.toIid == null && message.toSeat == null) {
        aims.current.delete(message.fromUserId);
        return;
      }
      aims.current.set(message.fromUserId, {
        userId: message.fromUserId,
        username: message.username,
        seat: message.fromSeat ?? 0,
        fromIid: message.fromIid,
        toIid: message.toIid,
        toSeat: message.toSeat,
        ward: message.ward,
        ts: Date.now(),
      });
    });
  }, []);

  // One rAF loop for every arrow: measure, expire, and publish only when the
  // drawn result actually changed. A still table therefore re-renders zero
  // times while an arrow hangs there.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = Date.now();
      const next: Drawn[] = [];
      for (const [id, aim] of [...aims.current]) {
        const age = now - aim.ts;
        if (age > ARROW_LIFE_MS) {
          aims.current.delete(id);
          continue;
        }
        // The target is what must be on screen; the source can be inferred.
        const to = anchorFor(aim.toIid, aim.toSeat);
        if (!to) continue;
        const from = anchorFor(aim.fromIid, aim.seat) ?? offscreenSource(to, aim.seat);
        if (from.x === to.x && from.y === to.y) continue;
        const g = geometry(from, to);
        const fade = age > ARROW_LIFE_MS - ARROW_FADE_MS ? (ARROW_LIFE_MS - age) / ARROW_FADE_MS : 1;
        next.push({
          key: id,
          color: seatColor(aim.seat),
          mine: aim.userId === meId,
          label: aim.ward ? `${aim.username} · ward ${aim.ward}` : aim.username,
          opacity: Math.max(0, Math.min(1, fade)),
          ...g,
        });
      }
      const sig = signature(next);
      if (sig !== lastSig.current) {
        lastSig.current = sig;
        setDrawn(next);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [meId]);

  if (drawn.length === 0) return null;

  return (
    <svg className="aimLayer" aria-hidden>
      {drawn.map((a) => (
        <g key={a.key} className="aimArrow" data-mine={a.mine || undefined} opacity={a.opacity}>
          {/* Two strokes: a soft wide one for the glow, the crisp crawling
              dash on top. A single stroke with a filter costs far more. */}
          <path className="aimGlow" d={a.d} fill="none" stroke={a.color} />
          <path className="aimStroke" d={a.d} fill="none" stroke={a.color} />
          <path
            className="aimHead"
            d="M 0 0 L -13 -7 L -9 0 L -13 7 Z"
            fill={a.color}
            transform={`translate(${a.hx} ${a.hy}) rotate(${a.angle})`}
          />
          <text className="aimLabelText" x={a.mx} y={a.my} fill={a.color}>
            {a.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
