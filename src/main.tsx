import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The token layer: fonts first, then the CSS custom properties every component
// reads. In the vendored scaffold these resolve to the copied token files.
import '@glacier/tokens/css/fonts.css';
import '@glacier/tokens/css/tokens.css';
// The compiled component styles. In the monorepo the Vite alias serves the raw
// source (styles arrive through CSS modules), so this import is a no-op there;
// the vendored scaffold ships the built styles.css and needs it.
import './styles.css';
import './app/app.css';
// The per-game accent ramps ([data-accent='cyberpunk'] / [data-accent='yugioh']),
// applied while in a match of that game.
import './app/cyberpunk-accent.css';
import './app/yugioh-accent.css';
import { App } from './app/App.tsx';
import { trackViewportHeight } from './app/viewportHeight.ts';
import { isLocalPlay, localServerStart } from './app/tauri.ts';

// Before first paint: the shell sizes off the measured viewport, not 100dvh.
trackViewportHeight();

// Local play (desktop): make sure the bundled server is actually running.
// SERVER_URL already points at the REMEMBERED port (synchronous at module
// load); if the sidecar comes up somewhere else - port stolen since last
// launch - remember the new one and reload onto it. If it cannot start at
// all, fall back to online mode rather than presenting a dead app.
if (isLocalPlay()) {
  void localServerStart().then((port) => {
    const remembered = localStorage.getItem('pc.local.port');
    if (port == null) {
      localStorage.removeItem('pc.local');
      localStorage.removeItem('pc.local.port');
      window.location.reload();
    } else if (String(port) !== remembered) {
      localStorage.setItem('pc.local.port', String(port));
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
