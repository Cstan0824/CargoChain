// vite.config.js — CargoChain
// Port 5173 for dev (Vite default). The /uploads prefix is proxied to the
// Express upload server on :3000 so the React app can reference
// /uploads/<filename>.jpg directly without CORS headers in dev.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    strictPort: false, // auto-bump to 5174 etc. if 5173 is taken
    proxy: {
      '/uploads': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true, // helps the team debug in DevTools
  },
});
