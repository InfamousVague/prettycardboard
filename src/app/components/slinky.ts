/**
 * Slinky fan layout: a spread that is dense at its ends and opens up around
 * wherever the pointer is.
 *
 * Every fan in the app used to space its cards evenly, which works right up
 * until there are a lot of them. An even spread has exactly two settings, and
 * both are bad at scale: keep the per-card step and a forty-card hand runs off
 * both edges of the screen, or shrink the step and forty cards become one
 * illegible smear with only the last card readable.
 *
 * A slinky solves both at once by decoupling the track from the contents. The
 * track is a FIXED length - the width of the hand strip, the angle a fan is
 * allowed to sweep - and the cards are distributed across it by weight rather
 * than by count. With nothing focused every card weighs the same and the
 * result is the even spread as before. Focus a card and it and its neighbours
 * weigh more, so they claim more of the track; everything else weighs the same
 * as it always did but there is less track left, so it compresses. The ends
 * stay pinned, so the fan's silhouette never moves and it can never overflow -
 * which is the whole point - and the compressed cards visibly bunch toward the
 * side away from the pointer, the way the coils of a slinky pile up at one end
 * when you lift the other.
 *
 * Positions come back as fractions of the track (0 at the first card, 1 at the
 * last), because the surfaces using this measure their tracks in different
 * units: the pack fans map them onto degrees of arc, the hand onto pixels of
 * strip width.
 */

export interface SlinkyOptions {
  /**
   * How much extra track the focused card claims, as a multiple of an unfocused
   * one. 0 gives an even spread; 2 makes the focused card three times the width
   * of a card at the far end.
   */
  gain?: number;
  /**
   * How many cards either side of the focus share in the expansion. Small
   * values give a sharp local bulge; large ones tilt the whole fan.
   */
  reach?: number;
}

/**
 * Enough to lift a card clear of its neighbours without the far end collapsing
 * into a single edge - past about 3 the cards outside the bulge stop being
 * separable at all, which trades one unreadable fan for another.
 */
const GAIN = 2.4;

/**
 * A little over two cards each way. Wide enough that the expansion reads as the
 * fan opening rather than one card popping out, narrow enough that a forty-card
 * hand still only reveals a handful at a time - which is the behaviour that
 * makes forty cards navigable instead of merely visible.
 */
const REACH = 2.2;

/**
 * Where each of `count` cards sits along its track, as a fraction from 0 to 1.
 *
 * `focus` is a FRACTIONAL index - 0 is the first card, `count - 1` the last,
 * and 3.5 is the seam between the fourth and fifth - so a pointer sliding
 * across the fan moves the bulge continuously instead of snapping card to
 * card. Pass null for the resting, evenly spread state.
 */
export function slinkyOffsets(
  count: number,
  focus: number | null,
  options: SlinkyOptions = {},
): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0.5];
  if (focus === null || !Number.isFinite(focus)) {
    return Array.from({ length: count }, (_, index) => index / (count - 1));
  }

  const gain = options.gain ?? GAIN;
  const reach = options.reach ?? REACH;

  // A gaussian rather than a triangle so the bulge has no corners: a linear
  // falloff puts a visible kink in the fan at the edge of its own influence,
  // and the kink slides around with the pointer.
  const weights: number[] = [];
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    const distance = (index - focus) / reach;
    const weight = 1 + gain * Math.exp(-distance * distance);
    weights.push(weight);
    total += weight;
  }

  // Each card sits at the middle of the slice its weight bought, so a heavy
  // card pushes its neighbours away symmetrically instead of dragging the fan
  // in one direction.
  const centres: number[] = [];
  let run = 0;
  for (let index = 0; index < count; index += 1) {
    const weight = weights[index] ?? 1;
    centres.push((run + weight / 2) / total);
    run += weight;
  }

  // Pin the ends. Without this the whole fan would shrink toward the middle as
  // soon as anything was focused, because the outermost cards' half-slices grow
  // with them - and a fan that changes size under the pointer is exactly the
  // overflow problem this exists to solve.
  const first = centres[0] ?? 0;
  const last = centres[count - 1] ?? 1;
  const span = last - first || 1;
  return centres.map((centre) => (centre - first) / span);
}

/**
 * The pointer's position across a track, as the fractional card index to focus.
 *
 * Linear in the track rather than in the arc: a fan's cards are not evenly
 * spaced in x once it is rotated, but the error is well under half a card at
 * the spreads these fans use, and chasing it exactly would mean hit-testing
 * every card on every pointer move.
 */
export function focusFromPointer(clientX: number, rect: DOMRect, count: number): number | null {
  if (count <= 1 || rect.width <= 0) return null;
  const along = (clientX - rect.left) / rect.width;
  return Math.max(0, Math.min(1, along)) * (count - 1);
}

/**
 * A fan's resting focus: its own middle.
 *
 * This is what puts the density at the EDGES rather than spreading everything
 * evenly - the centre cards claim the room and the outer ones tuck in behind
 * each other, which is both how a real fan of cards sits in a hand and the only
 * way a forty-card hand fits the same strip a seven-card one does.
 */
export function restFocus(count: number): number {
  return (count - 1) / 2;
}

/**
 * The tuning the table's hands use.
 *
 * Gentler than the pack fans: a hand is somewhere you work, not a reveal, and a
 * card that has to be chased is worse than one that is merely small. The reach
 * grows with the hand so a big one is not reduced to five readable cards and
 * two solid blocks - forty cards want the bulge spread over eight, not two.
 */
export function handSlinky(count: number): SlinkyOptions {
  return { gain: 1.8, reach: Math.max(2.2, count / 5) };
}

/**
 * Reshape a fan around `focus` by writing `--slink` onto each of its children.
 *
 * The hands render their resting offsets through React, but a pointer sweeping
 * a forty-card fan must not re-render forty cards a frame - so hover repaints
 * the same custom property in place instead. Both paths compute the same
 * numbers from the same helpers, so the two can never disagree for longer than
 * the frame a re-render lands on. Pass null to return to rest.
 */
export function paintSlinky(fan: HTMLElement | null, focus: number | null): void {
  if (!fan) return;
  const cards = fan.children;
  const count = cards.length;
  const offsets = slinkyOffsets(count, focus ?? restFocus(count), handSlinky(count));
  for (let index = 0; index < count; index += 1) {
    (cards[index] as HTMLElement).style.setProperty('--slink', String(offsets[index] ?? 0.5));
  }
}
