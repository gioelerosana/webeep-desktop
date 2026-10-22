import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';

// I pacchetti del workspace esportano sorgenti TypeScript: vanno inclusi nel bundle,
// non trattati come dipendenze esterne da caricare a runtime.
const WORKSPACE_PACKAGES = ['@webeep/moodle-api'];

export default defineConfig({
  main: {
    build: { externalizeDeps: { exclude: WORKSPACE_PACKAGES } },
  },
  preload: {
    build: { externalizeDeps: { exclude: WORKSPACE_PACKAGES } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: { '@renderer': resolve(__dirname, 'src/renderer/src') },
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
  },
});
