import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // Keep large, already-ESM editors out of Vite's eager dependency optimizer.
  optimizeDeps: { exclude: ['@bloklabs/core', 'monaco-editor'] },
  server: {
    host: '0.0.0.0',
    allowedHosts: true
  }
});
