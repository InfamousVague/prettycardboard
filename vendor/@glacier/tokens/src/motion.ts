/**
 * Motion tokens, named by role so the whole kit's feel retunes in one place.
 * The @glacier/motion package mirrors these as framer-motion transitions.
 */

export const durations = {
  instant: 75,
  fast: 150,
  normal: 250,
  slow: 400,
  slower: 600,
} as const;

export type DurationRole = keyof typeof durations;

export const easings = {
  out: [0.16, 1, 0.3, 1],
  'in-out': [0.65, 0, 0.35, 1],
  spring: [0.34, 1.56, 0.64, 1],
  exit: [0.4, 0, 1, 1],
} as const;

export type EaseRole = keyof typeof easings;

export const cssEase = (name: EaseRole): string =>
  `cubic-bezier(${easings[name].join(', ')})`;

// ---- CSS emission ----------------------------------------------------------

/** Durations and easing curves, named by role. */
export function motionDecls(): Array<[string, string]> {
  const decls: Array<[string, string]> = [];
  for (const [name, ms] of Object.entries(durations)) decls.push([`duration-${name}`, `${ms}ms`]);
  for (const name of Object.keys(easings)) decls.push([`ease-${name}`, cssEase(name as EaseRole)]);
  return decls;
}

/** Under prefers-reduced-motion, collapse every duration to near-zero. */
export function reducedMotionDecls(): Array<[string, string]> {
  return Object.keys(durations).map((name) => [`duration-${name}`, '0.01ms'] as [string, string]);
}
