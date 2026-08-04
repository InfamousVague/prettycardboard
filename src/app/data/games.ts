import type { Board, Zone } from '../net/types.ts';
import { cardImage } from './cards.ts';
import { cyberpunkImage } from './cyberpunk.ts';
import { yugiohImage } from './yugioh.ts';
import { moodImage } from './moodswings.ts';
import { FORMATS, formatFor } from './formats.ts';

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

export type GameId = 'mtg' | 'cyberpunk' | 'yugioh' | 'moodswings';

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
  id: 'cost' | 'power' | 'ram' | 'mana' | 'pt' | 'atk' | 'level';
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
  /** Whether cards tap/exhaust (all three games do). */
  tapping: boolean;
  /** Work-in-progress: hidden from every picker unless the "Enable WIP
   * features" developer toggle is on. */
  wip?: boolean;
  /** Guided combat (attack/block declarations + banners) applies. */
  combat?: boolean;
  /** The token picker / create-token affordances apply. */
  tokens?: boolean;
  /** The table markers menu (monarch/initiative/day-night/storm) applies. */
  markers?: boolean;
  /** Resolve a card id (Scryfall id for mtg, Netdeck UUID for cyberpunk,
   * YGOPRODeck passcode for yugioh) to a rendered face image URL. */
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
    { id: 'life', label: 'Life', start: (format) => formatFor(format).startingLife, primary: true },
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
  formats: FORMATS.map((f) => ({ id: f.id, label: f.name })),
  tapping: true,
  combat: true,
  tokens: true,
  markers: true,
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
  wip: true,
  resolveImage: (id) => cyberpunkImage(id),
};

const YUGIOH: GameDef = {
  id: 'yugioh',
  name: 'Yu-Gi-Oh!',
  tagline: 'Freeform dueling at 8000 LP — Main, Extra & Side Decks',
  // Millennium-gold, deliberately warmer/deeper than Cyberpunk's neon lemon.
  accent: '#d99123',
  zones: [
    { slot: 'library', label: 'Deck', hidden: true },
    { slot: 'graveyard', label: 'Graveyard' },
    { slot: 'exile', label: 'Banished' },
    // The Extra Deck rides the command slot (the anchor-board pattern
    // cyberpunk's Legends established). The server deals it face-down, so
    // opponents see a pile of backs while the owner can browse it.
    { slot: 'command', label: 'Extra Deck' },
  ],
  resources: [
    // LP only: Yu-Gi-Oh has no standing secondary counter, and the vitals UI
    // hides the secondary row when a game defines none.
    { id: 'lp', label: 'LP', start: 8000, primary: true },
  ],
  // Duel phases mapped onto the server's fixed MTG phase ids (the server
  // validates phase.set against that list; the labels are ours). Standby is
  // folded into Draw — freeform players announce it when it matters.
  phases: [
    { id: 'upkeep', label: 'Draw' },
    { id: 'main1', label: 'Main 1' },
    { id: 'attack', label: 'Battle' },
    { id: 'main2', label: 'Main 2' },
    { id: 'end', label: 'End' },
  ],
  stats: [
    { id: 'level', label: 'Level' },
    { id: 'atk', label: 'ATK / DEF' },
  ],
  deck: {
    // Main Deck 40-60 (40 is the constructed floor and the target), up to 3
    // copies of a name, Extra Deck (<=15) anchored on the commander board.
    size: 40,
    singleton: false,
    startingHand: 5,
    anchor: { board: 'commander', label: 'Extra Deck', count: 15 },
  },
  formats: [{ id: 'standard', label: 'Standard' }],
  tapping: true,
  resolveImage: (id) => yugiohImage(id),
};

/**
 * Mood Swings is the odd one out in this registry, and the shape of the entry
 * is mostly a record of that. It is not a TCG: no mana, no life, no combat, no
 * deckbuilding, and a game lasts five minutes. Everyone plays out of ONE shared
 * deck into a personal row of moods that accumulates across rounds; highest
 * total takes the round, three rounds takes the game.
 *
 * Two mappings onto the freeform engine are worth naming:
 *
 * - `library`/`graveyard` are per-player slots and the real game's deck and
 *   discard are SHARED. The table works because the engine is freeform: the
 *   host holds the pile everyone draws from and moves cards on request, the
 *   same way a physical table has one person nearest the box. Anything better
 *   needs a shared-zone concept the server does not have.
 * - `tapping` is on, but sideways here means SUPPRESSED - value counts as [0]
 *   while the card stays in play (it still has a colour other cards can see).
 */
const MOOD_SWINGS: GameDef = {
  id: 'moodswings',
  name: 'Mood Swings',
  tagline: 'Mark Rosewater’s emotion game — 2–4 players, five minutes, no deckbuilding',
  // Rose. The cards are graphite-grey art in five coloured frames, so the game
  // has no single brand colour of its own to borrow; this reads apart from
  // Magic's violet, Cyberpunk's lemon and Yu-Gi-Oh's gold at tag size.
  accent: '#e2678f',
  zones: [
    { slot: 'library', label: 'Deck', hidden: true },
    { slot: 'graveyard', label: 'Discard' },
    // Where the Hurt Feelings marker sits for whoever is holding it. Nothing is
    // dealt here at setup (no `anchor`), and in a two-player game it stays
    // empty - Hurt Feelings only exists at three or more.
    { slot: 'command', label: 'Hurt Feelings' },
    { slot: 'exile', label: 'Exile', unused: true },
  ],
  resources: [
    // First to three rounds wins, so rounds - not score - is the headline
    // number. Score is per-round and resets; the playmat also shows the printed
    // sum of your moods as an aid, which is why this stays a manual counter.
    { id: 'rounds', label: 'Rounds', start: 0, primary: true, min: 0 },
    { id: 'score', label: 'Score', start: 0, min: 0 },
  ],
  // No phases: a turn is "play one mood or pass", and a round is one turn each.
  phases: [],
  stats: [{ id: 'cost', label: 'Value' }],
  deck: {
    // A box is 45 cards drawn from the 133-card set, and the 45 are distinct,
    // so the pool is singleton. Everyone draws five to start.
    size: 45,
    singleton: true,
    startingHand: 5,
  },
  formats: [{ id: 'standard', label: 'Standard' }],
  tapping: true,
  resolveImage: (id) => moodImage(id),
};

export const GAMES: Record<GameId, GameDef> = {
  mtg: MTG,
  cyberpunk: CYBERPUNK,
  yugioh: YUGIOH,
  moodswings: MOOD_SWINGS,
};

export const GAME_LIST: GameDef[] = [MTG, CYBERPUNK, YUGIOH, MOOD_SWINGS];

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
