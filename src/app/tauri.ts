/**
 * A thin, dependency-free bridge to the Tauri runtime.
 *
 * The app runs three ways: in a plain browser (dev), as a Tauri window (full
 * Rust backend), and as a static build with no backend. Every call here
 * degrades gracefully, so no page has to know which one it is in. The
 * `@tauri-apps/api` package only exists in the full-Tauri scaffold, so it is
 * loaded through a computed specifier that the bundler and the type checker
 * both leave unresolved; when it is absent the calls simply no-op.
 */

/** True when running inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function importApi(subpath: string): Promise<any> {
  if (!isTauri()) return null;
  const specifier = `@tauri-apps/api/${subpath}`;
  try {
    return await import(/* @vite-ignore */ specifier);
  } catch {
    return null;
  }
}

async function currentWindow() {
  const mod = await importApi('window');
  return mod?.getCurrentWindow?.() ?? null;
}

export async function minimizeWindow(): Promise<void> {
  (await currentWindow())?.minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  (await currentWindow())?.toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  (await currentWindow())?.close();
}

/**
 * Call a Rust command. Falls back to a stubbed greeting when no backend is
 * present, so the About page's demo works in the browser too.
 */
export async function greet(name: string): Promise<string> {
  const mod = await importApi('core');
  if (mod?.invoke) return (await mod.invoke('greet', { name })) as string;
  return `Hello, ${name || 'friend'}! (running without a Tauri backend)`;
}
