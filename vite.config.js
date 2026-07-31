// vite.config.js — CargoChain
// Port 5173 for dev. Proof images are stored directly in Supabase Storage.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
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
