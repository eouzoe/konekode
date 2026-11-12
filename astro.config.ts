import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [
    starlight({
      description: '競賽演算法的中文教材。',
      favicon: '/favicon.ico',
      head: [{ attrs: { content: 'noindex, nofollow', name: 'robots' }, tag: 'meta' }],
      locales: { root: { label: '繁體中文', lang: 'zh-TW' } },
      title: '算法教學',
    }),
  ],
  site: 'https://example.com',
});
