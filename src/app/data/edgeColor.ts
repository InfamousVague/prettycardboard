import { useEffect, useState } from 'react';

/**
 * Sample a card back's border colour so the 3D library stack's under-layers
 * read as the real card's cut edge instead of a fixed brown. The bundled back
 * images are same-origin, so a tiny offscreen canvas can average the pixels in
 * a thin ring around the edge. Results are cached by URL; sampling is async, so
 * callers fall back to a neutral tint until the first sample resolves.
 */

/** Neutral warm-grey shown until (or if) a real sample is unavailable. */
export const FALLBACK_EDGE = 'oklch(0.34 0.02 60)';

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

/** The sampled colour if already known, else undefined (kicks off no work). */
export function cachedEdgeColor(url: string): string | undefined {
  return cache.get(url);
}

export function sampleEdgeColor(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(url);
  if (running) return running;

  const job = new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = 48;
        const ratio = img.naturalHeight && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 680 / 488;
        const h = Math.max(1, Math.round(w * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(FALLBACK_EDGE);
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);

        // Average a two-pixel ring just inside the edge (skipping the very
        // corners, where the rounded mask darkens the sample).
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        const inset = 1;
        const band = 2;
        const add = (x: number, y: number) => {
          const i = (y * w + x) * 4;
          r += data[i] ?? 0;
          g += data[i + 1] ?? 0;
          b += data[i + 2] ?? 0;
          n += 1;
        };
        for (let x = inset + band; x < w - inset - band; x++) {
          for (let d = 0; d < band; d++) {
            add(x, inset + d);
            add(x, h - 1 - inset - d);
          }
        }
        for (let y = inset + band; y < h - inset - band; y++) {
          for (let d = 0; d < band; d++) {
            add(inset + d, y);
            add(w - 1 - inset - d, y);
          }
        }
        if (!n) return resolve(FALLBACK_EDGE);
        const color = `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`;
        cache.set(url, color);
        resolve(color);
      } catch {
        resolve(FALLBACK_EDGE);
      }
    };
    img.onerror = () => resolve(FALLBACK_EDGE);
    img.src = url;
  }).finally(() => inflight.delete(url));

  inflight.set(url, job);
  return job;
}

/**
 * React binding: the sampled edge colour for an image URL, live-updating. Works
 * for any card image — a card back (the library pile) or a deck's cover (the
 * deck stack). An empty/missing URL stays on the fallback.
 */
export function useEdgeColor(url: string | undefined): string {
  const [color, setColor] = useState<string>(() => (url ? cachedEdgeColor(url) : undefined) ?? FALLBACK_EDGE);
  useEffect(() => {
    if (!url) {
      setColor(FALLBACK_EDGE);
      return;
    }
    let alive = true;
    setColor(cachedEdgeColor(url) ?? FALLBACK_EDGE);
    sampleEdgeColor(url).then((next) => {
      if (alive) setColor(next);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  return color;
}
