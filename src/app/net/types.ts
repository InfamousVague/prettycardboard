/** Shared client-side types for the PrettyCardboard protocol (see PROTOCOL.md). */

export interface Identity {
  userId: string;
  username: string;
  token: string;
}

export type Board = 'commander' | 'main' | 'side';

/** The pile zones a player can reposition on their mat. */
export type MatZone = 'library' | 'graveyard' | 'exile' | 'command';

/** A normalized (0..1) zone-pile center on a player's mat. */
export interface MatPos {
  x: number;
  y: number;
}

/** Public deck metrics for the matchup splash, computed by the deck OWNER's
 * client (the server stores decks as bare card ids and can't derive these).
 * MTG decks fill colors/avgMv/type counts; Cyberpunk fills ram/avgCost. */
export interface DeckMeta {
  size: number;
  /** The deck's cover card id, so every seat at the table can show the deck's
   *  artwork - decks themselves are never public, but their face is. */
  cover?: string;
  colors?: string[];
  avgMv?: number;
  creatures?: number;
  lands?: number;
  spells?: number;
  other?: number;
  ram?: number;
  avgCost?: number;
}

export interface DeckCard {
  scryfallId: string;
  name: string;
  quantity: number;
  board: Board;
}

export interface DeckSummary {
  id: string;
  name: string;
  format: string;
  /** Which card game this deck is for ("mtg" | "cyberpunk"). */
  game: string;
  commander: string;
  cardCount: number;
  /** MTG cover (Scryfall scan URL); null for Cyberpunk (resolve from coverCardId). */
  coverImageUrl: string | null;
  /** The cover card's id, for game-aware art resolution. */
  coverCardId?: string | null;
  /** The mat this deck brings to the table; null = the player's own default. */
  playmat?: string | null;
  /** The card back this deck's cards wear; null = the player's own default. */
  cardBack?: string | null;
  updatedAt: string;
}

export interface Deck {
  id: string;
  name: string;
  format: string;
  /** Which card game this deck is for ("mtg" | "cyberpunk"). */
  game: string;
  cards: DeckCard[];
  /** Scryfall id of the chosen header/cover card, when customized. */
  header?: string | null;
  /** The mat this deck brings to the table, overriding the player's global mat
   *  preference while they are seated with it. null = use the preference. */
  playmat?: string | null;
  /** The card back this deck's cards wear, same deal - its sleeves. */
  cardBack?: string | null;
}

export interface FriendEntry {
  userId: string;
  username: string;
  online: boolean;
  roomId?: string;
}

export interface FriendsPayload {
  friends: FriendEntry[];
  incoming: { id: string; from: { userId: string; username: string } }[];
  outgoing: { id: string; to: { userId: string; username: string } }[];
}

export interface UserHit {
  userId: string;
  username: string;
  online: boolean;
}

export interface RoomInfo {
  roomId: string;
  name: string;
  seats: number;
  players: { userId: string; username: string }[];
  started: boolean;
}

/** A room where the caller holds a seat (GET /api/rooms/mine). */
export interface MatchRow {
  name: string | null;
  format: string | null;
  game?: string;
  players: { username: string; isBot?: boolean }[];
  seats: number | null;
  playedAt: number;
  /** The room this match was played in (links to its persisted replay). */
  roomId?: string;
  matchId?: string | null;
  winnerUserId?: string | null;
  winnerUsername?: string | null;
  turns?: number | null;
  durationMs?: number | null;
  /** The caller's result in this match, when a finished-match record exists. */
  won?: boolean | null;
  conceded?: boolean | null;
  cardsPlayed?: number | null;
  cardsDrawn?: number | null;
  /** Whether a persisted timeline exists to watch the match play back. */
  replayable?: boolean;
}

/** GET /api/me/stats — the caller's all-time aggregates for the Home dashboard. */
export interface UserStats {
  wins: number;
  losses: number;
  played: number;
  endorsements: number;
  avgTurnMs: number;
  /** How salty this player's DECKS have felt to the tables they sat at (1-5);
   *  0 when nobody has rated one. Never a rating of the player. */
  salt: number;
  /** Distinct opponents who have rated any of their decks. */
  saltCount: number;
}

/** GET /api/me/decks/stats — one row per deck I have actually played. */
export interface MyDeckStats {
  deckId: string;
  name: string | null;
  wins: number;
  losses: number;
  played: number;
  lastPlayedAt: number | null;
  /** Average saltiness opponents rated this deck (1-5); 0 when unrated. */
  salt: number;
  saltCount: number;
  /** Endorsements earned while playing this deck - endorsements name a player,
   *  so this is "earned with", not "for the deck". */
  endorsements: number;
}

/** GET /api/decks/{id}/stats — a deck's all-time record + saltiness. */
export interface DeckStats {
  wins: number;
  losses: number;
  /** Average saltiness opponents rated this deck (1-5); 0 when unrated. */
  salt: number;
  /** How many distinct opponents have rated it. */
  saltCount: number;
}

export interface MyRoom {
  roomId: string;
  code: string;
  name: string;
  seats: number;
  persistent: boolean;
  started: boolean;
  game?: string;
  updatedAt: string;
  players: { userId: string; username: string; online: boolean }[];
}

/** A card instance on the table. */
export interface CardInst {
  iid: string;
  scryfallId?: string;
  name: string;
  imageUrl: string;
  tapped: boolean;
  faceDown: boolean;
  counters: Record<string, number>;
  x: number;
  y: number;
  isToken: boolean;
  power?: string;
  toughness?: string;
  attachedTo?: string;
  /** This attachment is a PILE member (squared up under its base and counted as
   *  one object) rather than an aura fanned out beside it. Only ever meaningful
   *  alongside `attachedTo`; the server never sends it without one. */
  piled?: boolean;
  isCommander?: boolean;
  revealed?: boolean;
  /** A double-faced card flipped to its back face; the client resolves the back
   *  art from the card's Scryfall faces. */
  transformed?: boolean;
}

/** A Cyberpunk Gig die: one of the six d4-d20 in the Fixer. `inGig` = rolled
 * into the player's Gig area (the count of those is the win tracker). */
export interface GigDie {
  sides: number;
  value: number;
  inGig: boolean;
  /** Stolen from a rival (lets your Gig count exceed six); carries its origin. */
  stolen?: boolean;
  from?: string;
}

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';
export type ManaPool = Record<ManaColor, number>;

export interface TablePlayer {
  commanderTax?: Record<string, number>;
  cmdDamageByCommander?: Record<string, number>;
  mulligan?: MulliganState | null;
  userId: string;
  username: string;
  /** Pregame state, public to every room viewer. */
  ready?: boolean;
  online?: boolean;
  /** The seat's chosen playmat id; the felt shows the active player's mat. */
  playmat?: string | null;
  /** Custom zone-pile placement (normalized 0..1 centers by logical zone).
   * Empty/absent = default strip layout. Synced via `matlayout.set` and
   * rendered on every viewer's copy of this player's board. */
  matLayout?: Partial<Record<MatZone, MatPos>>;
  /** The seat's chosen card-back id; every viewer paints THIS player's
   * face-down cards with it (so an opponent's board wears their own back). */
  cardBack?: string | null;
  /** Client-computed public deck metrics for the matchup splash (synced via
   * `deckmeta.set`, cleared on deck switch). */
  deckMeta?: DeckMeta | null;
  /** Cyberpunk Gig dice (the six d4-d20 in the Fixer); absent for other games. */
  gigDice?: GigDie[];
  /** The last single die this player rolled (any game) — drives the 3D dice on
   *  the mat. `seq` bumps every roll so a repeat value still animates. */
  lastRoll?: { seq: number; sides: number; value: number };
  seat: number;
  life: number;
  poison: number;
  /** Public floating mana; only this seat's player may update it. */
  mana?: ManaPool;
  cmdDamage: Record<string, number>;
  handCount: number;
  hand?: CardInst[];
  /** Cards individually revealed to the table (reveal.card); visible to
   * everyone even without a full hand reveal. */
  revealedHand?: CardInst[];
  libraryCount: number;
  battlefield: CardInst[];
  graveyard: CardInst[];
  exile: CardInst[];
  command: CardInst[];
  /** Out of the game: turn order skips them; last one standing wins. */
  conceded?: boolean;
  /** Name of the deck this seat was taken with (snapshotted at join). */
  deckName?: string | null;
  /** The deck id this seat plays (own seat only) - used to look up which tokens
   * the deck can produce. */
  deckId?: string | null;
}

/** One seat's line in a finished match (part of RoomState.matchResult). */
export interface MatchResultPlayer {
  userId: string;
  username: string;
  seat: number;
  isBot: boolean;
  conceded: boolean;
  turnsTaken: number;
  avgTurnMs: number;
  cardsPlayed: number;
  cardsDrawn: number;
  peakBattlefield: number;
  deckId?: string | null;
  deckName?: string | null;
  life: number;
}

/** Set once when one non-conceded player remains; never clears. */
export interface MatchResult {
  matchId: string;
  winnerUserId: string;
  winnerUsername: string;
  turns: number;
  durationMs: number;
  endedAt: number;
  /** Substantial multiplayer games feed all-time stats + endorse/salt;
   * instant concedes and bot-only games are decorative. */
  ranked: boolean;
  players: MatchResultPlayer[];
}

/** GET /api/matches/{id}/stats — one participant's aggregates. */
export interface MatchStatsPlayer {
  userId: string;
  username: string | null;
  seat: number;
  isBot: boolean;
  deckId: string | null;
  deckName: string | null;
  won: boolean;
  conceded: boolean;
  turnsTaken: number;
  avgTurnMs: number;
  cardsPlayed: number;
  cardsDrawn: number;
  peakBattlefield: number;
  wins: number;
  losses: number;
  endorsements: number;
  allTimeAvgTurnMs: number;
  deck: {
    wins: number;
    losses: number;
    salt: number;
    saltCount: number;
    avgCardsPerTurn: number;
    avgCardsDrawn: number;
    avgPeakBattlefield: number;
  } | null;
  myEndorsed: boolean;
  mySalt: number | null;
}

/** Host-configurable pre-game rules, negotiated in the lobby before the game
 * starts. The server fills unset (null) fields from format/game defaults. */
export interface GameSettings {
  /** Life every seat starts with; null for the format default (commander 40,
   * standard 20). Ignored for Cyberpunk. */
  startingLife?: number | null;
  /** Opening-hand size; null for the game default (MTG 7, Cyberpunk 6). */
  startingHand?: number | null;
  /** Free mulligans before hands shrink; null for the classic rule. */
  freeMulligans?: number | null;
  /** Mulligan freely and never bottom a card. Beats freeMulligans. */
  unlimitedMulligans?: boolean;
  /** "london" (draw full, bottom N) or "vancouver" (draw one fewer each time). */
  mulliganRule: 'london' | 'vancouver';
  /** Who takes the first turn: "auto" (lowest seat), "random", or "seat". */
  firstPlayer: 'auto' | 'random' | 'seat';
  /** The seat that goes first when firstPlayer is "seat". */
  firstSeat?: number | null;
  /** Force the starting player's first-draw skip; null for the classic rule. */
  skipFirstDraw?: boolean | null;
}

export interface RoomState {
  roomId: string;
  name: string;
  code: string;
  seats: number;
  started: boolean;
  hostUserId: string;
  players: TablePlayer[];
  spectators: { userId: string; username: string }[];
  /** Which card game this table plays ("mtg" | "cyberpunk"); drives zone labels,
   * vitals, phases, and card-art resolution. Absent on pre-multigame snapshots
   * (treat as "mtg"). */
  game?: string;
  // gameplay v2 (absent on pre-v2 snapshots). A format preset id ('commander',
  // 'brawl', 'standard', 'legacy', ...) - resolve rules via formatFor().
  format?: string;
  /** Host-configured pre-game rules; absent on pre-feature snapshots. */
  settings?: GameSettings;
  turnNumber?: number;
  activeSeat?: number;
  /** Lowest occupied seat at game start (turn order anchor). */
  startingSeat?: number;
  phase?: Phase;
  autoTurn?: boolean;
  stack?: CardInst[];
  combat?: CombatState | null;
  markers?: TableMarkers;
  matchResult?: MatchResult | null;
}

export type Zone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command';

/** Freeform table actions (client → server inside game.action). */
export type GameAction =
  | { kind: 'card.move'; iid: string; to: Zone; x?: number; y?: number; index?: number }
  | { kind: 'card.pos'; iid: string; x: number; y: number }
  | { kind: 'card.tap'; iid: string; tapped: boolean }
  | { kind: 'card.face'; iid: string; faceDown: boolean }
  | { kind: 'card.transform'; iid: string; transformed: boolean }
  | { kind: 'card.counter'; iid: string; counter: string; delta: number }
  | { kind: 'token.create'; name: string; imageUrl?: string; power?: string; toughness?: string; x: number; y: number }
  | { kind: 'token.clone'; iid: string; x: number; y: number }
  | { kind: 'draw'; count: number }
  | { kind: 'shuffle' }
  | { kind: 'mulligan' }
  | { kind: 'untap.all' }
  | { kind: 'life.set'; value: number }
  | { kind: 'life.add'; delta: number }
  | { kind: 'cmd.damage'; fromSeat: number; delta: number }
  | { kind: 'poison.add'; delta: number }
  | { kind: 'reveal.hand' }
  | { kind: 'reveal.card'; iid: string };

/** Server → client WebSocket messages. */
export type ServerMessage =
  | { type: 'welcome'; userId: string }
  | { type: 'presence'; userId: string; online: boolean; roomId?: string }
  | { type: 'invite'; from: { userId: string; username: string }; roomId: string; roomName: string }
  | { type: 'friend.request'; id: string; from: { userId: string; username: string } }
  | { type: 'friend.accepted'; by: { userId: string; username: string } }
  | { type: 'room.state'; state: RoomState }
  | {
      type: 'room.ping';
      from: { userId: string; username: string };
      to: { userId: string; username: string };
      ts: number;
      roomId: string;
    }
  | { type: 'room.hand.hover'; fromUserId: string; position: number | null; roomId: string }
  | { type: 'cursor'; fromUserId: string; username: string; seat: number; mat?: number | null; x: number; y: number; hover: string | null; roomId: string }
  | { type: 'room.event'; seq: number; actor: string; action: GameAction & Record<string, unknown>; roomId: string }
  | { type: 'chat'; from: { userId: string; username: string }; text: string; ts: number; roomId: string }
  | { type: 'log'; seq: number; text: string; ts: number; roomId: string }
  | { type: 'decks.changed' }
  | { type: 'room.closed'; roomId: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'cmd.choice'; iid: string; to: Zone; roomId: string }
  | { type: 'library.cards'; cards: CardInst[]; roomId: string }
  | { type: 'undo.state'; roomId: string; canUndo: boolean; canRedo: boolean; cursor: number; head: number; host: boolean }
  | { type: 'timeline'; roomId: string; entries: TimelineEntry[] }
  | { type: 'replay.frame'; roomId: string; index: number; head: number; state: RoomState };

// --- gameplay v2 (turns, phases, combat, tools) ---

export type Phase = 'upkeep' | 'main1' | 'attack' | 'block' | 'damage' | 'main2' | 'end';

/** A lightweight, informational overlay: who is attacking whom and which
 * creatures block which attackers. The server never resolves damage - players
 * inform each other and adjust life/creatures manually. */
export interface CombatState {
  attackers: { iid: string; defenderSeat?: number; power?: string; toughness?: string }[];
  blocks: { blockerIid: string; attackerIid: string; power?: string; toughness?: string }[];
}

/** One recorded move on the event timeline: who did it, its log label, when,
 * and the public face of the card it concerned (for a mini thumbnail). */
export interface TimelineEntry {
  ts: number;
  label: string;
  actor: string;
  card?: { name: string; imageUrl?: string | null; scryfallId?: string } | null;
}

export interface TableMarkers {
  monarch?: number;
  initiative?: number;
  dayNight?: 'day' | 'night' | null;
  storm?: number;
}

export interface MulliganState {
  state: 'deciding' | 'kept';
  taken: number;
}

export type GameActionV2 =
  | { kind: 'turn.pass' }
  | { kind: 'turn.set'; seat: number }
  | { kind: 'phase.set'; phase: Phase }
  | { kind: 'turn.auto'; enabled: boolean }
  | { kind: 'stack.push'; iid: string }
  | { kind: 'stack.resolve'; iid: string; to: Zone; x?: number; y?: number }
  | { kind: 'stack.counter'; iid: string; to: Zone }
  | { kind: 'combat.begin' }
  | { kind: 'combat.attack'; iid: string; defenderSeat?: number; power?: string; toughness?: string }
  | { kind: 'combat.block'; blockerIid: string; attackerIid: string; power?: string; toughness?: string }
  | { kind: 'combat.end' }
  | { kind: 'cmd.cast'; iid: string; x: number; y: number }
  | { kind: 'cmd.return'; iid: string; accept: boolean }
  | { kind: 'cmd.tax'; iid: string; delta: number }
  | { kind: 'dice.roll'; sides: 2 | 4 | 6 | 8 | 10 | 12 | 20; count?: number }
  | { kind: 'mana.add'; color: ManaColor; delta: number }
  | { kind: 'mana.clear' }
  | { kind: 'marker.set'; marker: 'monarch' | 'initiative'; seat: number }
  | { kind: 'marker.day'; value: 'day' | 'night' | null }
  | { kind: 'marker.storm'; delta: number }
  | { kind: 'library.play'; x: number; y: number }
  | { kind: 'gig.roll'; sides: number }
  | { kind: 'gig.return'; sides: number }
  | { kind: 'gig.steal'; from: string }
  | { kind: 'library.peek'; count: number }
  | { kind: 'library.reorder'; iids: string[] }
  | { kind: 'library.bottom'; iids: string[] }
  | { kind: 'library.search' }
  | { kind: 'library.reveal'; count: number }
  | { kind: 'card.attach'; iid: string; hostIid: string | null; piled?: boolean }
  | { kind: 'card.give'; iid: string; toUser: string }
  | { kind: 'mull.take' }
  | { kind: 'mull.keep'; bottomIids: string[] }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'rewindTo'; index: number }
  | { kind: 'concede' };
