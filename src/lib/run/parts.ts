import { packed } from './packed';

interface Manifest {
  readonly parts: readonly string[];
  readonly size: number;
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type Decode = (bytes: Uint8Array) => Uint8Array;

type Sink = ReadableStreamDefaultController<Uint8Array>;

const partName = /^[\da-f]{64}$/u;
const kindOf = /\.(?<kind>\w+)$/u;

const types: Readonly<Record<string, string>> = {
  pch: 'application/octet-stream',
  tar: 'application/x-tar',
  wasm: 'application/wasm',
};

const isManifest = (value: unknown): value is Manifest =>
  typeof value === 'object' &&
  value !== null &&
  'parts' in value &&
  'size' in value &&
  Array.isArray(value.parts) &&
  value.parts.every((name) => typeof name === 'string' && partName.test(name)) &&
  typeof value.size === 'number';

const addressOf = (input: RequestInfo | URL, base: string): URL => {
  if (input instanceof Request) {
    return new URL(input.url);
  }
  return new URL(input, base);
};

const typeOf = (url: URL): string => types[kindOf.exec(url.pathname)?.groups?.kind ?? ''] ?? '';

const readManifest = async (fetcher: Fetch, url: URL): Promise<Manifest> => {
  const response = await fetcher(new URL(`${url.pathname}.json`, url));
  if (!response.ok) {
    throw new Error(`${url.pathname}.json answered ${String(response.status)}`);
  }
  const manifest: unknown = await response.json();
  if (!isManifest(manifest)) {
    throw new TypeError(`${url.pathname}.json is not a list of parts`);
  }
  return manifest;
};

interface Options {
  readonly base: string;
  readonly decode: Decode;
  readonly fetcher: Fetch;
  readonly onPart: () => void;
}

interface Joining {
  readonly manifest: Manifest;
  readonly options: Options;
  readonly origin: URL;
}

const joinParts = ({ manifest, options, origin }: Joining): ReadableStream<Uint8Array> => {
  let index = 0;
  let received = 0;
  const finish = (sink: Sink): void => {
    if (received !== manifest.size) {
      throw new Error(
        `the parts add up to ${String(received)} bytes, not ${String(manifest.size)}`,
      );
    }
    sink.close();
  };
  const next = async (sink: Sink, name: string): Promise<void> => {
    const response = await options.fetcher(new URL(`/parts/${name}`, origin));
    if (!response.ok) {
      throw new Error(`part ${String(index)} answered ${String(response.status)}`);
    }
    const bytes = options.decode(new Uint8Array(await response.arrayBuffer()));
    sink.enqueue(bytes);
    received += bytes.length;
    index += 1;
    options.onPart();
  };
  return new ReadableStream<Uint8Array>(
    {
      async pull(sink) {
        const name = manifest.parts[index];
        if (name === undefined) {
          finish(sink);
          return;
        }
        await next(sink, name);
      },
    },
    { highWaterMark: 0 },
  );
};

const fetchInParts =
  (options: Options): Fetch =>
  async (input, init) => {
    const url = addressOf(input, options.base);
    if (!packed.test(url.pathname)) {
      return options.fetcher(input, init);
    }
    const manifest = await readManifest(options.fetcher, url);
    const body = joinParts({ manifest, options, origin: url });
    return new Response(body, {
      headers: {
        'content-length': String(manifest.size),
        'content-type': typeOf(url),
      },
    });
  };

export { fetchInParts, isManifest, type Decode, type Fetch, type Manifest };
