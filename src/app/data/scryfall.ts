import { PRECONS } from './precons.ts';

/**
 * Scryfall client + the app's known-card metadata registry.
 *
 * The registry is deliberately client-side and ephemeral: the server stores
 * only `{scryfallId, name, quantity, board}`, so everything richer - type
 * lines, mana costs, color identity - is learned opportunistically from the
 * bundled precons and from any Scryfall payload that passes through (search
 * results, collection lookups) and kept in a module-level Map. Features that
 * need metadata (grouping, curve, identity validation) simply skip cards the
 * session has not seen yet.
 *
 * Etiquette: searches are debounced by the caller and cached here per query;
 * collection lookups batch 75 identifiers with a 100ms gap between batches.
 * (Browsers cannot set a custom User-Agent, so none is attempted.)
 */

const API = 'https://api.scryfall.com';

/** The slice of a Scryfall card object the deck builder consumes. */
export interface ScryCard {
  id: string;
  name: string;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  color_identity?: string[];
  card_faces?: { name?: string; type_line?: string; mana_cost?: string }[];
}

/** Normalized metadata for a card the session has seen. */
export interface CardMeta {
  id: string;
  name: string;
  typeLine: string;
  manaCost: string;
  manaValue: number;
  colorIdentity: string[];
}

// --- known-card registry ---

const KNOWN = new Map<string, CardMeta>();

// The bundled precons are known from the start - no network needed to group
// or validate the decks every account begins with.
for (const precon of PRECONS) {
  for (const card of precon.cards) {
    KNOWN.set(card.id, {
      id: card.id,
      name: card.name,
      typeLine: card.typeLine,
      manaCost: card.manaCost,
      manaValue: card.manaValue,
      colorIdentity: card.colorIdentity,
    });
  }
}

export function getCardMeta(scryfallId: string): CardMeta | undefined {
  return KNOWN.get(scryfallId);
}

/** Carry a card's known metadata onto another printing of it (artwork swaps). */
export function aliasCardMeta(fromId: string, toId: string): void {
  const meta = KNOWN.get(fromId);
  if (meta && !KNOWN.has(toId)) KNOWN.set(toId, { ...meta, id: toId });
}

/** Fold a Scryfall payload into the registry (front face for DFCs). */
export function rememberCard(card: ScryCard): CardMeta {
  const face = card.card_faces?.[0];
  const meta: CardMeta = {
    id: card.id,
    name: card.name,
    typeLine: card.type_line ?? face?.type_line ?? '',
    manaCost: card.mana_cost ?? face?.mana_cost ?? '',
    manaValue: typeof card.cmc === 'number' ? card.cmc : 0,
    colorIdentity: Array.isArray(card.color_identity) ? card.color_identity : [],
  };
  KNOWN.set(card.id, meta);
  return meta;
}

/** A card that may legally lead a Commander deck (legendary creature). */
export function canBeCommander(meta: CardMeta | undefined): boolean {
  if (!meta) return false;
  const front = meta.typeLine.split(' // ')[0] ?? meta.typeLine;
  return /\bLegendary\b/.test(front) && /\bCreature\b/.test(front);
}

// --- search ---

function isScryCard(value: unknown): value is ScryCard {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { name?: unknown }).name === 'string'
  );
}

const searchCache = new Map<string, ScryCard[]>();

/**
 * Full-text card search, name-ordered, capped at 20 results. A 404 is "no
 * matches" (Scryfall's convention), not an error. Results are cached per
 * normalized query for the session and folded into the metadata registry.
 */
export async function searchCards(query: string): Promise<ScryCard[]> {
  const key = query.trim().toLowerCase();
  if (!key) return [];
  const cached = searchCache.get(key);
  if (cached) return cached;

  const response = await fetch(`${API}/cards/search?order=name&q=${encodeURIComponent(query)}`);
  if (response.status === 404) {
    searchCache.set(key, []);
    return [];
  }
  if (!response.ok) throw new Error(`Scryfall search failed (${response.status})`);
  const body = (await response.json()) as { data?: unknown };
  const cards = (Array.isArray(body.data) ? body.data : []).filter(isScryCard).slice(0, 20);
  for (const card of cards) rememberCard(card);
  searchCache.set(key, cards);
  return cards;
}

// --- collection (name → card) resolution ---

export interface ResolvedCollection {
  found: ScryCard[];
  /** Names Scryfall did not recognize, in the order submitted. */
  notFound: string[];
}

const BATCH = 75;
const BATCH_GAP_MS = 100;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolve exact card names to full card objects via POST /cards/collection,
 * batched 75 at a time with a polite gap between batches.
 */
export async function resolveNames(names: string[]): Promise<ResolvedCollection> {
  const found: ScryCard[] = [];
  const notFound: string[] = [];

  for (let start = 0; start < names.length; start += BATCH) {
    if (start > 0) await wait(BATCH_GAP_MS);
    const slice = names.slice(start, start + BATCH);
    const response = await fetch(`${API}/cards/collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: slice.map((name) => ({ name })) }),
    });
    if (!response.ok) throw new Error(`Scryfall collection lookup failed (${response.status})`);
    const body = (await response.json()) as { data?: unknown; not_found?: unknown };
    for (const card of Array.isArray(body.data) ? body.data : []) {
      if (isScryCard(card)) {
        rememberCard(card);
        found.push(card);
      }
    }
    for (const miss of Array.isArray(body.not_found) ? body.not_found : []) {
      const name = (miss as { name?: unknown }).name;
      if (typeof name === 'string') notFound.push(name);
    }
  }

  return { found, notFound };
}

/** A decklist entry that may name a specific printing. */
export interface PrintingRequest {
  name: string;
  set?: string;
  collector?: string;
}

/**
 * Resolve entries to Scryfall cards, honoring the exact printing (set +
 * collector number) when the line carried one - this is how imported decks
 * keep the art the author chose (Secret Lair drops, alternate printings).
 * Entries without a printing hint resolve by name to the default printing.
 * Returns cards keyed positionally-agnostic: the caller matches on the same
 * (set, collector) or name it sent.
 */
export async function resolvePrintings(
  entries: PrintingRequest[],
): Promise<{ bySet: Map<string, ScryCard>; byName: Map<string, ScryCard>; notFound: string[] }> {
  const bySet = new Map<string, ScryCard>();
  const byName = new Map<string, ScryCard>();
  const notFound: string[] = [];
  // One identifier per entry, deduped: {set, collector_number} when present, else {name}.
  type Ident = { set: string; collector_number: string } | { name: string };
  const idents: Ident[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.set && entry.collector) {
      const key = `s:${entry.set}/${entry.collector}`;
      if (!seen.has(key)) {
        seen.add(key);
        idents.push({ set: entry.set, collector_number: entry.collector });
      }
    } else {
      const key = `n:${entry.name.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        idents.push({ name: entry.name });
      }
    }
  }

  for (let start = 0; start < idents.length; start += BATCH) {
    if (start > 0) await wait(BATCH_GAP_MS);
    const slice = idents.slice(start, start + BATCH);
    const response = await fetch(`${API}/cards/collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: slice }),
    });
    if (!response.ok) throw new Error(`Scryfall collection lookup failed (${response.status})`);
    const body = (await response.json()) as { data?: unknown; not_found?: unknown };
    for (const card of Array.isArray(body.data) ? body.data : []) {
      if (isScryCard(card)) {
        rememberCard(card);
        const set = (card as { set?: unknown }).set;
        const cn = (card as { collector_number?: unknown }).collector_number;
        if (typeof set === 'string' && typeof cn === 'string') {
          bySet.set(`${set.toLowerCase()}/${cn.replace(/[★†]/gu, '')}`, card);
        }
        byName.set(card.name.toLowerCase(), card);
        const front = card.name.split(' // ')[0];
        if (front) byName.set(front.toLowerCase(), card);
      }
    }
    for (const miss of Array.isArray(body.not_found) ? body.not_found : []) {
      const m = miss as { name?: unknown; set?: unknown; collector_number?: unknown };
      if (typeof m.set === 'string' && typeof m.collector_number === 'string') {
        notFound.push(`${m.set} ${m.collector_number}`);
      } else if (typeof m.name === 'string') {
        notFound.push(m.name);
      }
    }
  }

  return { bySet, byName, notFound };
}

/**
 * Learn metadata for cards the session has never seen, by Scryfall id. This is
 * how imported decks (whose cards were resolved in a session long gone) get
 * their type lines, curves, and identities back: the deck editor hydrates any
 * unknown ids on load. Already-known ids are skipped, so repeat calls are free.
 */
export async function hydrateCardMeta(ids: string[]): Promise<number> {
  const unknown = [...new Set(ids)].filter((id) => !KNOWN.has(id));
  if (unknown.length === 0) return 0;
  let learned = 0;
  for (let start = 0; start < unknown.length; start += BATCH) {
    if (start > 0) await wait(BATCH_GAP_MS);
    const slice = unknown.slice(start, start + BATCH);
    const response = await fetch(`${API}/cards/collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: slice.map((id) => ({ id })) }),
    });
    if (!response.ok) continue; // partial hydration is still useful
    const body = (await response.json()) as { data?: unknown };
    for (const card of Array.isArray(body.data) ? body.data : []) {
      if (isScryCard(card)) {
        rememberCard(card);
        learned += 1;
      }
    }
  }
  return learned;
}

// --- mana cost parsing (for pip rendering) ---

/** "{2}{G}{W}" → ["2", "G", "W"]; hybrid/phyrexian symbols pass through whole. */
export function manaSymbols(manaCost: string | undefined): string[] {
  if (!manaCost) return [];
  const symbols: string[] = [];
  const pattern = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(manaCost)) !== null) {
    if (match[1] !== undefined) symbols.push(match[1]);
  }
  return symbols;
}


// --- printings (artwork variants) ---

export interface Printing {
  id: string;
  setName: string;
  set: string;
  releasedAt: string;
  artist?: string;
}

const PRINTINGS = new Map<string, Printing[]>();

/**
 * Every paper printing of the card behind `scryfallId` (any printing id of it),
 * newest first. One /cards/{id} hop resolves the oracle identity, then the
 * prints search lists the family; both legs cache for the session.
 */
export async function fetchPrintings(scryfallId: string): Promise<Printing[]> {
  const cached = PRINTINGS.get(scryfallId);
  if (cached) return cached;
  const cardResponse = await fetch(`${API}/cards/${scryfallId}`, { headers: { Accept: 'application/json' } });
  if (!cardResponse.ok) throw new Error(String(cardResponse.status));
  const card = (await cardResponse.json()) as { prints_search_uri?: string };
  if (!card.prints_search_uri) return [];
  const url = new URL(card.prints_search_uri);
  url.searchParams.set('unique', 'prints');
  const printings: Printing[] = [];
  let next: string | null = url.toString();
  while (next && printings.length < 120) {
    const page = await fetch(next, { headers: { Accept: 'application/json' } });
    if (!page.ok) break;
    const data = (await page.json()) as {
      data?: { id: string; set_name: string; set: string; released_at?: string; artist?: string; digital?: boolean }[];
      has_more?: boolean;
      next_page?: string;
    };
    for (const hit of data.data ?? []) {
      if (hit.digital) continue;
      printings.push({
        id: hit.id,
        setName: hit.set_name,
        set: hit.set,
        releasedAt: hit.released_at ?? '',
        artist: hit.artist,
      });
    }
    next = data.has_more ? (data.next_page ?? null) : null;
  }
  printings.sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
  // Cache under every printing id so reopening from any art is instant.
  for (const printing of printings) PRINTINGS.set(printing.id, printings);
  PRINTINGS.set(scryfallId, printings);
  return printings;
}
