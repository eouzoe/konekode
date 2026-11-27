import { expect, test } from 'bun:test';

import { assert, asyncProperty, constantFrom, integer, stringMatching, tuple } from 'fast-check';

import { bodyLimit, closedFor, intakeContentType, intakeOpen as open, intakePath } from './limits';
import site, { type Env, type Fetcher } from './site';

const origin = 'https://example.test';
const ticket = 'actor=a&session=b&site=c&kind=events&encoding=gzip&seq=1';
const address = `${origin}${intakePath}?${ticket}`;

interface Seen {
  readonly api: Array<Request>;
  readonly assets: Array<Request>;
}

const fetcher = (seen: Array<Request>, answer: () => Response): Fetcher => ({
  fetch: (request) => {
    seen.push(request);
    return Promise.resolve(answer());
  },
});

const environment = (intake: string): [Env, Seen] => {
  const seen: Seen = { api: [], assets: [] };
  const env: Env = {
    API: fetcher(seen.api, () => new Response(null, { status: 204 })),
    ASSETS: fetcher(seen.assets, () => new Response('page')),
    INTAKE: intake,
  };
  return [env, seen];
};

const html = (): Response =>
  new Response('<html><body></body></html>', { headers: { 'content-type': 'text/html' } });

const answer = (request: Request, env: Env): Promise<Response> =>
  Promise.resolve(site.fetch(request, env));

test('while the intake is closed every upload is told to wait a year and nothing reaches the backend', async () => {
  const [env, seen] = environment('closed');
  const response = await answer(new Request(address, { body: 'x', method: 'POST' }), env);
  expect(response.status).toBe(429);
  expect(response.headers.get('retry-after')).toBe(String(closedFor));
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(seen.api).toEqual([]);
});

test('an open intake forwards a same-site upload as bytes whatever type the browser sent', async () => {
  const [env, seen] = environment(open);
  const sent = [
    new Request(address, { body: 'x', method: 'POST' }),
    new Request(address, {
      body: 'x',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      method: 'POST',
    }),
    new Request(address, {
      body: 'x',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'sec-fetch-site': 'same-origin',
      },
      method: 'POST',
    }),
  ];
  const answers = await Promise.all(sent.map((request) => answer(request, env)));
  expect(answers.map((response) => response.status)).toEqual([204, 204, 204]);
  expect(seen.api.map((request) => request.headers.get('content-type'))).toEqual([
    intakeContentType,
    intakeContentType,
    intakeContentType,
  ]);
  expect(seen.api.map((request) => new URL(request.url).search)).toEqual(
    Array.from({ length: 3 }, () => `?${ticket}`),
  );
});

test('anything but a same-site POST of a sane size is refused before the backend', async () => {
  const [env, seen] = environment(open);
  const refused = [
    [new Request(address), 405],
    [
      new Request(address, {
        body: 'x',
        headers: { origin: 'https://elsewhere.test' },
        method: 'POST',
      }),
      403,
    ],
    [
      new Request(address, {
        body: 'x',
        headers: { 'sec-fetch-site': 'cross-site' },
        method: 'POST',
      }),
      403,
    ],
    [
      new Request(address, {
        body: 'x',
        headers: { 'content-length': String(bodyLimit + 1) },
        method: 'POST',
      }),
      413,
    ],
  ] as const;
  const answers = await Promise.all(refused.map(([request]) => answer(request, env)));
  expect(answers.map((response) => response.status)).toEqual(refused.map(([, code]) => code));
  expect(seen.api).toEqual([]);
});

test('no other path under /api/ reaches the backend', async () => {
  const [env, seen] = environment(open);
  const paths = ['/api/', '/api/anything', '/api/intake/more'];
  const requests = paths.map(
    (path) => new Request(`${origin}${path}`, { body: 'x', method: 'POST' }),
  );
  const answers = await Promise.all(requests.map((request) => answer(request, env)));
  expect(answers.map((response) => response.status)).toEqual([404, 404, 404]);
  expect(seen.api).toEqual([]);
  expect(seen.assets).toEqual([]);
});

test('anything that is not a page comes from the assets as it is', async () => {
  const [env, seen] = environment('closed');
  const response = await answer(new Request(`${origin}/learn/start/`), env);
  expect(await response.text()).toBe('page');
  expect(seen.assets).toHaveLength(1);
});

test('a page is marked with the platform it is opened on', async () => {
  const seen: Array<Request> = [];
  const env: Env = {
    API: fetcher([], () => new Response(null, { status: 204 })),
    ASSETS: fetcher(seen, html),
    INTAKE: 'closed',
  };
  const request = new Request(`${origin}/learn/start/`, {
    headers: { 'sec-ch-ua-platform': '"macOS"' },
  });
  const response = await answer(request, env);
  expect(await response.text()).toContain('class="on-mac"');
  expect(response.headers.get('vary')).toContain('Sec-CH-UA-Platform');
});

test('whatever the backend answers, the site adds nosniff before it leaves', async () => {
  const plain = new Response('Bad Request', { status: 400 });
  const env: Env = {
    API: fetcher([], () => plain),
    ASSETS: fetcher([], () => new Response('page')),
    INTAKE: open,
  };
  const request = new Request(address, {
    body: 'x',
    headers: { origin },
    method: 'POST',
  });
  const response = await answer(request, env);
  expect(response.status).toBe(400);
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
});

const longCache = 'public, max-age=31536000, immutable';
const assetPath = tuple(
  constantFrom('/_astro/', '/parts/', '/', '/learn/'),
  stringMatching(/^[a-z0-9.-]{0,24}$/u),
).map(([prefix, rest]) => `${prefix}${rest}`);

const assetsAnswering = (status: number): Env => ({
  API: fetcher([], () => new Response(null, { status: 204 })),
  ASSETS: fetcher(
    [],
    () => new Response(null, { headers: { 'cache-control': longCache }, status }),
  ),
  INTAKE: open,
});

test('an error from the static assets is never kept by a cache, whatever the path', async () => {
  await assert(
    asyncProperty(assetPath, integer({ max: 599, min: 400 }), async (path, status) => {
      const response = await answer(new Request(`${origin}${path}`), assetsAnswering(status));
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }),
  );
});

test('a successful static asset keeps the cache rule it was served with', async () => {
  await assert(
    asyncProperty(assetPath, integer({ max: 299, min: 200 }), async (path, status) => {
      const response = await answer(new Request(`${origin}${path}`), assetsAnswering(status));
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe(longCache);
    }),
  );
});
