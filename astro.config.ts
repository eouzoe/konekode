import { createReadStream, createWriteStream } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { constants, createGzip } from 'node:zlib';

import { defineConfig } from 'astro/config';

const packed = /\.(?:tar|wasm)$/u;
const kibi = 1024;
const limitMebibytes = 25;
const limit = limitMebibytes * kibi * kibi;

const packFile = async (source: string): Promise<void> => {
  const target = `${source}.gz`;
  await pipeline(
    createReadStream(source),
    createGzip({ level: constants.Z_BEST_COMPRESSION }),
    createWriteStream(target),
  );
  await rm(source);
  const { size } = await stat(target);
  if (size > limit) {
    throw new Error(`${target} 壓縮後仍超過 Cloudflare 單檔上限（${String(size)} 位元組）`);
  }
};

const packAssets = async (dir: URL): Promise<void> => {
  const folder = new URL('_astro/', dir);
  const names = await readdir(folder);
  await Promise.all(
    names
      .filter((name) => packed.test(name))
      .map(async (name) => {
        await packFile(fileURLToPath(new URL(name, folder)));
      }),
  );
};

export default defineConfig({
  integrations: [
    {
      hooks: {
        'astro:build:done': async ({ dir }) => {
          await packAssets(dir);
        },
      },
      name: 'pack-large-assets',
    },
  ],
  site: 'https://example.com',
  vite: {
    optimizeDeps: {
      exclude: ['@yowasp/clang'],
    },
    worker: {
      format: 'es',
    },
  },
});
