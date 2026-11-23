const packageName = 'konekode-engine';
const root = new URL('../../../', import.meta.url).pathname;
const scratch = `${root}node_modules/.cache/engine-verify/`;
const releasePattern =
  /^https:\/\/github\.com\/(?<repository>[^/]+\/[^/]+)\/releases\/download\/[^/]+\/(?<file>[^/]+\.tgz)$/u;

const fail = (message: string): never => {
  throw new Error(message);
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fieldOf = (value: unknown, key: string): unknown => {
  if (isRecord(value)) {
    return value[key];
  }
  return undefined;
};

const dependencyUrl = async (): Promise<string> => {
  const manifest: unknown = await Bun.file(`${root}package.json`).json();
  const url = fieldOf(fieldOf(manifest, 'dependencies'), packageName);
  if (typeof url === 'string') {
    return url;
  }
  return fail(`package.json has no ${packageName} dependency`);
};

const lockedIntegrity = async (url: string): Promise<string> => {
  const lock = await Bun.file(`${root}bun.lock`).text();
  const entry = `"${packageName}@${url}", {}, "`;
  const [, rest] = lock.split(entry);
  const [integrity] = rest?.split('"') ?? [];
  return integrity ?? fail(`bun.lock does not pin ${url}`);
};

const download = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    return fail(`${url} answered ${String(response.status)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

const integrityOf = (bytes: Uint8Array): string =>
  `sha512-${new Bun.CryptoHasher('sha512').update(bytes).digest('base64')}`;

const url = await dependencyUrl();
const { file = fail(`${url} is not a GitHub release asset`), repository = '' } =
  releasePattern.exec(url)?.groups ?? {};
const [locked, bytes] = await Promise.all([lockedIntegrity(url), download(url)]);
const actual = integrityOf(bytes);
if (actual !== locked) {
  fail(`${url} has ${actual}, bun.lock pins ${locked}`);
}
const path = `${scratch}${file}`;
await Bun.write(path, bytes);
await Bun.$`gh attestation verify ${path} --repo ${repository}`;
