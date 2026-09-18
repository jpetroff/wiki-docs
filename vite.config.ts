import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { blokAssets } from './scripts/blok-assets.js';
import svelteConfig from './svelte.config.js';

export default defineConfig({
  plugins: [
    blokAssets(svelteConfig.kit?.appDir, svelteConfig.kit?.paths?.assets || svelteConfig.kit?.paths?.base),
    tailwindcss(),
    sveltekit()
  ],
  // Keep large, already-ESM editors out of Vite's eager dependency optimizer.
  optimizeDeps: { exclude: ['@bloklabs/core', 'monaco-editor'] },
  server: {
    host: '0.0.0.0',
    allowedHosts: true
  }
});
