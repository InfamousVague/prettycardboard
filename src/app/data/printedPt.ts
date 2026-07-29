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
 * Share a P/T someone else already fetched (the card-details panel pulls the
 * whole Scryfall record for its hover preview), so the board never asks for a
 * card the popup has already seen.
 */
export function notePrintedPT(scryfallId: string, power?: string, toughness?: string): void {
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

/* A card at a time with a breath in between: Scryfall asks for ~10 requests a
   second at the very most, and a fresh 30-card board would otherwise fire 30
   at once on the first frame. */
const REQUEST_GAP_MS = 120;

interface ScryPT {
  power?: string;
  toughness?: string;
  card_faces?: { power?: string; toughness?: string }[];
}

/** One card's P/T from Scryfall. A card wearing our own art has a `pc-…` id
 *  Scryfall 404s on, so it is asked for by the oracle identity that art was
 *  published against - the same route the card details take. */
async function lookup(id: string): Promise<ScryPT | undefined> {
  if (isAltArtId(id)) {
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
  const response = await fetch(`https://api.scryfall.com/cards/${id}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as ScryPT;
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queued.size > 0) {
      const id = queued.values().next().value as string;
      queued.delete(id);
      if (cache.has(id)) continue;
      try {
        const card = await lookup(id);
        if (!card) continue;
        const face = card.card_faces?.[0];
        const power = card.power ?? face?.power;
        const toughness = card.toughness ?? face?.toughness;
        cache.set(id, power != null && toughness != null ? { power, toughness } : null);
        listeners.forEach((fn) => fn());
      } catch {
        // Leave it uncached: a flaky lookup should not permanently brand a
        // creature as P/T-less. The next board change re-queues it.
      }
      await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
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
