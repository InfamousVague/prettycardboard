import { useEffect, useState } from 'react';

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
}

/** Fetch + cache a card's face info. Deduped by id; safe to call from render. */
export function loadFaces(scryfallId: string): Promise<FaceInfo> {
  const cached = cache.get(scryfallId);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(scryfallId);
  if (pending) return pending;

  const run = (async (): Promise<FaceInfo> => {
    try {
      const response = await fetch(`https://api.scryfall.com/cards/${scryfallId}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(String(response.status));
      const card = (await response.json()) as { layout?: string; card_faces?: ScryFace[] };
      const twoFaced = card.layout === 'transform' || card.layout === 'modal_dfc';
      const faces = card.card_faces ?? [];
      const back = faces[1]?.image_uris?.normal ?? faces[1]?.image_uris?.large;
      const info: FaceInfo =
        twoFaced && faces.length >= 2 && back
          ? {
              dfc: true,
              frontImage: faces[0]?.image_uris?.normal ?? faces[0]?.image_uris?.large,
              backImage: back,
              frontName: faces[0]?.name,
              backName: faces[1]?.name,
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
