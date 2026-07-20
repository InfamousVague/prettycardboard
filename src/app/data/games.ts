import type { Board, Zone } from '../net/types.ts';
import { cardImage } from './cards.ts';
import { cyberpunkImage } from './cyberpunk.ts';

/**
 * The multi-game registry: one GameDef per supported card game. The server is a
 * FREEFORM engine (it moves cards between zones and never judges legality), so a
 * game is defined almost entirely by presentation + defaults: what the six
 * physical zones are CALLED, which vitals a player tracks, the turn phases, how
 * decks are built, and how a card id resolves to art. Adding a game is adding an
 * entry here (plus its card catalog); the table/deck-builder/vitals all read
 * from this registry rather than hard-coding Magic.
 *
 * Zones map onto the server's fixed six-slot model (library/hand/battlefield/
 * graveyard/exile/command) so no engine change is needed - a game just relabels
 * and hides the slots it does not use.
 */

export type GameId = 'mtg' | 'cyberpunk';

export interface GameZoneDef {
  /** The physical server zone slot this maps to. */
  slot: Zone;
  label: string;
  /** Hidden zone (contents private; shown as a count/pile), like a library. */
  hidden?: boolean;
  /** Not used by this game (hide entirely). */
  unused?: boolean;
}

export interface GameResourceDef {
  id: string;
  label: string;
  /** Starting value; a function of format for life totals. */
  start: number | ((format: string) => number);
  /** The headline vital (rendered large). */
  primary?: boolean;
  min?: number;
}

export interface GameStatDef {
  id: 'cost' | 'power' | 'ram' | 'mana' | 'pt';
  label: string;
}

export interface GameDeckRules {
  /** Target deck size (main + special). */
  size: number;
  /** At most one copy of each card (singleton). */
  singleton: boolean;
  /** Opening hand size dealt at game start. */
  startingHand: number;
  /** A special anchor board (Commander / Legend), mapped onto the server's
   * "commander" board slot. */
  anchor?: { board: Board; label: string; count: number };
}

export interface GameDef {
  id: GameId;
  name: string;
  tagline: string;
  /** Brand accent (hex). */
  accent: string;
  /** Zones in rail order (excludes hand/battlefield, which are the play areas). */
  zones: GameZoneDef[];
  /** Player vitals/counters. */
  resources: GameResourceDef[];
  /** Turn phases; empty = freeform turn passing (no phase ribbon). */
  phases: { id: string; label: string }[];
  /** Card stats surfaced on badges/popups. */
  stats: GameStatDef[];
  deck: GameDeckRules;
  formats: { id: string; label: string }[];
  /** Whether cards tap/exhaust (both games do). */
  tapping: boolean;
  /** Resolve a card id (Scryfall id for mtg, Netdeck UUID for cyberpunk) to a
   * rendered face image URL. */
  resolveImage: (cardId: string | undefined) => string;
}

const MTG: GameDef = {
  id: 'mtg',
  name: 'Magic: The Gathering',
  tagline: 'Freeform Commander & 60-card for 2–6 players',
  // A violet "arcane" accent, deliberately distinct from Cyberpunk's neon
  // yellow so the two game tags read apart at a glance.
  accent: '#7c6cf0',
  zones: [
    { slot: 'library', label: 'Library', hidden: true },
    { slot: 'graveyard', label: 'Graveyard' },
    { slot: 'exile', label: 'Exile' },
    { slot: 'command', label: 'Command' },
  ],
  resources: [
    { id: 'life', label: 'Life', start: (format) => (format === 'commander' ? 40 : 20), primary: true },
    { id: 'poison', label: 'Poison', start: 0, min: 0 },
  ],
  phases: [
    { id: 'upkeep', label: 'Upkeep' },
    { id: 'main1', label: 'Main 1' },
    { id: 'attack', label: 'Attack' },
    { id: 'block', label: 'Block' },
    { id: 'damage', label: 'Damage' },
    { id: 'main2', label: 'Main 2' },
    { id: 'end', label: 'End' },
  ],
  stats: [
    { id: 'mana', label: 'Mana' },
    { id: 'pt', label: 'P/T' },
  ],
  deck: {
    size: 100,
    singleton: true,
    startingHand: 7,
    anchor: { board: 'commander', label: 'Commander', count: 1 },
  },
  formats: [
    { id: 'commander', label: 'Commander' },
    { id: 'standard', label: 'Standard' },
  ],
  tapping: true,
  resolveImage: (id) => cardImage(id),
};

const CYBERPUNK: GameDef = {
  id: 'cyberpunk',
  name: 'Cyberpunk TCG',
  tagline: 'Build your crew. Earn your legend. Take Night City.',
  accent: '#f4d03f',
  zones: [
    { slot: 'library', label: 'Deck', hidden: true },
    { slot: 'command', label: 'Legend' },
    { slot: 'exile', label: 'Eddies' },
    { slot: 'graveyard', label: 'Trash' },
  ],
  resources: [
    // Freeform trackers (exact rules TBD): Net control is the win metric; RAM is
    // the per-turn memory pool programs draw on.
    { id: 'net', label: 'Net', start: 0, primary: true, min: 0 },
    { id: 'ram', label: 'RAM', start: 0, min: 0 },
  ],
  phases: [],
  stats: [
    { id: 'cost', label: 'Cost' },
    { id: 'power', label: 'Power' },
    { id: 'ram', label: 'RAM' },
  ],
  deck: {
    // Deck-building rules (cyberpunktcg.com): 40-50 cards NOT counting Legends,
    // max 3 copies, and exactly 3 Legends (unique names) that set the RAM budget.
    size: 40,
    singleton: false,
    startingHand: 6,
    anchor: { board: 'commander', label: 'Legend', count: 3 },
  },
  formats: [{ id: 'standard', label: 'Standard' }],
  tapping: true,
  resolveImage: (id) => cyberpunkImage(id),
};

export const GAMES: Record<GameId, GameDef> = { mtg: MTG, cyberpunk: CYBERPUNK };

export const GAME_LIST: GameDef[] = [MTG, CYBERPUNK];

/** The default game for existing rooms and any snapshot without a `game` field. */
export const DEFAULT_GAME: GameId = 'mtg';

export function getGame(id: string | undefined | null): GameDef {
  return (id && GAMES[id as GameId]) || GAMES[DEFAULT_GAME];
}

/** Game-aware card-face resolution: routes to Scryfall (mtg) or the bundled
 * Cyberpunk cache by the room's game. */
export function resolveCardImage(gameId: string | undefined, cardId: string | undefined): string {
  return getGame(gameId).resolveImage(cardId);
}

/** The rail label for a physical zone slot under a given game (falls back to the
 * slot name for zones a game does not relabel). */
export function zoneLabel(gameId: string | undefined, slot: Zone): string {
  const zone = getGame(gameId).zones.find((z) => z.slot === slot);
  if (zone) return zone.label;
  const fallback: Record<Zone, string> = {
    library: 'Library',
    hand: 'Hand',
    battlefield: 'Battlefield',
    graveyard: 'Graveyard',
    exile: 'Exile',
    command: 'Command',
  };
  return fallback[slot];
}
