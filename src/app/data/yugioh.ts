import startersData from '../../data/yugioh-starters.json' with { type: 'json' };
import { SERVER_URL } from '../net/api.ts';
import type { DeckCard } from '../net/types.ts';

/**
 * The Yu-Gi-Oh! TCG catalog (YGOPRODeck), the yugioh-game analogue of
 * cyberpunk.ts — with one structural difference forced by scale. The pool is
 * ~14,500 cards, so the catalog does NOT ship in the JS bundle: it lands in
 * public/cache/yugioh/catalog.json (written by scripts/sync-yugioh.mjs) and is
 * fetched lazily at runtime, the packs.ts pattern. Only the tiny starter-deck
 * manifest (ids + names) is a static import, which is what lets image
 * resolution and starter seeding work before — or without — the catalog.
 *
 * Card identity is the YGOPRODeck passcode as an unpadded decimal string
 * ("46986414"). It rides the protocol's `scryfallId` slot like cyberpunk's
 * Netdeck UUIDs do, and since no other game's ids are all-digits, a passcode
 * shape IS the game discriminator (see isYugiohId).
 *
 * Faces: YGOPRODeck forbids hotlinking its image CDN, so starter faces ship
 * bundled under public/cache/yugioh/cards/ and every other card is served by
 * our API's caching proxy (GET /api/ygo/img/{passcode}.jpg), which pulls from
 * the CDN once and re-hosts.
 */

export interface YugiohCard {
  id: string;
  name: string;
  /** API card type, e.g. "Effect Monster", "Spell Card", "XYZ Monster". */
  type: string;
  /** Frame, e.g. normal | effect | ritual | fusion | synchro | xyz | link |
   * *_pendulum | spell | trap | token | skill. */
  frameType: string;
  desc: string;
  /** Monster type (Dragon, Spellcaster, …) — or the Spell/Trap subtype
   * (Normal, Field, Counter, Quick-Play, …). */
  race: string | null;
  /** DARK | LIGHT | WATER | FIRE | EARTH | WIND | DIVINE; monsters only. */
  attribute?: string;
  atk?: number;
  /** Absent on Link monsters (they have no DEF). */
  def?: number;
  /** Level — or printed Rank for XYZ monsters. Absent on Links and backrow. */
  level?: number;
  linkval?: number;
  /** Pendulum scale. */
  scale?: number;
  archetype?: string;
}

export interface YugiohCatalog {
  game: string;
  source: string;
  fetchedAt: string;
  count: number;
  types: string[];
  races: string[];
  attributes: string[];
  cards: YugiohCard[];
}

const BASE = import.meta.env.BASE_URL;

const manifest = startersData as {
  starters: { id: string; name: string; cover: string; cards: { id: string; name: string; qty: number; board: string }[] }[];
  bundledIds: string[];
};

/** Starter-deck faces bundled under public/cache/yugioh/cards/. */
const BUNDLED_IDS = new Set<string>(manifest.bundledIds);

/** A YGOPRODeck passcode: all digits. Scryfall/Netdeck UUIDs and `pc-` alt-art
 * ids never are, so this recognizes a Yu-Gi-Oh card id on its own — the
 * synchronous game check popups and hovers need before any catalog loads. */
export function isYugiohId(id: string | undefined): boolean {
  return !!id && /^\d{1,10}$/.test(id);
}

/** The rendered card face for a passcode: bundled cache, else our API's
 * caching image proxy. A pure URL scheme — never '' for a plausible id — so
 * faces render without the catalog in memory (the MTG cardImage philosophy,
 * not cyberpunkImage's known-ids-only one). */
export function yugiohImage(id: string | undefined): string {
  if (!id || !isYugiohId(id)) return '';
  if (BUNDLED_IDS.has(id)) return `${BASE}cache/yugioh/cards/${id}.jpg`;
  return `${SERVER_URL}/api/ygo/img/${id}.jpg`;
}

// --- lazy catalog ---------------------------------------------------------

let catalogPromise: Promise<YugiohCatalog> | null = null;
const BY_ID = new Map<string, YugiohCard>();

/** The full card catalog, fetched once per session (~1.2MB gzipped). Failures
 * clear the cache so a later attempt can still succeed. */
export function loadYugiohCatalog(): Promise<YugiohCatalog> {
  catalogPromise ??= fetch(`${BASE}cache/yugioh/catalog.json`, { headers: { Accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) throw new Error(`yugioh catalog ${response.status}`);
      const catalog = (await response.json()) as YugiohCatalog;
      for (const card of catalog.cards) BY_ID.set(card.id, card);
      return catalog;
    })
    .catch((error: unknown) => {
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
}

/** Kick the catalog load off in the background (deck editor mount, table join). */
export function primeYugiohCatalog(): void {
  void loadYugiohCatalog().catch(() => {});
}

/** Synchronous catalog lookup — undefined until loadYugiohCatalog resolves. */
export function yugiohCard(id: string | undefined): YugiohCard | undefined {
  return id ? BY_ID.get(id) : undefined;
}

// --- card reading ---------------------------------------------------------

/** Frames whose monsters live in the Extra Deck. Careful traps: 'ritual' and
 * the plain pendulum frames (normal/effect/ritual_pendulum) are MAIN deck. */
const EXTRA_FRAMES = new Set([
  'fusion',
  'synchro',
  'xyz',
  'link',
  'fusion_pendulum',
  'synchro_pendulum',
  'xyz_pendulum',
]);

export function isExtraDeckCard(card: Pick<YugiohCard, 'frameType'>): boolean {
  return EXTRA_FRAMES.has(card.frameType);
}

export type YugiohKind = 'monster' | 'spell' | 'trap';

export function yugiohKind(card: Pick<YugiohCard, 'frameType'>): YugiohKind {
  if (card.frameType === 'spell') return 'spell';
  if (card.frameType === 'trap') return 'trap';
  return 'monster';
}

/** A Trap, by id. Traps can never be activated from the hand — they are Set —
 *  so the table sets one automatically when it is played. Answers false until
 *  the catalog loads, which only costs the automatic flip, never correctness. */
export function isYugiohTrap(id: string | undefined): boolean {
  const card = yugiohCard(id);
  return card?.frameType === 'trap';
}

/** A Field Spell, by id: it belongs in the Field Zone, not the backrow. */
export function isYugiohFieldSpell(id: string | undefined): boolean {
  const card = yugiohCard(id);
  return card?.frameType === 'spell' && card.race === 'Field';
}

/** A printed stat, mapping YGOPRODeck's -1 sentinel back to the '?' it means. */
export function yugiohStat(value: number | undefined): string {
  if (value == null) return '0';
  return value < 0 ? '?' : String(value);
}

/** "2500 / 2100" (Links: "2300 / LINK-3"); '' for spells/traps. */
export function yugiohStatLine(card: YugiohCard): string {
  if (yugiohKind(card) !== 'monster') return '';
  const atk = yugiohStat(card.atk);
  if (card.frameType.startsWith('link')) return `${atk} / LINK-${card.linkval ?? 0}`;
  return `${atk} / ${yugiohStat(card.def)}`;
}

/** Attribute accents, mirroring the printed attribute icons. */
export const YUGIOH_ATTRIBUTE_HEX: Record<string, string> = {
  DARK: '#8e5bd6',
  LIGHT: '#e3c34c',
  WATER: '#3f9ce2',
  FIRE: '#e2465b',
  EARTH: '#a07850',
  WIND: '#3fca7a',
  DIVINE: '#d99123',
};

// --- decks ----------------------------------------------------------------

/** A card as the protocol's deck-list entry. Extra Deck monsters ride the
 * 'commander' board (the games.ts anchor slot, like cyberpunk Legends), which
 * the server deals into the command zone — the Extra Deck pile. */
export function yugiohDeckCard(card: YugiohCard, quantity = 1): DeckCard {
  return {
    scryfallId: card.id,
    name: card.name,
    quantity,
    board: isExtraDeckCard(card) ? 'commander' : 'main',
  };
}

export interface YugiohStarter {
  id: string;
  name: string;
  /** Cover card passcode (always bundled), for tiles and deck art. */
  cover: string;
  cards: DeckCard[];
}

/**
 * The bundled starter decks (classic Blue-Eyes and Dark Magician builds,
 * resolved to live passcodes by scripts/sync-yugioh.mjs). Seeded on first
 * sign-in and shown on the Browse/Home shelves, like cyberpunkStarters().
 */
export function yugiohStarters(): YugiohStarter[] {
  return manifest.starters.map((starter) => ({
    id: starter.id,
    name: starter.name,
    cover: starter.cover,
    cards: starter.cards.map((card) => ({
      scryfallId: card.id,
      name: card.name,
      quantity: card.qty,
      board: (card.board === 'commander' ? 'commander' : card.board === 'side' ? 'side' : 'main') as DeckCard['board'],
    })),
  }));
}

