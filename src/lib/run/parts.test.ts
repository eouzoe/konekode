import { describe, expect, test } from 'bun:test';

import brotliPromise from 'brotli-dec-wasm';

import { fetchInParts, type Fetch } from './parts';

const base = 'https://site.test/_astro/compiler.worker.js';
const hashOf = (index: number): string => String(index).repeat(64);
const same = (bytes: Uint8Array): Uint8Array => bytes;
const brotliParts: Readonly<Record<string, ReadonlyArray<number>>> = {
  'int main() ': [11, 5, 128, 105, 110, 116, 32, 109, 97, 105, 110, 40, 41, 32, 3],
  '{': [11, 0, 128, 123, 3],
};
const packedPart = (body: string) => (): Response =>
  new Response(new Uint8Array(brotliParts[body] ?? []));
const ignore = (): void => {
  /* Parts are not counted in this test. */
};

interface Served {
  readonly asked: Array<string>;
  readonly fetcher: Fetch;
}

const addressOf = (input: RequestInfo | URL): string => {
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
};

const serve = (files: Readonly<Record<string, () => Response>>): Served => {
  const asked: Array<string> = [];
  const fetcher: Fetch = (input) => {
    const path = new URL(addressOf(input), base).pathname;
    asked.push(path);
    const found = files[path];
    if (found === undefined) {
      return Promise.resolve(new Response('missing', { status: 404 }));
    }
    return Promise.resolve(found());
  };
  return { asked, fetcher };
};

const text = (body: string) => (): Response => new Response(body);

const listing = (parts: ReadonlyArray<string>, size: number) => (): Response =>
  Response.json({ parts, size });

const readAll = (response: Response): Promise<string> => response.text();

const failureOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return String(error);
  }
  return 'no failure';
};

describe('fetchInParts', () => {
  test('joins the listed parts, in order, into one response of the original type', async () => {
    const { asked, fetcher } = serve({
      '/_astro/llvm.wasm.json': listing([hashOf(1), hashOf(2), hashOf(3)], 9),
      [`/parts/${hashOf(1)}`]: text('abc'),
      [`/parts/${hashOf(2)}`]: text('def'),
      [`/parts/${hashOf(3)}`]: text('ghi'),
    });
    let parts = 0;
    const fetchWhole = fetchInParts({
      base,
      decode: same,
      fetcher,
      onPart: () => {
        parts += 1;
      },
    });
    const response = await fetchWhole(new URL('/_astro/llvm.wasm', base));
    expect(response.headers.get('content-type')).toBe('application/wasm');
    expect(response.headers.get('content-length')).toBe('9');
    expect(await readAll(response)).toBe('abcdefghi');
    expect(parts).toBe(3);
    expect(asked).toEqual([
      '/_astro/llvm.wasm.json',
      `/parts/${hashOf(1)}`,
      `/parts/${hashOf(2)}`,
      `/parts/${hashOf(3)}`,
    ]);
  });

  test('asks for a part only when the reader is ready for it', async () => {
    const { asked, fetcher } = serve({
      '/compiler/std.pch.json': listing([hashOf(1), hashOf(2)], 2),
      [`/parts/${hashOf(1)}`]: text('a'),
      [`/parts/${hashOf(2)}`]: text('b'),
    });
    const response = await fetchInParts({
      base,
      decode: same,
      fetcher,
      onPart: ignore,
    })('/compiler/std.pch');
    expect(asked).toEqual(['/compiler/std.pch.json']);
    expect(await readAll(response)).toBe('ab');
  });

  test('passes every other address through untouched', async () => {
    const { asked, fetcher } = serve({ '/api/intake': text('ok') });
    const response = await fetchInParts({
      base,
      decode: same,
      fetcher,
      onPart: ignore,
    })('/api/intake');
    expect(await response.text()).toBe('ok');
    expect(asked).toEqual(['/api/intake']);
  });

  test('passes other WebAssembly, such as the decoder, through untouched', async () => {
    const { asked, fetcher } = serve({
      '/_astro/brotli_dec_wasm_bg-a1.wasm': text('wasm'),
    });
    const response = await fetchInParts({
      base,
      decode: same,
      fetcher,
      onPart: ignore,
    })('/_astro/brotli_dec_wasm_bg-a1.wasm');
    expect(await response.text()).toBe('wasm');
    expect(asked).toEqual(['/_astro/brotli_dec_wasm_bg-a1.wasm']);
  });

  test('decodes every part with the Brotli decoder before joining them', async () => {
    const brotli = await brotliPromise;
    const { fetcher } = serve({
      '/_astro/llvm.core-x.wasm.json': listing([hashOf(1), hashOf(2)], 12),
      [`/parts/${hashOf(1)}`]: packedPart('int main() '),
      [`/parts/${hashOf(2)}`]: packedPart('{'),
    });
    const response = await fetchInParts({
      base,
      decode: (bytes) => brotli.decompress(bytes),
      fetcher,
      onPart: ignore,
    })('/_astro/llvm.core-x.wasm');
    expect(await readAll(response)).toBe('int main() {');
  });

  test('refuses when the list is missing', async () => {
    const { fetcher } = serve({});
    expect(
      await failureOf(
        fetchInParts({ base, decode: same, fetcher, onPart: ignore })('/_astro/llvm.wasm'),
      ),
    ).toContain('/_astro/llvm.wasm.json answered 404');
  });

  test.each([
    ['not an object', 'null'],
    ['a part that is not a hash', JSON.stringify({ parts: ['../secret'], size: 1 })],
    ['no size', JSON.stringify({ parts: [hashOf(1)] })],
  ])('refuses a list with %s', async (_reason, body) => {
    const { fetcher } = serve({ '/_astro/llvm.wasm.json': text(body) });
    expect(
      await failureOf(
        fetchInParts({ base, decode: same, fetcher, onPart: ignore })('/_astro/llvm.wasm'),
      ),
    ).toContain('is not a list of parts');
  });

  test('fails the stream when a part cannot be fetched', async () => {
    const { fetcher } = serve({
      '/_astro/llvm.wasm.json': listing([hashOf(1), hashOf(2)], 2),
      [`/parts/${hashOf(1)}`]: text('a'),
    });
    const response = await fetchInParts({
      base,
      decode: same,
      fetcher,
      onPart: ignore,
    })('/_astro/llvm.wasm');
    expect(await failureOf(readAll(response))).toContain('part 1 answered 404');
  });

  test('fails the stream when the parts do not add up to the listed size', async () => {
    const { fetcher } = serve({
      '/_astro/llvm.wasm.json': listing([hashOf(1)], 5),
      [`/parts/${hashOf(1)}`]: text('abc'),
    });
    const response = await fetchInParts({
      base,
      decode: same,
      fetcher,
      onPart: ignore,
    })('/_astro/llvm.wasm');
    expect(await failureOf(readAll(response))).toContain('the parts add up to 3 bytes, not 5');
  });
});
