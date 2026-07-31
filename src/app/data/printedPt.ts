import { useEffect, useState } from 'react';
import { isAltArtId } from './cards.ts';
import { getFaces, loadFaces } from './faces.ts';
import { PRECONS } from './precons.ts';
import type { CardInst } from '../net/types.ts';

/**
 * A card's PRINTED power/toughness, resolved client-side.
 *
 * The server never carries it: `CardInst.power`/`toughness` are populated only
 * for tokens (token.create writes them), and every card dealt from a deck comes
 * across with both fields absent. So anything that wants a real creature's
 * printed 3/3 has to look it up here.
 *
 * Three tiers, cheapest first:
 *   1. tokens - the instance already carries its own P/T;
 *   2. the bundled precons - a synchronous map built at module load, same as
 *      boardModes' TYPE_LINES, so starter decks cost nothing and never blink;
 *   3. Scryfall - one lazy, deduped, throttled lookup per unseen card, cached
 *      for the session (including the "this card has no P/T" answer, so a land
 *      is asked about exactly once).
 *
 * Loads are safe to fire from a render loop: subscribers re-render when one
 * lands (see usePrintedPtVersion), exactly like data/faces.ts.
 */

export interface PrintedPT {
  power: string;
  toughness: string;
}

/** null = looked up, definitively has no P/T (a land, an instant, ...). */
const cache = new Map<string, PrintedPT | null>();

for (const precon of PRECONS) {
  for (const card of precon.cards) {
    // Both answers are cached: a bundled land provably has no P/T, and leaving
    // it unknown would send it to Scryfall to learn what we already know.
    cache.set(
      card.id,
      card.power != null && card.toughness != null
        ? { power: card.power, toughness: card.toughness }
        : null,
    );
  }
}

const listeners = new Set<() => void>();
const queued = new Set<string>();
let draining = false;

/**
 * Type lines learned from the same lookups, keyed by Scryfall id. This is what
 * lets the board classify cards from ANY deck - the bundled precon map only
 * covers the starter decks, and creature-vs-land drives real interactions
 * (attack/block click targets, assisted drops), not just labels.
 */
const typeLines = new Map<string, string>();
for (const precon of PRECONS) {
  for (const card of precon.cards) typeLines.set(card.id, card.typeLine);
}

/** The card's printed type line, if any lookup has seen it yet. */
export function printedTypeLine(scryfallId: string): string | undefined {
  return typeLines.get(scryfallId);
}

/**
 * Share a P/T someone else already fetched (the card-details panel pulls the
 * whole Scryfall record for its hover preview), so the board never asks for a
 * card the popup has already seen.
 */
export function notePrintedPT(scryfallId: string, power?: string, toughness?: string, typeLine?: string): void {
  if (typeLine && !typeLines.has(scryfallId)) typeLines.set(scryfallId, typeLine);
  if (cache.has(scryfallId)) return;
  cache.set(scryfallId, power != null && toughness != null ? { power, toughness } : null);
  listeners.forEach((fn) => fn());
}

/**
 * Synchronous read. `undefined` means "not looked up yet" (ask for it with
 * primePrintedPT); `null` means "looked up, this card has no P/T".
 */
export function printedPT(card: CardInst): PrintedPT | null | undefined {
  // A token's P/T is authored at creation and can be anything ("*", "" for a
  // non-creature token), so the instance always wins over any lookup.
  if (card.isToken) {
    return card.power != null && card.toughness != null
      ? { power: card.power, toughness: card.toughness }
      : null;
  }
  // A face-down card is masked server-side for everyone but its owner - and
  // even the owner must not read through it, or the two sides disagree.
  if (card.faceDown) return null;
  if (!card.scryfallId) return null;
  // Flipped to its back face, a DFC is a different creature with different
  // numbers. Show nothing until the faces land rather than the front's P/T.
  if (card.transformed) {
    const faces = getFaces(card.scryfallId);
    if (!faces) return undefined;
    if (!faces.dfc) return cache.get(card.scryfallId);
    return faces.backPower != null && faces.backToughness != null
      ? { power: faces.backPower, toughness: faces.backToughness }
      : null;
  }
  return cache.get(card.scryfallId);
}

/* A breath between batches; Scryfall asks for ~10 requests a second at most. */
const REQUEST_GAP_MS = 150;
/* /cards/collection accepts up to 75 identifiers per POST. */
const BATCH_MAX = 75;

interface ScryPT {
  id?: string;
  power?: string;
  toughness?: string;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  oracle_text?: string;
  colors?: string[];
  keywords?: string[];
  produced_mana?: string[];
  card_faces?: { power?: string; toughness?: string; type_line?: string; mana_cost?: string; oracle_text?: string; colors?: string[] }[];
}

/** Everything the enforced-mode client logic needs to know about a card:
 * cost (parsed to pips), types, keywords, what it taps for. Mirrors the
 * server's oracle.rs so both sides agree about legality and affordability. */
export interface OracleFacts {
  typeLine: string;
  mv: number;
  /** Generic cost component (hybrid/phyrexian counted here, X as 0). */
  generic: number;
  /** Required colored pips by letter (W U B R G C). */
  pips: Record<string, number>;
  keywords: string[];
  /** Colors this card can produce (lands, rocks). */
  produced: string[];
  /** What this spell targets, parsed from its oracle text ("creature",
   * "permanent", "player", ...). Empty = it does not target. */
  targetKinds: string[];
  /** The card's colors (W U B R G) - evasion checks read these. */
  colors: string[];
  /** "(<type> )spells you cast cost {N} less" statics this permanent
   * projects, mirroring the server's cost fold (rules pass B). */
  costCuts: { filter?: string; n: number }[];
  /** "~ can't be blocked." with no qualifier. */
  unblockable: boolean;
  /** Colors this card has protection from. */
  protectionFrom: string[];
}

const factsMap = new Map<string, OracleFacts>();

/** Parsed oracle facts, once a lookup has landed. */
export function oracleFacts(scryfallId: string | undefined): OracleFacts | undefined {
  return scryfallId ? factsMap.get(scryfallId) : undefined;
}

/** "{2}{W}{W}" -> { generic: 2, pips: { W: 2 } }. Hybrid/Phyrexian count as
 * generic (payable-any-way is close enough); X counts as 0. */
function parseCost(cost: string): { generic: number; pips: Record<string, number> } {
  let generic = 0;
  const pips: Record<string, number> = {};
  for (const sym of cost.replace(/^\{/, '').replace(/\}$/, '').split('}{')) {
    if (!sym) continue;
    const n = Number(sym);
    if (Number.isFinite(n)) generic += n;
    else if (sym.length === 1 && 'WUBRGC'.includes(sym)) pips[sym] = (pips[sym] ?? 0) + 1;
    else if (sym === 'X' || sym === 'Y' || sym === 'Z') {
      /* X chosen at cast time; charged 0 here */
    } else generic += 1;
  }
  return { generic, pips };
}

/** Fold one fetched card into the caches. */
function absorb(id: string, card: ScryPT): void {
  const face = card.card_faces?.[0];
  const power = card.power ?? face?.power;
  const toughness = card.toughness ?? face?.toughness;
  // The lookup already paid for the whole card: keep its type line too, so
  // creature/land classification works beyond the bundled precons.
  const line = card.type_line ?? face?.type_line;
  if (line && !typeLines.has(id)) typeLines.set(id, line);
  const cost = card.mana_cost || face?.mana_cost || '';
  const { generic, pips } = parseCost(cost);
  const text = (card.oracle_text ?? face?.oracle_text ?? '').toLowerCase();
  const targetKinds: string[] = [];
  for (const kind of ['creature', 'planeswalker', 'artifact', 'enchantment', 'land', 'permanent', 'player', 'opponent', 'spell']) {
    if (text.includes(`target ${kind}`) && !targetKinds.includes(kind)) targetKinds.push(kind);
  }
  if (targetKinds.length === 0 && /\btarget\b/.test(text)) targetKinds.push('any');
  // Pass B statics, mirrored from the server's parse (reminder text out).
  const clean = text.replace(/\([^)]*\)/g, '');
  const costCuts: { filter?: string; n: number }[] = [];
  let unblockable = false;
  for (const rawLine of clean.split('\n')) {
    const l = rawLine.trim();
    const cut = l.match(/^(?:([a-z]+) )?spells you cast cost \{(\d+)\} less to cast\.?$/);
    if (cut) costCuts.push({ filter: cut[1] || undefined, n: Number(cut[2]) });
    if (/^this [a-z]+ can't be blocked\.?$/.test(l)) unblockable = true;
  }
  const protectionFrom: string[] = [];
  const PRO: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
  for (const m of clean.matchAll(/protection from ([a-z ]+)/g)) {
    const what = m[1] ?? '';
    if (what.startsWith('all colors') || what.startsWith('everything')) {
      protectionFrom.push('W', 'U', 'B', 'R', 'G');
    } else {
      for (const [word, c] of Object.entries(PRO)) {
        if (what.includes(word) && !protectionFrom.includes(c)) protectionFrom.push(c);
      }
    }
  }
  factsMap.set(id, {
    typeLine: line ?? '',
    mv: Math.round(card.cmc ?? 0),
    generic,
    pips,
    keywords: (card.keywords ?? []).map((k) => k.toLowerCase()),
    produced: (card.produced_mana ?? []).filter((c) => 'WUBRGC'.includes(c)),
    targetKinds,
    colors: (card.colors ?? card.card_faces?.[0]?.colors ?? []).filter((c) => 'WUBRG'.includes(c)),
    costCuts,
    unblockable,
    protectionFrom,
  });
  cache.set(id, power != null && toughness != null ? { power, toughness } : null);
}

/** A `pc-…` alt-art id Scryfall 404s on is asked for by the oracle identity
 *  its art was published against - the same route the card details take. */
async function lookupAltArt(id: string): Promise<ScryPT | undefined> {
  // Dynamic: scryfall.ts is a static dependency of the app shell, and pulling
  // this module into that graph drags the bundled precon decklists with it.
  const { altArtOracleId, loadAltArtCatalog } = await import('./scryfall.ts');
  await loadAltArtCatalog();
  const oracleId = altArtOracleId(id);
  if (!oracleId) return undefined;
  const response = await fetch('https://api.scryfall.com/cards/collection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ identifiers: [{ oracle_id: oracleId }] }),
  });
  if (!response.ok) return undefined;
  const body = (await response.json()) as { data?: ScryPT[] };
  return body.data?.[0];
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queued.size > 0) {
      // One /cards/collection POST covers a whole fresh board at once, so a
      // deck the app has never seen classifies in a single round trip instead
      // of trickling in a card at a time. Alt-art ids take their own path.
      const batch: string[] = [];
      const alts: string[] = [];
      for (const id of queued) {
        if (cache.has(id)) {
          queued.delete(id);
          continue;
        }
        if (isAltArtId(id)) {
          if (alts.length === 0) alts.push(id);
          continue;
        }
        batch.push(id);
        if (batch.length >= BATCH_MAX) break;
      }
      for (const id of batch) queued.delete(id);

      if (batch.length > 0) {
        try {
          const response = await fetch('https://api.scryfall.com/cards/collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
          });
          if (response.ok) {
            const body = (await response.json()) as { data?: ScryPT[] };
            const seen = new Set<string>();
            for (const card of body.data ?? []) {
              if (!card.id) continue;
              seen.add(card.id);
              absorb(card.id, card);
            }
            // Ids Scryfall says do not exist will never resolve; cache the
            // "no P/T" answer so they are not re-asked forever.
            for (const id of batch) {
              if (!seen.has(id)) cache.set(id, null);
            }
            listeners.forEach((fn) => fn());
          }
          // Non-OK: leave the batch uncached; a flaky response should not
          // permanently brand creatures as P/T-less. The next board change
          // re-queues them.
        } catch {
          /* same: transient failures stay uncached */
        }
      } else if (alts.length > 0) {
        const id = alts[0]!;
        queued.delete(id);
        try {
          const card = await lookupAltArt(id);
          if (card) {
            absorb(id, card);
            listeners.forEach((fn) => fn());
          }
        } catch {
          /* transient; retried on the next queue */
        }
      }
      if (queued.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
      }
    }
  } finally {
    draining = false;
  }
}

/** Ask for a card's printed P/T if we have not already. Safe from render. */
export function primePrintedPT(card: CardInst): void {
  if (card.isToken || card.faceDown || !card.scryfallId) return;
  // A flipped card is read off its back face, which lives in the faces cache.
  if (card.transformed) {
    void loadFaces(card.scryfallId);
    return;
  }
  if (cache.has(card.scryfallId) || queued.has(card.scryfallId)) return;
  queued.add(card.scryfallId);
  void drain();
}

/** A counter that bumps whenever a lookup lands, so a board that reads the
 *  cache synchronously re-renders with the number it was missing. */
export function usePrintedPtVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((n) => n + 1);
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);
  return version;
}
