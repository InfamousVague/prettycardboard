import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A relative base so the built app works when Tauri serves it from a custom
// protocol rather than the server root. @glacier/react resolves from the
// vendored copy in node_modules (installed via the file: dependency).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5240,
    strictPort: true,
  },
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        // Split the big, rarely-changing dependencies into their own cacheable
        // vendor chunks so a code change does not re-download React/motion/the
        // Glacier kit. Route-level code-splitting (React.lazy in App.tsx) then
        // keeps the table engine and deck builder out of the initial payload.
        // Order matters: motion and @glacier both live under paths that also
        // contain "react", so they are matched first.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/motion/') || id.includes('/framer-motion/')) return 'vendor-motion';
          if (id.includes('/@glacier/')) return 'vendor-glacier';
          // three.js is only reached via a dynamic import (the WebGL dice on a
          // Cyberpunk table), so keep it in its own chunk — otherwise it folds
          // into the eager `vendor` bundle and every player downloads ~150KB
          // gzip they never use.
          if (id.includes('/three/')) return 'vendor-three';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'vendor-react';
          }
          return 'vendor';
        },
      },
    },
    // The vendor chunks are intentionally large; the meaningful budget is the
    // app's own entry + per-route chunks, which the split keeps well under.
    chunkSizeWarningLimit: 900,
  },
});
