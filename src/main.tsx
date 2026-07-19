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
import { App } from './app/App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
