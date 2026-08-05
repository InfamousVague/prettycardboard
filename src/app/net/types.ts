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
 * MTG decks fill colors/avgMv/type counts; Cyberpunk fills ram/avgCost;
 * Yu-Gi-Oh fills monsters/traps/extra/avgAtk (spells is shared). */
export interface DeckMeta {
  size: number;
  /** The deck's cover card id, so every seat at the table can show the deck's
   *  artwork - decks themselves are never public, but their face is. */
  cover?: string;
  colors?: string[];
  avgMv?: number;
  /** Nonland counts by mana value, index 0..7 with 7 meaning "7 or more".
   *  An aggregate like every other field here - it shapes a curve, it does
   *  not name a card. */
  curve?: number[];
  creatures?: number;
  lands?: number;
  spells?: number;
  other?: number;
  ram?: number;
  avgCost?: number;
  monsters?: number;
  traps?: number;
  extra?: number;
  avgAtk?: number;
}

export interface DeckCard {
  scryfallId: string;
  name: string;
  quantity: number;
  board: Board;
}

/** A deck's estimated Commander bracket: the 2-4 range a card list can actually
 *  prove, plus the Game Changers behind it. Derived identically on both sides -
 *  server/src/brackets.rs and src/app/data/brackets.ts read one shared Game
 *  Changers list (src/data/gamechangers.json), so the two can never disagree. */
export interface BracketEstimate {
  /** 2 | 3 | 4 - the detectable range; 1 and 5 are social calls a list can't make. */
  bracket: 2 | 3 | 4;
  /** The Game Changer card names found in the deck. */
  gameChangers: string[];
}

export interface DeckSummary {
  id: string;
  name: string;
  format: string;
  /** Which card game this deck is for ("mtg" | "cyberpunk" | "yugioh"). */
  game: string;
  commander: string;
  cardCount: number;
  /** Bracket estimated server-side (it already holds the cards, and shipping
   *  every deck's full list just to count names would bloat this payload).
   *  null wherever brackets don't apply: Cyberpunk, non-Commander formats. */
  bracket?: BracketEstimate | null;
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
  /** Which card game this deck is for ("mtg" | "cyberpunk" | "yugioh"). */
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
  /** Competitive standing, sent with the roster so the friends page can show
   *  a rank without opening eight profiles. `position` is null for anyone who
   *  has never finished a ranked match - they are not on the ladder. */
  rating?: number;
  position?: number | null;
  wins?: number;
  losses?: number;
  played?: number;
  endorsements?: number;
}

/** One row of the Archidekt deck picker (GET /api/decks/search/archidekt).
 *  Reshaped server-side, so the client never sees Archidekt's own schema. */
export interface ArchidektHit {
  id: string;
  name: string;
  size: number;
  owner?: string | null;
  format?: number | null;
  updatedAt?: string | null;
  featured?: string | null;
}

/** One row of the global ladder (GET /api/leaderboard). */
export interface LadderEntry {
  position: number;
  userId: string;
  username: string;
  rating: number;
  wins: number;
  losses: number;
  played: number;
  endorsements: number;
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
  /** Which card game the table plays; pick a deck for THIS, not for whatever
   *  game the joiner's own form happened to be showing. */
  game?: string;
  /** The table's format. 'draft' means seats are filled by drafting a deck at
   *  the table, so an invitee is NOT asked to bring one. */
  format?: string | null;
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
  /** Competitive ladder rating; feeds divisionFor() in data/rankTiers.ts. Only
   *  ranked multiplayer results move it, so bot practice never grades a player.
   *  Absent from a server that predates the column - treat as the seed. */
  rating?: number;
  /** 1-based place on the global ladder; null when this player has never
   *  finished a ranked match and so is not on it. */
  position?: number | null;
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
  /** Whose table it is. Only the host can end it for everyone. */
  host: string;
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
  /** Stack entries: the permanent this spell is pointed at. */
  targetIid?: string;
  revealed?: boolean;
  /** A double-faced card flipped to its back face; the client resolves the back
   *  art from the card's Scryfall faces. */
  transformed?: boolean;
  /** Turn round this card entered the battlefield (summoning sickness). */
  enteredTurn?: number;
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
   * the deck can produce. A `precon:<code>` id is one the TABLE dealt in
   * quickplay rather than one the player owns; it resolves to no stored deck. */
  deckId?: string | null;
  /** Quickplay rerolls this seat has spent, counted by the server. */
  quickplayRolls?: number;
  /** A server-driven AI opponent (seated via `bot.add`). */
  isBot?: boolean;
  /** Lands this seat has played in the current turn round (enforced rooms
   * gate the drop; the coach reads it too). */
  landsThisTurn?: number;
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
  /** Life every seat starts with; null for the game/format default (commander
   * 40, standard 20, Yu-Gi-Oh 8000). Ignored for Cyberpunk. */
  startingLife?: number | null;
  /** Opening-hand size; null for the game default (MTG 7, Cyberpunk 6,
   * Yu-Gi-Oh 5). */
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
  /** Arena-lite rules enforcement for this table (MTG only): real costs,
   * land drops, summoning sickness, legal combat, previewed damage. */
  enforced?: boolean;
  /** Quickplay: nobody brings a deck. Every seat is dealt one of the bundled
   * precons on arrival and may reroll it up to MAX_QUICKPLAY_ROLLS times before
   * the game starts. A table you can sit down at with an empty collection. */
  quickplay?: boolean;
  /** Competitive table. Nothing sets this yet - ranked play does not exist -
   * but the affordances that leak public-but-advantageous information (the
   * opponent deck-stats hover) already read it, so switching ranked on later
   * closes them without hunting for call sites. */
  ranked?: boolean;
}

/** One card in a draft pack or pool. */
export interface DraftCard {
  /** Scryfall id, which is also what a deck list stores. */
  id: string;
  name: string;
  rarity: string;
  foil: boolean;
  /** WUBRG letters joined ('WU'); empty for colorless and lands. */
  colors: string;
  typeLine: string;
  /** Collector number. */
  cn: string;
}

/**
 * One drafter, as everyone else sees them.
 *
 * `pack` and `pool` arrive for YOUR seat only - the server filters them out of
 * everyone else's snapshot, so a draft cannot be read off the wire. The counts
 * are public because the table needs to know who is still thinking.
 */
export interface DraftSeat {
  userId: string;
  picked: boolean;
  built: boolean;
  packCount: number;
  poolCount: number;
  pack?: DraftCard[];
  pool?: DraftCard[];
}

/**
 * How a limited pool is opened.
 *
 * 'draft' passes packs round the table a card at a time; 'sealed' hands every
 * player their whole allocation at once. Sealed therefore has no picking phase
 * at all - the state arrives already in 'building'.
 */
export type LimitedMode = 'draft' | 'sealed';

/** A limited pool being opened in front of the pre-game lobby. */
export interface DraftState {
  set: string;
  setName: string;
  mode: LimitedMode;
  /** Packs per player. */
  rounds: number;
  phase: 'picking' | 'building' | 'done';
  /** 1-based pack number. */
  round: number;
  /** 1-based pick within the round. */
  pick: number;
  /** Unix ms this pick lapses and is taken automatically; 0 = untimed.
   *  In the building phase this is the build clock's deadline instead. */
  deadlineMs: number;
  /** Always 0 for sealed: there are no picks to put a clock on. */
  pickSeconds: number;
  /** Seconds allowed for deckbuilding; 0 = untimed. */
  buildSeconds: number;
  /** Seats cannot swap in an outside deck once they have built. */
  lockDecks: boolean;
  seats: DraftSeat[];
}

/* Moved here from the game store: it is a protocol shape now - it arrives on
   `room.state` as well as the live `chat` frame. The store re-exports it, so
   every existing import site is unchanged. */
export interface ChatLine {
  from: { userId: string; username: string };
  text: string;
  ts: number;
  /**
   * Set when the line is a card someone opened rather than something they
   * typed. The server already relays notable pulls to the whole table; folding
   * them into the chat transcript is what makes a pack opened next to your
   * friends feel shared instead of private. `text` still carries the card name
   * so anything that only knows how to render plain lines stays readable.
   */
  pull?: {
    scryfallId: string;
    name: string;
    setCode: string;
    rarity: string;
    foil: boolean;
  };
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
  /** The table's conversation so far, oldest first. Kept on the room by the
   *  server, so a reconnect or a late join arrives with the transcript rather
   *  than an empty pane. Absent on snapshots from a server that predates it. */
  chat?: ChatLine[];
  /** Which card game this table plays ("mtg" | "cyberpunk" | "yugioh"); drives zone labels,
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
  /** Enforced rooms: seats that passed priority on the current stack. */
  stackPassed?: number[];
  /** Enforced rooms: fired triggered abilities awaiting their controller. */
  pendingTriggers?: PendingTrigger[];
  /** Enforced rooms: owed discards awaiting a choice of cards (rules pass D). */
  pendingDiscards?: PendingDiscard[];
  pendingSacrifices?: PendingSacrifice[];
  /** Enforced rooms: the open end-step response window's deadline (unix ms).
   * Present while the active player waits for the table to pass. */
  endWindow?: number | null;
  /** Table markers parked on cards, by card iid. Fully public. */
  marks?: Record<string, CardMarkState>;
  combat?: CombatState | null;
  markers?: TableMarkers;
  matchResult?: MatchResult | null;
  /** A booster draft in progress; null on every ordinary table. */
  draft?: DraftState | null;
}

export type Zone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command';

/** A table marker parked on a card, carrying who placed it (the client colours
 *  the puck by that seat). Lives in room state, so it survives reconnects and
 *  every spectator sees it. */
export interface CardMarkState {
  kind: string;
  by: string;
  seat: number;
  username: string;
  ts: number;
}

/** One parsed trigger effect (enforced rooms; see PROTOCOL.md pass A). */
export type TriggerEffect =
  | { kind: 'draw'; n: number }
  | { kind: 'gainLife'; n: number }
  | { kind: 'loseLife'; n: number }
  | { kind: 'eachOpponentLoses'; n: number }
  | { kind: 'selfCounters'; counter: string; n: number }
  | { kind: 'token'; name: string; power: number; toughness: number; count: number; tapped: boolean }
  | { kind: 'discard'; n: number; random: boolean }
  | { kind: 'eachOpponentDiscards'; n: number; random: boolean }
  | { kind: 'scry'; n: number }
  | { kind: 'mill'; n: number }
  | { kind: 'manual' };

/** A fired triggered ability waiting on its controller (fully public). */
export interface PendingTrigger {
  id: string;
  owner: string;
  seat: number;
  sourceIid: string;
  /** What set this off - the card that entered or the spell that was cast.
   *  Absent for turn-structure triggers, which have no single cause. */
  cause?: string;
  sourceName: string;
  when:
    | 'etb'
    | 'dies'
    | 'attacks'
    | 'upkeep'
    | 'endStep'
    | 'dealsPlayerDamage'
    | 'activated'
    | 'youDraw'
    | 'opponentDraws'
    | 'landEtb'
    | 'creatureEtb'
    | 'creatureDies'
    | 'youAttack'
    | 'combatStart'
    | 'eachUpkeep'
    | 'castSpell'
    | 'castCreatureSpell'
    | 'castNoncreatureSpell'
    | 'castInstantOrSorcery';
  effects: TriggerEffect[];
  text: string;
  /** True = the engine can apply the parsed effects itself. */
  auto: boolean;
  deadline: number;
}

/** An owed discard waiting on its owner's choice of cards (fully public;
 *  the chosen cards are named in the log like any tabletop discard). It
 *  lapses into a random discard at `deadline`. */
export interface PendingDiscard {
  id: string;
  owner: string;
  seat: number;
  n: number;
  sourceName: string;
  /** The spell still on the stack beneath the one that forced this, when
   *  there is one - "in response to X" in the eventual log line. */
  inResponseTo?: string | null;
  random: boolean;
  deadline: number;
}

/** An owed sacrifice (Grave Pact, Dictate of Erebos, an edict): pick `n`
 *  creatures you control, or let the engine take the least valuable. Lapses
 *  at the server's deadline the same way a discard does. */
export interface PendingSacrifice {
  id: string;
  owner: string;
  seat: number;
  n: number;
  sourceName: string;
  inResponseTo?: string;
  deadline: number;
}

/** Freeform table actions (client → server inside game.action). */
export type GameAction =
  /** `faceDown` lands the card hidden in the same act (a Yu-Gi-Oh Set) —
   *  moving face-up and flipping afterwards would broadcast its identity. */
  | { kind: 'card.move'; iid: string; to: Zone; x?: number; y?: number; index?: number; faceDown?: boolean }
  | { kind: 'card.pos'; iid: string; x: number; y: number }
  | { kind: 'card.tap'; iid: string; tapped: boolean; mana?: string }
  | { kind: 'card.face'; iid: string; faceDown: boolean }
  | { kind: 'card.transform'; iid: string; transformed: boolean }
  | { kind: 'card.counter'; iid: string; counter: string; delta: number }
  | { kind: 'token.create'; name: string; typeLine?: string; imageUrl?: string; power?: string; toughness?: string; x: number; y: number }
  | { kind: 'token.clone'; iid: string; x: number; y: number }
  | { kind: 'draw'; count: number }
  | { kind: 'shuffle' }
  | { kind: 'mulligan' }
  | { kind: 'untap.all' }
  | { kind: 'life.set'; value: number }
  | { kind: 'life.add'; delta: number }
  | { kind: 'life.deal'; seat: number; delta: number }
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
  | {
      /** Someone at this table opened something worth cheering (mythic, an
       *  old-frame rare, or a foil rare+) in the pack dock. */
      type: 'pull';
      fromUserId: string;
      username: string;
      seat: number | null;
      scryfallId: string;
      name: string;
      setCode: string;
      rarity: string;
      foil: boolean;
      ts: number;
      roomId: string;
    }
  | { type: 'log'; seq: number; text: string; ts: number; roomId: string }
  | {
      type: 'aim';
      fromUserId: string;
      username: string;
      /** The pointer's seat, so the arrow can wear that seat's colour. */
      fromSeat?: number | null;
      fromIid?: string | null;
      toIid?: string | null;
      toSeat?: number | null;
      kind?: string | null;
      /** Enforced rooms: the target's printed ward cost, if it has one. */
      ward?: string | null;
      ts: number;
      roomId: string;
    }
  // Private rules advice, sent only to the player who made the move and only
  // while they have the coach turned on. Advisory - the move already happened.
  | { type: 'coach'; rule: string; text: string; ts: number }
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
  attackers: {
    iid: string;
    defenderSeat?: number;
    /** The defending card being battled. Yu-Gi-Oh names its target on the
     * attack declaration; Magic leaves this unset and answers with blocks. */
    targetIid?: string;
    power?: string;
    toughness?: string;
  }[];
  blocks: { blockerIid: string; attackerIid: string; power?: string; toughness?: string }[];
  /** Enforced rooms: attackers are final; blocks may be declared. */
  locked?: boolean;
  /** Enforced rooms: blocks are final; `preview` awaits combat.resolve. */
  blocksReady?: boolean;
  preview?: CombatPreview | null;
}

/** The engine's computed combat outcome (enforced rooms), shown before the
 * active player applies it with combat.resolve. */
export interface CombatPreview {
  rows: PreviewRow[];
  /** Life change per seat (negative = damage taken), lifelink included. */
  life: Record<string, number>;
  /** Commander damage dealt: [defending seat, commander iid, amount]. */
  commander?: [number, string, number][];
}

export interface PreviewRow {
  attackerIid: string;
  attackerName: string;
  defenderSeat: number;
  playerDamage: number;
  attackerDies: boolean;
  deadBlockers: string[];
  deadBlockerNames: string[];
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
  | { kind: 'combat.attack'; iid: string; defenderSeat?: number; targetIid?: string; power?: string; toughness?: string }
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
  /** Park a table marker on a card; `mark: null` lifts it. */
  | { kind: 'mark.set'; iid: string; mark: string | null }
  | { kind: 'mark.clear' }
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
  // Enforced rooms only (see PROTOCOL.md Enforced addendum):
  | { kind: 'cast'; iid: string; payment?: string[]; x?: number; y?: number }
  | { kind: 'combat.lock' }
  | { kind: 'combat.ready' }
  | { kind: 'combat.resolve' }
  | { kind: 'stack.pass' }
  | { kind: 'stack.target'; iid: string; targetIid: string | null }
  | { kind: 'trigger.answer'; id: string; apply: boolean }
  /** Answer an owed discard: exactly `n` distinct in-hand iids, or `[]` to
   *  let the engine choose (highest mana value first). */
  | { kind: 'discard.resolve'; id: string; iids: string[] }
  | { kind: 'sacrifice.resolve'; id: string; iids: string[] }
  /** Activate a planeswalker's parsed loyalty ability by index (enforced
   *  rooms): the server moves the counter and queues the ability's text. */
  | { kind: 'loyalty.activate'; iid: string; index: number }
  | { kind: 'cascade'; n: number }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'rewindTo'; index: number }
  | { kind: 'concede' };
