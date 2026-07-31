/**
 * Which table-log lines count as EVENTS worth surfacing outside the log
 * panel - match events (seats, starts, concessions) and engine resolutions
 * (spells resolving, counters, discards, scries, mills, engine draws,
 * triggers, loyalty). One classification table feeds both surfaces: the
 * toast rail (EventToasts) and the chat transcript's system lines.
 */
export type EventTone = 'info' | 'neutral' | 'success' | 'danger';

export interface EventClass {
  match: RegExp;
  tone: EventTone;
  /** Things done TO players: these always get through the toast rate limiter. */
  important?: boolean;
}

export const EVENT_CLASSES: EventClass[] = [
  // Things done TO a player - always worth surfacing.
  { match: / must discard /, tone: 'info', important: true },
  { match: / discards /, tone: 'info', important: true },
  { match: / targets .+ with /, tone: 'info', important: true },
  // Trigger applications go before the counter class: their summaries can
  // read "...counters on it", which the lookahead below also guards.
  { match: / applies .+ trigger: /, tone: 'info' },
  { match: / resolves .+ trigger by hand/, tone: 'info' },
  // The countering VERB, with or without the "with {counterspell}" tail
  // (freeform's bare "counters X" included) - never the +1/+1 NOUN, which
  // always continues "counters on/from ..." or ends the sentence.
  { match: / counters (?!on |from )/, tone: 'info', important: true },
  { match: / scries /, tone: 'info' },
  { match: / mills /, tone: 'info' },
  // Only ENGINE draws carry a parenthesized source; ordinary turn draws are
  // table noise.
  { match: / draws .+ \(.+\)$/, tone: 'info' },
  { match: / enters with /, tone: 'info' },
  { match: / creates .+ token/, tone: 'info' },
  // A spell leaving the stack (but combat resolution has its own preview UI).
  { match: / resolves (?!combat$)/, tone: 'neutral' },
  // Match events.
  { match: / takes seat /, tone: 'neutral', important: true },
  { match: / leaves the room/, tone: 'neutral', important: true },
  { match: /^Game started/, tone: 'success', important: true },
  { match: / concedes$/, tone: 'neutral', important: true },
];

// RollBanner territory: dice and combat damage get the center-stage banner,
// never a duplicate. (Trigger life-gain/loss also stays out - the vitals
// animate it.)
export const BANNERISH =
  /\broll(s|ed)?\b|\bHeads\b|\bTails\b|gains \d+ life|loses \d+ life|deals \d+ damage to|commander damage/i;

/** The event class for a log line, or null when it is not event-worthy. */
export function classifyEventLine(text: string): EventClass | null {
  if (BANNERISH.test(text)) return null;
  return EVENT_CLASSES.find((c) => c.match.test(text)) ?? null;
}
