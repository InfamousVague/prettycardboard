import { useEffect, useState } from 'react';
import { cardImage, isAltArtId } from './cards.ts';
import { isYugiohId } from './yugioh.ts';

/**
 * Double-faced card resolution. The server only tracks a `transformed` flag per
 * card; the client learns a card's two faces from Scryfall on demand and caches
 * them. Only `transform` / `modal_dfc` layouts have a true hidden back face you
 * flip between (meld, split, adventure, flip do not), so those are the only ones
 * marked as DFCs here.
 *
 * Loads are lazy and deduped: a card's faces are fetched the first time it is
 * transformed on screen (any viewer) or its context menu is opened. Subscribers
 * (the board) re-render when a load lands so the back art swaps in.
 */

export interface FaceInfo {
  /** True when the card has two physical faces you can flip between. */
  dfc: boolean;
  frontImage?: string;
  backImage?: string;
  frontName?: string;
  backName?: string;
  /** The BACK face's printed P/T, for the on-card total once flipped. */
  backPower?: string;
  backToughness?: string;
}

const NOT_DFC: FaceInfo = { dfc: false };

const cache = new Map<string, FaceInfo>();
const inflight = new Map<string, Promise<FaceInfo>>();
const listeners = new Set<() => void>();

/** Synchronous cache read; undefined until the card's faces have been loaded. */
export function getFaces(scryfallId: string | undefined): FaceInfo | undefined {
  return scryfallId ? cache.get(scryfallId) : undefined;
}

interface ScryFace {
  name?: string;
  image_uris?: { normal?: string; large?: string };
  power?: string;
  toughness?: string;
}

/**
 * One card's record from Scryfall. A card wearing our own curated art carries a
 * `pc-…` id Scryfall has never heard of - asking for it directly is a 404, and
 * a 404 here reads as "this card has no second face", which is why flipping a
 * double-faced commander in our art did nothing at all. Those are asked for by
 * the oracle identity the art was published against instead.
 */
async function lookup(id: string): Promise<{ layout?: string; card_faces?: ScryFace[] } | undefined> {
  if (isAltArtId(id)) {
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
    const body = (await response.json()) as { data?: { layout?: string; card_faces?: ScryFace[] }[] };
    return body.data?.[0];
  }
  const response = await fetch(`https://api.scryfall.com/cards/${id}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as { layout?: string; card_faces?: ScryFace[] };
}

/** Our own art for each face of a two-faced card, when it has been published.
 *  Either side may be missing, in which case that face falls back to paper. */
async function curatedFaces(
  altId: string,
  faces: ScryFace[],
): Promise<{ front?: string; back?: string } | undefined> {
  const { altArtForFace, altArtOracleId } = await import('./scryfall.ts');
  const oracleId = altArtOracleId(altId);
  if (!oracleId) return undefined;
  const front = altArtForFace(oracleId, faces[0]?.name);
  const back = altArtForFace(oracleId, faces[1]?.name);
  return {
    front: front ? cardImage(front.id) : undefined,
    back: back ? cardImage(back.id) : undefined,
  };
}

/**
 * The image for the face this card is currently showing.
 *
 * Which face you see is decided by `transformed`, NOT by which art id the deck
 * happens to store. A two-faced card publishes one curated art per face, so a
 * deck saved on the back-face art would otherwise sit in the command zone as a
 * planeswalker that has never been transformed. An untransformed card shows its
 * front face; that is just the rules.
 *
 * Cheap by construction: a plain paper id already resolves to its front, so
 * only transformed cards and cards wearing our art cost a lookup.
 */
export function faceImage(card: {
  scryfallId?: string;
  transformed?: boolean;
  imageUrl?: string | null;
}): string {
  const id = card.scryfallId;
  const fallback = card.imageUrl || cardImage(id);
  if (!id || (!card.transformed && !isAltArtId(id))) return fallback;
  const info = getFaces(id);
  if (!info) {
    void loadFaces(id);
    return fallback;
  }
  if (!info.dfc) return fallback;
  return (card.transformed ? info.backImage : info.frontImage) || fallback;
}

/** Fetch + cache a card's face info. Deduped by id; safe to call from render. */
export function loadFaces(scryfallId: string): Promise<FaceInfo> {
  const cached = cache.get(scryfallId);
  if (cached) return Promise.resolve(cached);
  // Yu-Gi-Oh cards have no second face, and their passcodes mean nothing to
  // Scryfall — answer without the doomed network round-trip.
  if (isYugiohId(scryfallId)) {
    cache.set(scryfallId, NOT_DFC);
    return Promise.resolve(NOT_DFC);
  }
  const pending = inflight.get(scryfallId);
  if (pending) return pending;

  const run = (async (): Promise<FaceInfo> => {
    try {
      const card = await lookup(scryfallId);
      if (!card) return NOT_DFC;
      const twoFaced = card.layout === 'transform' || card.layout === 'modal_dfc';
      const faces = card.card_faces ?? [];
      // Our curated art publishes a two-faced card as TWO arts under one oracle
      // identity, one per face. When the card on the table is wearing one of
      // them, flip between our arts rather than dropping the player onto a
      // paper scan halfway through their deck.
      const ourFaces = twoFaced && isAltArtId(scryfallId) ? await curatedFaces(scryfallId, faces) : undefined;
      const back = ourFaces?.back ?? faces[1]?.image_uris?.normal ?? faces[1]?.image_uris?.large;
      const info: FaceInfo =
        twoFaced && faces.length >= 2 && back
          ? {
              dfc: true,
              frontImage: ourFaces?.front ?? faces[0]?.image_uris?.normal ?? faces[0]?.image_uris?.large,
              backImage: back,
              frontName: faces[0]?.name,
              backName: faces[1]?.name,
              backPower: faces[1]?.power,
              backToughness: faces[1]?.toughness,
            }
          : NOT_DFC;
      cache.set(scryfallId, info);
      listeners.forEach((fn) => fn());
      return info;
    } catch {
      // Do not cache errors: a transient failure should not permanently mark a
      // card as single-faced. The next board change or menu open retries.
      return NOT_DFC;
    } finally {
      inflight.delete(scryfallId);
    }
  })();

  inflight.set(scryfallId, run);
  return run;
}

/** Ensure a card's faces are loading, then read whatever is cached now. */
export function useFaces(scryfallId: string | undefined): FaceInfo | undefined {
  const version = useFacesVersion();
  useEffect(() => {
    if (scryfallId && !cache.has(scryfallId)) void loadFaces(scryfallId);
  }, [scryfallId]);
  void version; // re-read on cache updates
  return getFaces(scryfallId);
}

/** A counter that bumps whenever any card's faces finish loading, so a consumer
 *  that reads the cache synchronously (the board) re-renders when art arrives. */
export function useFacesVersion(): number {
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
