/**
 * Resolve a build-relative public asset to an ABSOLUTE URL.
 *
 * The Vite `base` is `./` so the Tauri build works from its custom protocol,
 * which means BASE_URL-prefixed paths are relative (`./mats/x.webp`). That is
 * fine for `<img src>` (resolved against the document), but these same paths
 * also feed CSS custom properties — `--pc-playmat`, `--pc-card-back` — that are
 * consumed inside the *bundled stylesheet* at `/assets/…`. A relative `url()`
 * there resolves against `/assets/`, i.e. `/assets/mats/x.webp` — a 404 on the
 * web deploy. Resolving against `document.baseURI` up front yields an absolute
 * URL with no such ambiguity, and stays correct under both `https://…/` (web)
 * and `tauri://localhost/` (desktop), including any sub-path deploy.
 */
export function assetUrl(relative: string): string {
  return new URL(relative, document.baseURI).href;
}
