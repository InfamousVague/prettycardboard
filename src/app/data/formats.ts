/**
 * The deck formats the builder understands. Each format carries its
 * construction rules; the editor adapts its panels, warnings, and targets to
 * whichever format the deck declares. Unknown format strings (older decks,
 * imports) resolve to Freeform, which enforces nothing.
 */

export interface DeckFormat {
  id: string;
  name: string;
  /** Exact deck size (Commander's 100) or null when only a minimum applies. */
  exactSize: number | null;
  /** Minimum deck size when there is no exact requirement. */
  minSize: number | null;
  /** Copy limit per non-basic card: 1 (singleton), 4 (constructed), null (any). */
  maxCopies: number | null;
  /** The deck leads with a commander in the command zone. */
  hasCommander: boolean;
  /** Commander Brackets apply (the official 1-5 system). */
  brackets: boolean;
  /** Starting life at the table. */
  startingLife: number;
}

export const FORMATS: DeckFormat[] = [
  { id: 'commander', name: 'Commander', exactSize: 100, minSize: null, maxCopies: 1, hasCommander: true, brackets: true, startingLife: 40 },
  { id: 'brawl', name: 'Brawl', exactSize: 60, minSize: null, maxCopies: 1, hasCommander: true, brackets: false, startingLife: 25 },
  { id: 'standard', name: 'Standard', exactSize: null, minSize: 60, maxCopies: 4, hasCommander: false, brackets: false, startingLife: 20 },
  { id: 'pioneer', name: 'Pioneer', exactSize: null, minSize: 60, maxCopies: 4, hasCommander: false, brackets: false, startingLife: 20 },
  { id: 'modern', name: 'Modern', exactSize: null, minSize: 60, maxCopies: 4, hasCommander: false, brackets: false, startingLife: 20 },
  { id: 'legacy', name: 'Legacy', exactSize: null, minSize: 60, maxCopies: 4, hasCommander: false, brackets: false, startingLife: 20 },
  { id: 'vintage', name: 'Vintage', exactSize: null, minSize: 60, maxCopies: 4, hasCommander: false, brackets: false, startingLife: 20 },
  { id: 'pauper', name: 'Pauper', exactSize: null, minSize: 60, maxCopies: 4, hasCommander: false, brackets: false, startingLife: 20 },
  { id: 'freeform', name: 'Freeform', exactSize: null, minSize: null, maxCopies: null, hasCommander: false, brackets: false, startingLife: 20 },
];

const FREEFORM = FORMATS[FORMATS.length - 1]!;

/** Case-insensitive lookup; anything unrecognized plays as Freeform. */
export function formatFor(name: string | undefined | null): DeckFormat {
  const key = (name ?? '').trim().toLowerCase();
  return FORMATS.find((format) => format.id === key || format.name.toLowerCase() === key) ?? FREEFORM;
}

/** The size the deck builds toward: the exact size, else the minimum, else null. */
export function formatTarget(format: DeckFormat): number | null {
  return format.exactSize ?? format.minSize;
}

const BASICS = new Set([
  'plains',
  'island',
  'swamp',
  'mountain',
  'forest',
  'wastes',
  'snow-covered plains',
  'snow-covered island',
  'snow-covered swamp',
  'snow-covered mountain',
  'snow-covered forest',
  'snow-covered wastes',
]);

/** Basic lands escape every copy limit. */
export function isBasicLand(name: string): boolean {
  return BASICS.has(name.trim().toLowerCase());
}
