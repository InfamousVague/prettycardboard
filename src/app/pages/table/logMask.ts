/**
 * Spoiler masking for the table log.
 *
 * A glance at the log must never reveal what a tutor fetched or what is about
 * to resolve, so capitalized runs (card names) are starred out until the reader
 * explicitly asks to see them. Player names and a short list of structural
 * words are protected first, because they are also capitalized and masking them
 * would make the line unreadable.
 *
 * Heuristic on purpose: over-masking a verb is harmless, under-masking a
 * tutored card is the thing this prevents.
 *
 * Shared so every surface that renders the log - the desktop rail, the phone
 * sheet, the portrait companion - masks identically. One implementation is the
 * point: a second copy is a spoiler leak waiting to happen.
 */

/** Words that survive masking: they are chrome, never card names. */
const KEEP = new Set(['Game', 'Turn', 'GG', 'AI', 'Foil']);

const NAME_RUN =
  /\b[A-Z][\w'!-]*(?:(?:,?\s+(?:of|the|and|a|an|to|in|for)\s+|,?\s+)[A-Z][\w'!-]*)*\b/g;

/** NUL: it cannot occur in a log line and the name-run regex cannot match it,
 *  so a player name parked behind it comes back byte-identical. */
const PARK = String.fromCharCode(0);

/**
 * @param text        one log line
 * @param playerNames every seated player's username - protected verbatim
 * @returns the line with card names replaced by ★★★
 */
export function maskLogNames(text: string, playerNames: readonly string[]): string {
  // Longest first, so "Ann Lee" is parked before a bare "Ann" can eat its head.
  const names = [...playerNames].sort((a, b) => b.length - a.length);
  let masked = text;
  names.forEach((name, index) => {
    masked = masked.split(name).join(`${PARK}${index}${PARK}`);
  });
  masked = masked.replace(NAME_RUN, (run) => (KEEP.has(run) ? run : '★★★'));
  names.forEach((name, index) => {
    masked = masked.split(`${PARK}${index}${PARK}`).join(name);
  });
  return masked;
}
