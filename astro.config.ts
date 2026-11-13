import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://example.com',
  vite: {
    optimizeDeps: {
      exclude: ['@yowasp/clang'],
    },
  },
});
