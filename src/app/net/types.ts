/** Shared client-side types for the PrettyCardboard protocol (see PROTOCOL.md). */

export interface Identity {
  userId: string;
  username: string;
  token: string;
}

export type Board = 'commander' | 'main' | 'side';

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
  commander: string;
  cardCount: number;
  coverImageUrl: string;
  updatedAt: string;
}

export interface Deck {
  id: string;
  name: string;
  format: string;
  cards: DeckCard[];
  /** Scryfall id of the chosen header/cover card, when customized. */
  header?: string | null;
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
  players: { username: string; isBot?: boolean }[];
  seats: number | null;
  playedAt: number;
}

export interface MyRoom {
  roomId: string;
  code: string;
  name: string;
  seats: number;
  persistent: boolean;
  started: boolean;
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
  isCommander?: boolean;
  revealed?: boolean;
}

export interface TablePlayer {
  commanderTax?: Record<string, number>;
  cmdDamageByCommander?: Record<string, number>;
  mulligan?: MulliganState | null;
  userId: string;
  username: string;
  /** Server-driven AI opponent (heuristic bot). */
  isBot?: boolean;
  /** The seat's chosen playmat id; the felt shows the active player's mat. */
  playmat?: string | null;
  seat: number;
  life: number;
  poison: number;
  cmdDamage: Record<string, number>;
  handCount: number;
  hand?: CardInst[];
  libraryCount: number;
  battlefield: CardInst[];
  graveyard: CardInst[];
  exile: CardInst[];
  command: CardInst[];
  /** Out of the game: turn order skips them; last one standing wins. */
  conceded?: boolean;
  /** Name of the deck this seat was taken with (snapshotted at join). */
  deckName?: string | null;
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
  wins: number;
  losses: number;
  endorsements: number;
  allTimeAvgTurnMs: number;
  deck: { wins: number; losses: number; salt: number; saltCount: number } | null;
  myEndorsed: boolean;
  mySalt: number | null;
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
  // gameplay v2 (absent on pre-v2 snapshots)
  format?: 'commander' | 'standard';
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
  | { kind: 'reveal.hand' };

/** Server → client WebSocket messages. */
export type ServerMessage =
  | { type: 'welcome'; userId: string }
  | { type: 'presence'; userId: string; online: boolean; roomId?: string }
  | { type: 'invite'; from: { userId: string; username: string }; roomId: string; roomName: string }
  | { type: 'friend.request'; id: string; from: { userId: string; username: string } }
  | { type: 'friend.accepted'; by: { userId: string; username: string } }
  | { type: 'room.state'; state: RoomState }
  | { type: 'room.event'; seq: number; actor: string; action: GameAction & Record<string, unknown> }
  | { type: 'chat'; from: { userId: string; username: string }; text: string; ts: number }
  | { type: 'log'; seq: number; text: string; ts: number }
  | { type: 'decks.changed' }
  | { type: 'room.closed'; roomId: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'cmd.choice'; iid: string; to: Zone }
  | { type: 'library.cards'; cards: CardInst[] }
  | ({ type: 'combat.results' } & CombatResults);

// --- gameplay v2 (turns, phases, combat, tools) ---

export type Phase = 'upkeep' | 'main1' | 'attack' | 'block' | 'damage' | 'main2' | 'end';

export interface CombatState {
  attackers: { iid: string; defenderSeat?: number; power?: string; toughness?: string }[];
  blocks: { blockerIid: string; attackerIid: string; power?: string; toughness?: string }[];
  /** Combat v3: attackers are locked in; defenders are responding. */
  locked?: boolean;
  /** Seats of targeted defenders who declared themselves done. */
  ready?: number[];
  /** Seats that prevented all combat damage this combat (fog effects). */
  prevent?: number[];
}

/** One attacker's line in a resolved locked combat (combat.results). */
export interface CombatResultEntry {
  attackerIid: string;
  name: string;
  defenderSeat?: number;
  prevented: boolean;
  blockers: { iid: string; name: string; died: boolean }[];
  attackerDied: boolean;
  damageToDefender: number;
}

export interface CombatResults {
  attackerSeat: number;
  entries: CombatResultEntry[];
  totalBySeat: Record<string, number>;
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
  | { kind: 'combat.lock' }
  | { kind: 'combat.ready'; prevent?: boolean }
  | { kind: 'combat.end' }
  | { kind: 'cmd.cast'; iid: string; x: number; y: number }
  | { kind: 'cmd.return'; iid: string; accept: boolean }
  | { kind: 'dice.roll'; sides: 6 | 20 | 2; count?: number }
  | { kind: 'marker.set'; marker: 'monarch' | 'initiative'; seat: number }
  | { kind: 'marker.day'; value: 'day' | 'night' | null }
  | { kind: 'marker.storm'; delta: number }
  | { kind: 'library.peek'; count: number }
  | { kind: 'library.reorder'; iids: string[] }
  | { kind: 'library.bottom'; iids: string[] }
  | { kind: 'library.search' }
  | { kind: 'library.reveal'; count: number }
  | { kind: 'card.attach'; iid: string; hostIid: string | null }
  | { kind: 'mull.take' }
  | { kind: 'mull.keep'; bottomIids: string[] }
  | { kind: 'undo' }
  | { kind: 'concede' };
