const assets = '_astro/';
const staticImport = /(?:from|import)\s*"\.\/(?<name>[\w.-]+\.js)"/gu;
const wasmName = /(?<name>[\w.-]+\.wasm)/gu;
const compiler = 'llvm';
const entry = /<(?:script[^>]+src|link[^>]+href)="\/(?<path>_astro\/[^"]+)"/gu;

const namesIn = (text: string, pattern: RegExp): Array<string> =>
  [...text.matchAll(pattern)]
    .map((match) => match.groups?.name ?? '')
    .filter((name) => name !== '');

const neighbours = async (dir: URL, name: string): Promise<Array<string>> => {
  if (!name.endsWith('.js')) {
    return [];
  }
  const text = await Bun.file(new URL(`${assets}${name}`, dir)).text();
  const wasm = namesIn(text, wasmName).filter((found) => !found.startsWith(compiler));
  return [...namesIn(text, staticImport), ...wasm];
};

const closure = async (
  dir: URL,
  start: ReadonlyArray<string>,
  seen: ReadonlySet<string>,
): Promise<ReadonlySet<string>> => {
  const fresh = [...new Set(start)].filter((name) => !seen.has(name));
  if (fresh.length === 0) {
    return seen;
  }
  const next = await Promise.all(fresh.map((name) => neighbours(dir, name)));
  return closure(dir, next.flat(), new Set([...seen, ...fresh]));
};

const coreFiles = async (dir: URL, start: ReadonlyArray<string>): Promise<Array<string>> =>
  [...(await closure(dir, start, new Set()))].toSorted().map((name) => `/${assets}${name}`);

const pagePath = (file: string): string => `/${file.replace(/index\.html$/u, '')}`;

const pageCore = async (dir: URL, file: string): Promise<[string, Array<string>]> => {
  const html = await Bun.file(new URL(file, dir)).text();
  const entries = [...html.matchAll(entry)]
    .map((match) => match.groups?.path ?? '')
    .filter((path) => path !== '')
    .map((path) => path.slice(assets.length));
  return [pagePath(file), await coreFiles(dir, entries)];
};

const coreOf = async (dir: URL): Promise<Record<string, Array<string>>> => {
  const glob = new Bun.Glob('**/index.html');
  const files = await Array.fromAsync(glob.scan({ cwd: Bun.fileURLToPath(dir) }));
  const pages = await Promise.all(files.map((file) => pageCore(dir, file)));
  return Object.fromEntries(pages);
};

const buildWorker = async (dir: URL): Promise<void> => {
  const built = await Bun.build({
    define: { 'process.env.NODE_ENV': '"production"' },
    entrypoints: [Bun.fileURLToPath(new URL('../../../sw/sw.ts', import.meta.url))],
    format: 'iife',
    minify: true,
    target: 'browser',
  });
  const [output] = built.outputs;
  if (!built.success || output === undefined) {
    throw new AggregateError(built.logs, 'the service worker did not build');
  }
  await Bun.write(new URL('sw.js', dir), output);
};

const finishOffline = async (dir: URL): Promise<void> => {
  await buildWorker(dir);
  await Bun.write(new URL('core.json', dir), JSON.stringify(await coreOf(dir)));
};

export { finishOffline };
