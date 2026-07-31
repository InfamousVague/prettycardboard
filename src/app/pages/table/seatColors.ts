/**
 * One palette for everything that identifies a SEAT rather than a card: the
 * live cursors, the pointing arrows, and the table markers. Shared so the same
 * player is the same colour in all three - a red arrow and a red puck are
 * legibly "the player in the red chair", which is the whole point of colouring
 * them at all.
 */

/** A distinct, legible hue per seat. */
export function seatHue(seat: number): number {
  return (seat * 67) % 360;
}

export function seatColor(seat: number, alpha = 1): string {
  return alpha < 1 ? `hsl(${seatHue(seat)} 85% 62% / ${alpha})` : `hsl(${seatHue(seat)} 85% 62%)`;
}

/** The darker companion, for gradients and puck rims. */
export function seatColorDeep(seat: number, alpha = 1): string {
  return alpha < 1 ? `hsl(${seatHue(seat)} 70% 34% / ${alpha})` : `hsl(${seatHue(seat)} 70% 34%)`;
}
