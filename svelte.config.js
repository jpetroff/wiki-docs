import adapter from 'svelte-adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // The adapter otherwise compresses every editor chunk concurrently at maximum
    // Brotli quality, which exhausts memory on constrained build hosts.
    adapter: adapter({ out: process.env.WIKI_BUILD_OUT || 'build', precompress: false }),
    appDir: '_/app'
  }
};

export default config;
