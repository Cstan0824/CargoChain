// vite.config.js — CargoChain
// Port 5174 for dev. Proof images are stored directly in Supabase Storage.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    watch: {
      // Ganache keeps its live LevelDB database inside the repository during
      // local development. Windows exclusively locks ganache-data/LOCK, so
      // Vite must not ask its file watcher to observe that directory.
      ignored: ['**/ganache-data/**'],
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true, // helps the team debug in DevTools
  },

  test: {
    environment: 'jsdom',
    clearMocks: true,
    globals: true,
    include: ['src/**/*.test.{js,jsx}'],
  },
});
