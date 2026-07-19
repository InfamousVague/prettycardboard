/**
 * juice.ts - the table's feel primitives.
 *
 * Everything here is fire-and-forget: WAAPI clones and micro-pulses that never
 * hold the UI hostage (the next action must always be acceptable immediately).
 * All of it degrades to fast fades under prefers-reduced-motion.
 */

/** Balatro-style overshoot settle curve, shared with table.css as --pc-settle. */
export const SETTLE_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Deterministic resting rotation per card instance, +-3deg, so a board of
 * cards never looks machine-stamped but never jitters between renders either.
 */
export function restTilt(iid: string): number {
  let hash = 0;
  for (let i = 0; i < iid.length; i += 1) hash = (hash * 31 + iid.charCodeAt(i)) | 0;
  return ((hash % 61) / 10) - 3; // -3.0 .. +3.0
}

/** Velocity-following drag tilt: rotate = clamp(vx * k, +-8deg). vx in px/ms. */
export function dragTilt(vx: number): number {
  return Math.max(-8, Math.min(8, vx * 9));
}

/**
 * A brief scale 1.06 + rotate wobble on any element - the shared impact
 * primitive for taps, counters, resolves, and dice.
 */
export function juicePulse(el: Element | null | undefined, strength = 1): void {
  if (!el || prefersReducedMotion()) return;
  const scale = 1 + 0.06 * strength;
  const wobble = 2.2 * strength;
  el.animate(
    [
      { transform: 'scale(1) rotate(0deg)' },
      { transform: `scale(${scale}) rotate(${wobble}deg)`, offset: 0.35 },
      { transform: `scale(${1 + 0.015 * strength}) rotate(${-wobble * 0.5}deg)`, offset: 0.7 },
      { transform: 'scale(1) rotate(0deg)' },
    ],
    { duration: 320, easing: SETTLE_EASE, composite: 'add' },
  );
}

/* ------------------------------------------------------------------------ */
/* Flight anchors: zones register their DOM rects so any action can arc a    */
/* card clone between them without prop-drilling refs across the tree.       */
/* ------------------------------------------------------------------------ */

const anchors = new Map<string, HTMLElement>();

export function setFlightAnchor(key: string, el: HTMLElement | null): void {
  if (el) anchors.set(key, el);
  else anchors.delete(key);
}

export function flightAnchor(key: string): DOMRect | null {
  const el = anchors.get(key);
  if (!el || !el.isConnected) return null;
  return el.getBoundingClientRect();
}

export interface FlightOpts {
  /** Card art for the flying clone; omit for a face-down flight. */
  imageUrl?: string;
  faceDown?: boolean;
  /** Clone width in px (height follows the print ratio). Defaults to the source width. */
  width?: number;
  /** Half-flip the clone mid-flight (library draws, face-down reveals). */
  flip?: boolean;
}

const CARD_RATIO = 680 / 488;

/**
 * Arc a card clone between two rects along a quadratic bezier with slight
 * scale + rotation, 280-380ms by distance, then remove it. The real element
 * swap happens via server state; this is pure garnish and never blocks input.
 */
export function flyCard(from: DOMRect | null, to: DOMRect | null, opts: FlightOpts = {}): void {
  if (!from || !to || typeof document === 'undefined') return;
  if (prefersReducedMotion()) return; // state change itself is the feedback

  const width = Math.min(opts.width ?? from.width, 120);
  const height = width * CARD_RATIO;
  const clone = document.createElement('div');
  clone.className = `pcFlight${opts.faceDown || !opts.imageUrl ? ' pcFlightBack' : ''}`;
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  if (opts.imageUrl && !opts.faceDown) clone.style.backgroundImage = `url("${opts.imageUrl}")`;
  document.body.appendChild(clone);

  const x0 = from.left + from.width / 2 - width / 2;
  const y0 = from.top + from.height / 2 - height / 2;
  const x1 = to.left + to.width / 2 - width / 2;
  const y1 = to.top + to.height / 2 - height / 2;
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const duration = Math.max(280, Math.min(380, 240 + dist * 0.22));

  // Control point: perpendicular lift so the card arcs instead of sliding.
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const lift = Math.min(140, 36 + dist * 0.22);
  const cx = mx;
  const cy = my - lift;

  const targetScale = Math.max(0.55, Math.min(1.35, (to.width || width) / width));
  const spin = (x1 >= x0 ? 1 : -1) * Math.min(10, 4 + dist * 0.01);

  const steps = 22;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const inv = 1 - u;
    const bx = inv * inv * x0 + 2 * inv * u * cx + u * u * x1;
    const by = inv * inv * y0 + 2 * inv * u * cy + u * u * y1;
    const scale = 1 + (targetScale - 1) * u + Math.sin(u * Math.PI) * 0.06;
    const rot = Math.sin(u * Math.PI) * spin;
    const flip = opts.flip ? ` rotateY(${inv * 180}deg)` : '';
    frames.push({
      transform: `translate(${bx}px, ${by}px) rotate(${rot}deg) scale(${scale})${flip}`,
      opacity: u > 0.9 ? 1 - (u - 0.9) * 6 : 1,
    });
  }

  const anim = clone.animate(frames, { duration, easing: 'cubic-bezier(0.3, 0.1, 0.3, 1)' });
  anim.onfinish = () => clone.remove();
  anim.oncancel = () => clone.remove();
}

/** Arc from a live element (or rect) to a registered zone anchor. */
export function flyToAnchor(from: Element | DOMRect | null, anchorKey: string, opts: FlightOpts = {}): void {
  const fromRect = from instanceof Element ? from.getBoundingClientRect() : from;
  flyCard(fromRect ?? null, flightAnchor(anchorKey), opts);
}

/** Arc from a registered zone anchor to a live element (or rect). */
export function flyFromAnchor(anchorKey: string, to: Element | DOMRect | null, opts: FlightOpts = {}): void {
  const toRect = to instanceof Element ? to.getBoundingClientRect() : to;
  flyCard(flightAnchor(anchorKey), toRect ?? null, opts);
}
