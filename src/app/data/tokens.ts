/**
 * MTG token lookup for the board's "create token" flow: a Scryfall search
 * scoped to token cards, plus the set of tokens a given deck can produce (from
 * each card's Scryfall `all_parts`). Placing a token uses the real token art.
 */

const API = 'https://api.scryfall.com';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface TokenCard {
  id: string;
  name: string;
  /** Normal-size token art. */
  image: string;
  power?: string;
  toughness?: string;
  typeLine?: string;
  colors?: string[];
  oracle?: string;
}

/** Common token names, shown as quick chips when there is no search. */
export const COMMON_TOKENS = [
  'Treasure',
  'Clue',
  'Food',
  'Blood',
  'Gold',
  'Map',
  'Powerstone',
  'Soldier',
  'Zombie',
  'Goblin',
  'Spirit',
  'Saproling',
  'Angel',
  'Beast',
  'Elemental',
  'Copy',
];

interface RawCard {
  id: string;
  name: string;
  type_line?: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  oracle_text?: string;
  image_uris?: { normal?: string };
  card_faces?: { image_uris?: { normal?: string } }[];
  all_parts?: { id: string; name: string; component?: string }[];
}

function toToken(card: RawCard): TokenCard | null {
  const image = card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal;
  if (!image) return null;
  return {
    id: card.id,
    name: card.name,
    image,
    power: card.power,
    toughness: card.toughness,
    typeLine: card.type_line,
    colors: card.colors,
    oracle: card.oracle_text,
  };
}

/** Dedupe by name (the same token has many printings), keep the first. */
function dedupeByName(tokens: TokenCard[]): TokenCard[] {
  const byName = new Map<string, TokenCard>();
  for (const token of tokens) if (!byName.has(token.name)) byName.set(token.name, token);
  return [...byName.values()];
}

const searchCache = new Map<string, TokenCard[]>();

/** Search Scryfall token cards. An empty query returns []. */
export async function searchTokens(query: string): Promise<TokenCard[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const q = `is:token ${trimmed}`;
  const key = q.toLowerCase();
  const cached = searchCache.get(key);
  if (cached) return cached;
  const response = await fetch(`${API}/cards/search?order=name&unique=cards&q=${encodeURIComponent(q)}`);
  if (response.status === 404) {
    searchCache.set(key, []);
    return [];
  }
  if (!response.ok) throw new Error(`token search failed (${response.status})`);
  const data = ((await response.json()).data ?? []) as RawCard[];
  const tokens = dedupeByName(data.map(toToken).filter((t): t is TokenCard => t !== null)).slice(0, 40);
  searchCache.set(key, tokens);
  return tokens;
}

/** Fetch full Scryfall cards by id, in batches of 75 (the collection cap). */
async function collection(ids: string[]): Promise<RawCard[]> {
  const out: RawCard[] = [];
  for (let i = 0; i < ids.length; i += 75) {
    const batch = ids.slice(i, i + 75);
    const response = await fetch(`${API}/cards/collection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
    });
    if (response.ok) out.push(...(((await response.json()).data ?? []) as RawCard[]));
    if (i + 75 < ids.length) await sleep(100); // be gentle with the API
  }
  return out;
}

const deckTokenCache = new Map<string, TokenCard[]>();

/**
 * The tokens a deck can produce: for each of its cards, Scryfall's `all_parts`
 * lists related token components. Two collection round-trips (deck cards, then
 * the token cards themselves), cached per deck id.
 */
export async function deckTokens(deckId: string, cardIds: string[]): Promise<TokenCard[]> {
  const cached = deckTokenCache.get(deckId);
  if (cached) return cached;
  const cards = await collection([...new Set(cardIds)]);
  const tokenIds = new Set<string>();
  for (const card of cards) {
    for (const part of card.all_parts ?? []) {
      if (part.component === 'token') tokenIds.add(part.id);
    }
  }
  const tokenCards = tokenIds.size ? await collection([...tokenIds]) : [];
  const tokens = dedupeByName(tokenCards.map(toToken).filter((t): t is TokenCard => t !== null)).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  deckTokenCache.set(deckId, tokens);
  return tokens;
}
