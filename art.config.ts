import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { type AstroIntegration } from 'astro';
import sirv from 'sirv';

import { refsRoute } from './src/art/refs';

const pages = [
  { entrypoint: './src/art/unit.astro', pattern: '/art/unit' },
  { entrypoint: './src/art/home.astro', pattern: '/art/home' },
  { entrypoint: './src/parts/gallery.astro', pattern: '/parts' },
];

const refsFolder = (): string =>
  process.env.ART_REFS ?? fileURLToPath(new URL('../cp-lab/art/refs/', import.meta.url));

const artStudio = (): AstroIntegration => ({
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command !== 'dev') {
        return;
      }
      for (const page of pages) {
        injectRoute({ ...page, prerender: true });
      }
    },
    'astro:server:setup': ({ logger, server }) => {
      const folder = refsFolder();
      if (!existsSync(folder)) {
        logger.warn(`art refs not found at ${folder}; set ART_REFS to the studio's refs folder`);
        return;
      }
      server.middlewares.use(refsRoute, sirv(folder, { dev: true }));
    },
  },
  name: 'art-studio',
});

export { artStudio };
