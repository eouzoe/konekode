import { expect, test } from 'bun:test';

import { Effect } from 'effect';
import { HttpRouter } from 'effect/http';

import { type Usage } from './budget';
import { checkAll, report, type Result, type Target } from './checks';
import { intakeFor } from './intake';
import { intakeClosed, intakeOpen } from './limits';
import site, { type Env, type Fetcher } from './site';
import { type Storage } from './store';

const origin = 'https://cp-preview.example.workers.dev';
const apiAddress = 'https://cp-api.example.workers.dev/';
const version = 'abc1234';
const unused: Usage = { batches: 0, bytes: 0 };
const headers = {
  'content-security-policy': "default-src 'self'",
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};
const store: Storage = {
  keep: () => Effect.void,
  spent: () => Effect.succeed({ actor: unused, network: unused }),
};

interface Shape {
  readonly dropHeader?: string;
  readonly intake: string;
  readonly live: boolean;
}

const robotsMeta = (live: boolean): string => {
  if (live) {
    return 'index, follow';
  }
  return 'noindex, nofollow';
};

const robotsText = (live: boolean): string => {
  if (live) {
    return 'User-agent: *\nAllow: /\n';
  }
  return 'User-agent: *\nDisallow: /\n';
};

const page = (live: boolean): string =>
  `<html><head><meta name="robots" content="${robotsMeta(live)}"><script type="module" src="/_astro/app.js"></script></head></html>`;

const asset = (path: string, shape: Shape): Response => {
  const kept = Object.fromEntries(
    Object.entries(headers).filter(([name]) => name !== shape.dropHeader),
  );
  if (path === '/robots.txt') {
    return new Response(robotsText(shape.live), { headers: kept });
  }
  if (path === '/_astro/version.js') {
    return new Response(`const v=\`${version}\``);
  }
  if (path.startsWith('/_astro/')) {
    return new Response('import{v}from"./version.js";', {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    });
  }
  return new Response(page(shape.live), { headers: { ...kept, 'content-type': 'text/html' } });
};

const api: Fetcher = {
  fetch: async (request) => {
    const { dispose, handler } = HttpRouter.toWebHandler(intakeFor(store));
    const response = await handler(request);
    await dispose();
    return response;
  },
};

const onTheWire = async (request: Request): Promise<Request> => {
  if (request.body === null) {
    return request;
  }
  const body = await request.arrayBuffer();
  const sent = new Headers(request.headers);
  sent.set('content-length', String(body.byteLength));
  return new Request(request.url, { body, headers: sent, method: request.method });
};

const compressed = (request: Request, response: Response): Response => {
  if (!(request.headers.get('accept-encoding') ?? '').includes('gzip')) {
    return response;
  }
  const encoded = new Response(response.body, response);
  encoded.headers.set('content-encoding', 'gzip');
  return encoded;
};

const fakeFetch =
  (shape: Shape) =>
  async (request: Request): Promise<Response> => {
    if (request.url.startsWith('https://api.github.com/')) {
      return Response.json([{ name: 'dev' }, { name: 'main' }]);
    }
    if (request.url === apiAddress) {
      return new Response('nothing here', { status: 404 });
    }
    const env: Env = {
      API: api,
      ASSETS: { fetch: (inner) => Promise.resolve(asset(new URL(inner.url).pathname, shape)) },
      INTAKE: shape.intake,
    };
    return compressed(request, await site.fetch(await onTheWire(request), env));
  };

const target = (live: boolean): Target => ({
  api: apiAddress,
  live,
  local: true,
  site: new URL(origin),
  token: null,
  version,
});

const failed = (results: readonly Result[]): string[] =>
  results.filter((each) => !each.passed).map((each) => each.name);

test('a preview built and declared as intended passes every check', async () => {
  const shape = { intake: intakeOpen, live: false };
  const results = await checkAll({ fetch: fakeFetch(shape), target: target(false) });
  expect(failed(results)).toEqual([]);
  expect(results.map((each) => each.name)).toContain('上傳 204');
});

test('prod passes with the intake closed for a year and the pages open to search', async () => {
  const shape = { intake: intakeClosed, live: true };
  const results = await checkAll({ fetch: fakeFetch(shape), target: target(true) });
  expect(failed(results)).toEqual([]);
  expect(results.map((each) => each.name)).toContain('入口關著的 Retry-After');
});

test('a missing header and an open intake on prod are named in the report', async () => {
  const shape = { dropHeader: 'x-frame-options', intake: intakeOpen, live: true };
  const results = await checkAll({ fetch: fakeFetch(shape), target: target(true) });
  expect(failed(results)).toEqual([
    '安全標頭 /',
    '安全標頭 /learn/start/',
    '入口關著',
    '入口關著的 Retry-After',
  ]);
  expect(report(results)).toContain('✘ 安全標頭 /：少了：x-frame-options');
});
