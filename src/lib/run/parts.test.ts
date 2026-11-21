import { describe, expect, test } from 'bun:test';

import { fetchInParts, type Fetch } from './parts';

const base = 'https://site.test/_astro/compiler.worker.js';
const hashOf = (index: number): string => String(index).repeat(64);
const ignore = (): void => {
  /* Parts are not counted in this test. */
};

interface Served {
  readonly asked: string[];
  readonly fetcher: Fetch;
}

const addressOf = (input: RequestInfo | URL): string => {
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
};

const serve = (files: Readonly<Record<string, () => Response>>): Served => {
  const asked: string[] = [];
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

const listing = (parts: readonly string[], size: number) => (): Response =>
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
    const fetchWhole = fetchInParts(fetcher, base, () => {
      parts += 1;
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
    const response = await fetchInParts(fetcher, base, ignore)('/compiler/std.pch');
    expect(asked).toEqual(['/compiler/std.pch.json']);
    expect(await readAll(response)).toBe('ab');
  });

  test('passes every other address through untouched', async () => {
    const { asked, fetcher } = serve({ '/api/intake': text('ok') });
    const response = await fetchInParts(fetcher, base, ignore)('/api/intake');
    expect(await response.text()).toBe('ok');
    expect(asked).toEqual(['/api/intake']);
  });

  test('refuses when the list is missing', async () => {
    const { fetcher } = serve({});
    expect(await failureOf(fetchInParts(fetcher, base, ignore)('/_astro/llvm.wasm'))).toContain(
      '/_astro/llvm.wasm.json answered 404',
    );
  });

  test.each([
    ['not an object', 'null'],
    ['a part that is not a hash', JSON.stringify({ parts: ['../secret'], size: 1 })],
    ['no size', JSON.stringify({ parts: [hashOf(1)] })],
  ])('refuses a list with %s', async (_reason, body) => {
    const { fetcher } = serve({ '/_astro/llvm.wasm.json': text(body) });
    expect(await failureOf(fetchInParts(fetcher, base, ignore)('/_astro/llvm.wasm'))).toContain(
      'is not a list of parts',
    );
  });

  test('fails the stream when a part cannot be fetched', async () => {
    const { fetcher } = serve({
      '/_astro/llvm.wasm.json': listing([hashOf(1), hashOf(2)], 2),
      [`/parts/${hashOf(1)}`]: text('a'),
    });
    const response = await fetchInParts(fetcher, base, ignore)('/_astro/llvm.wasm');
    expect(await failureOf(readAll(response))).toContain('part 1 answered 404');
  });

  test('fails the stream when the parts do not add up to the listed size', async () => {
    const { fetcher } = serve({
      '/_astro/llvm.wasm.json': listing([hashOf(1)], 5),
      [`/parts/${hashOf(1)}`]: text('abc'),
    });
    const response = await fetchInParts(fetcher, base, ignore)('/_astro/llvm.wasm');
    expect(await failureOf(readAll(response))).toContain('the parts add up to 3 bytes, not 5');
  });
});
