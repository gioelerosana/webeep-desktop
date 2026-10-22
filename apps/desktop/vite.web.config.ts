import { defineConfig } from 'vite';
import electronViteConfig from './electron.vite.config';

// Solo il renderer, senza il main di Electron: `pnpm dev:web` apre l'interfaccia nel browser
// con il bridge finto. `electron-vite dev --rendererOnly` lancerebbe comunque Electron.
// Riusa la config renderer di electron.vite.config.ts così root, alias, plugin e porta restano identici.
export default defineConfig(electronViteConfig.renderer ?? {});
