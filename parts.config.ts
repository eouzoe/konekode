import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { constants, createBrotliCompress } from 'node:zlib';

import { listPath, packed } from './src/lib/run/packed';

const kibi = 1024;
const partSize = kibi * kibi;
const cache = fileURLToPath(new URL('node_modules/.cache/parts/', import.meta.url));

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const compress = async (bytes: Uint8Array, target: string): Promise<void> => {
  const brotli = createBrotliCompress({
    params: {
      [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
      [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
    },
  });
  await pipeline(Readable.from([bytes]), brotli, createWriteStream(`${target}.partial`));
  await copyFile(`${target}.partial`, target);
  await rm(`${target}.partial`);
};

const storePart = async (bytes: Uint8Array, folder: string): Promise<string> => {
  const name = createHash('sha256').update(bytes).digest('hex');
  const stored = `${cache}${name}.br`;
  if (!(await exists(stored))) {
    await compress(bytes, stored);
  }
  await copyFile(stored, `${folder}${name}`);
  return name;
};

const inTurn = <Item, Result>(
  items: ReadonlyArray<Item>,
  work: (item: Item) => Promise<Result>,
): Promise<Array<Result>> =>
  items.reduce<Promise<Array<Result>>>(async (earlier, item) => {
    const done = await earlier;
    return [...done, await work(item)];
  }, Promise.resolve([]));

const splitFile = async (source: string, parts: string): Promise<Array<string>> => {
  const bytes = new Uint8Array(await readFile(source));
  const starts = Array.from(
    { length: Math.ceil(bytes.length / partSize) },
    (_unused, index) => index * partSize,
  );
  const names = await inTurn(starts, (at) => storePart(bytes.subarray(at, at + partSize), parts));
  await writeFile(`${source}.json`, JSON.stringify({ parts: names, size: bytes.length }));
  await rm(source);
  return names;
};

const packFolder = async (dir: URL, path: string, parts: string): Promise<Array<string>> => {
  const folder = fileURLToPath(new URL(path, dir));
  if (!(await exists(folder))) {
    return [];
  }
  const names = await readdir(folder);
  const split = await inTurn(
    names.filter((one) => packed.test(one)),
    (name) => splitFile(`${folder}${name}`, parts),
  );
  return split.flat();
};

const packAssets = async (dir: URL): Promise<void> => {
  const parts = fileURLToPath(new URL('parts/', dir));
  await mkdir(cache, { recursive: true });
  await mkdir(parts, { recursive: true });
  const names = [
    ...(await packFolder(dir, '_astro/', parts)),
    ...(await packFolder(dir, 'compiler/', parts)),
  ];
  const list = new URL(listPath.slice(1), dir);
  await writeFile(fileURLToPath(list), JSON.stringify({ parts: [...new Set(names)] }));
};

export { packAssets };
