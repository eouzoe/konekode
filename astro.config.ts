import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { constants, createBrotliCompress } from 'node:zlib';

import { defineConfig } from 'astro/config';

const packed = /\.(?:tar|wasm)$/u;
const kibi = 1024;
const limitMebibytes = 25;
const limit = limitMebibytes * kibi * kibi;
const cache = fileURLToPath(new URL('node_modules/.cache/packed-assets/', import.meta.url));

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const compress = async (source: string, target: string): Promise<void> => {
  const { size } = await stat(source);
  const brotli = createBrotliCompress({
    params: {
      [constants.BROTLI_PARAM_LGWIN]: constants.BROTLI_MAX_WINDOW_BITS,
      [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
      [constants.BROTLI_PARAM_SIZE_HINT]: size,
    },
  });
  await pipeline(createReadStream(source), brotli, createWriteStream(`${target}.partial`));
  await copyFile(`${target}.partial`, target);
  await rm(`${target}.partial`);
};

const packFile = async (folder: string, name: string): Promise<void> => {
  const source = `${folder}${name}`;
  const stored = `${cache}${name}.br`;
  if (!(await exists(stored))) {
    await compress(source, stored);
  }
  const { size } = await stat(stored);
  if (size > limit) {
    throw new Error(`${name} 壓縮後仍超過 Cloudflare 單檔上限（${String(size)} 位元組）`);
  }
  await copyFile(stored, `${source}.br`);
  await rm(source);
};

const packAssets = async (dir: URL): Promise<void> => {
  const folder = fileURLToPath(new URL('_astro/', dir));
  await mkdir(cache, { recursive: true });
  const names = await readdir(folder);
  await Promise.all(
    names
      .filter((name) => packed.test(name))
      .map(async (name) => {
        await packFile(folder, name);
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
  site: 'https://konekode.pappdatap.workers.dev',
  vite: {
    optimizeDeps: {
      exclude: ['@yowasp/clang'],
    },
    worker: {
      format: 'es',
    },
  },
});
