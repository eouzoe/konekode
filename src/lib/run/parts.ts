interface Manifest {
  readonly parts: readonly string[];
  readonly size: number;
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type Sink = ReadableStreamDefaultController<Uint8Array>;

const packed = /\.(?:pch|tar|wasm)$/u;
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

const copyRest = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  sink: Sink,
  length: number,
): Promise<number> => {
  const { done, value } = await reader.read();
  if (done) {
    return length;
  }
  sink.enqueue(value);
  return copyRest(reader, sink, length + value.length);
};

const copyPart = (response: Response, sink: Sink): Promise<number> => {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return Promise.reject(new Error('a part came without a body'));
  }
  return copyRest(reader, sink, 0);
};

interface Joining {
  readonly fetcher: Fetch;
  readonly manifest: Manifest;
  readonly onPart: () => void;
  readonly origin: URL;
}

const joinParts = ({ fetcher, manifest, onPart, origin }: Joining): ReadableStream<Uint8Array> => {
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
    const response = await fetcher(new URL(`/parts/${name}`, origin));
    if (!response.ok) {
      throw new Error(`part ${String(index)} answered ${String(response.status)}`);
    }
    received += await copyPart(response, sink);
    index += 1;
    onPart();
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
  (fetcher: Fetch, base: string, onPart: () => void): Fetch =>
  async (input, init) => {
    const url = addressOf(input, base);
    if (!packed.test(url.pathname)) {
      return fetcher(input, init);
    }
    const manifest = await readManifest(fetcher, url);
    const body = joinParts({ fetcher, manifest, onPart, origin: url });
    return new Response(body, {
      headers: { 'content-length': String(manifest.size), 'content-type': typeOf(url) },
    });
  };

export { fetchInParts, isManifest, type Fetch, type Manifest };
