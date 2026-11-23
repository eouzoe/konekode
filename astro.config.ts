import { readFile } from 'node:fs/promises';

import { defineConfig } from 'astro/config';

import { artStudio } from './art.config';
import { packAssets } from './parts.config';
import { finishOffline } from './src/lib/site/offline.build';
import { textEditing } from './text.config';

const readVersion = async (name: string): Promise<string> => {
  const file = new URL(`node_modules/${name}/package.json`, import.meta.url);
  const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (typeof parsed === 'object' && parsed !== null && 'version' in parsed) {
    return String(parsed.version);
  }
  return 'unknown';
};

const compiler = await readVersion('@yowasp/clang');

export default defineConfig({
  build: {
    inlineStylesheets: 'always',
  },
  integrations: [
    {
      hooks: {
        'astro:build:done': async ({ dir }) => {
          await packAssets(dir);
          await finishOffline(dir);
        },
      },
      name: 'pack-large-assets',
    },
    textEditing(),
    artStudio(),
  ],
  site: 'https://cp.konekode.workers.dev',
  vite: {
    define: {
      'import.meta.env.PUBLIC_COMPILER': JSON.stringify(compiler),
    },
    optimizeDeps: {
      exclude: ['@yowasp/clang'],
    },
    worker: {
      format: 'es',
    },
  },
});
