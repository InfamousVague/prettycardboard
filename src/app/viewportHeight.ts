/**
 * Publishes the *actually visible* viewport height as `--pc-vh` on the root.
 *
 * `100dvh` is right in a browser tab, but an installed (standalone) app paints
 * edge to edge and some platforms report a dvh taller than the area the user can
 * actually see - so the shell's last strip, and everything anchored to it (the
 * hide-hand pill, the deck, the hand fan), sits below the fold and gets clipped.
 * Measuring the viewport directly is the only reading that survives every
 * combination of PWA mode, system gesture bar and collapsing browser chrome.
 *
 * visualViewport is preferred because it excludes system UI; it also shrinks
 * when the on-screen keyboard opens, which is what we want - the shell should
 * fit above the keyboard rather than hide behind it.
 */
export function trackViewportHeight(): void {
  if (typeof window === 'undefined') return;

  const apply = () => {
    const height = window.visualViewport?.height ?? window.innerHeight;
    if (height > 0) document.documentElement.style.setProperty('--pc-vh', `${Math.round(height)}px`);
  };

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  window.visualViewport?.addEventListener('resize', apply);
}
