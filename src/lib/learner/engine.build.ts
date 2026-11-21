type Table = Readonly<Record<string, unknown>>;

interface Copied {
  readonly built: string;
  readonly sha256: string;
}

const root = process.argv[2] ?? new URL('../../../../konekode-engine', import.meta.url).pathname;
const target = new URL('../../vendor/konekode-engine/', import.meta.url).pathname;
const builtNames = [
  'konekode_wasm.js',
  'konekode_wasm.d.ts',
  'konekode_wasm_bg.wasm',
  'konekode_wasm_bg.wasm.d.ts',
];
const licenceNames = ['LICENSE-APACHE', 'LICENSE-MIT'];
const indent = 2;

const isTable = (value: unknown): value is Table =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const tableAt = (table: Table, key: string): Table => {
  const value = table[key];
  if (isTable(value)) {
    return value;
  }
  return {};
};

const readToml = async (path: string): Promise<Table> => {
  const text = await Bun.file(path).text();
  const parsed: unknown = Bun.TOML.parse(text);
  if (isTable(parsed)) {
    return parsed;
  }
  return {};
};

const pathOf = (spec: unknown): string | null => {
  if (isTable(spec) && typeof spec.path === 'string') {
    return spec.path;
  }
  return null;
};

const localDependencies = async (folder: string, shared: Table): Promise<string[]> => {
  const manifest = await readToml(`${root}/${folder}/Cargo.toml`);
  return Object.entries(tableAt(manifest, 'dependencies')).flatMap(([name, spec]) => {
    const direct = pathOf(spec);
    if (direct !== null) {
      const resolved = new URL(direct, `file:///${folder}/`).pathname;
      return [resolved.slice(1).replace(/\/$/u, '')];
    }
    const inherited = pathOf(shared[name]);
    if (inherited !== null) {
      return [inherited];
    }
    return [];
  });
};

const crateFolders = async (folder: string, shared: Table, seen: Set<string>): Promise<void> => {
  if (seen.has(folder)) {
    return;
  }
  seen.add(folder);
  const next = await localDependencies(folder, shared);
  await Promise.all(
    next.map(async (other) => {
      await crateFolders(other, shared, seen);
    }),
  );
};

const refuseUncommitted = async (): Promise<void> => {
  const workspace = await readToml(`${root}/Cargo.toml`);
  const shared = tableAt(tableAt(workspace, 'workspace'), 'dependencies');
  const seen = new Set<string>();
  await crateFolders('crates/wasm', shared, seen);
  const watched = [...seen, 'Cargo.toml', 'Cargo.lock'];
  const changed = await Bun.$`git status --porcelain -- ${watched}`.cwd(root).text();
  if (changed.trim() !== '') {
    throw new Error(`the engine has uncommitted changes the build may include:\n${changed}`);
  }
};

const copyBuilt = async (name: string): Promise<[string, Copied]> => {
  const source = Bun.file(`${root}/pkg/${name}`);
  const bytes = await source.arrayBuffer();
  await Bun.write(`${target}${name}`, bytes);
  const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  return [name, { built: new Date(source.lastModified).toISOString(), sha256 }];
};

const copyLicence = async (name: string): Promise<void> => {
  await Bun.write(`${target}${name}`, Bun.file(`${root}/${name}`));
};

await refuseUncommitted();
const head = await Bun.$`git rev-parse HEAD`.cwd(root).text();
await Bun.$`rm -rf ${target}`;
const copied = await Promise.all(builtNames.map((name) => copyBuilt(name)));
await Promise.all(
  licenceNames.map(async (name) => {
    await copyLicence(name);
  }),
);
const source = {
  commit: head.trim(),
  files: Object.fromEntries(copied),
  repository: 'konekode-engine',
};
await Bun.write(`${target}source.json`, `${JSON.stringify(source, null, indent)}\n`);
