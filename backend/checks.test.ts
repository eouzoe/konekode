import { expect, test } from 'bun:test';

import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/http';

import { checkAll, report, type Probe, type Result, type Target } from './checks';
import { intakeApp } from './intake';
import { intakeClosed, intakeOpen } from './limits';
import site, { type Env, type Fetcher } from './site';
import { Store, type Storage } from './store';

import type { Usage } from './budget';

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
  readonly served?: (path: string) => string;
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

const yearLong = 'public, max-age=31536000, immutable';

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
  if (path === '/_astro/app.js') {
    return new Response('import{v}from"./version.js";', {
      headers: { 'cache-control': yearLong },
    });
  }
  if (path.startsWith('/_astro/') || path.startsWith('/parts/')) {
    return new Response(null, { headers: { 'cache-control': yearLong }, status: 404 });
  }
  return new Response(page(shape.live), { headers: { ...kept, 'content-type': 'text/html' } });
};

const api: Fetcher = {
  fetch: async (request) => {
    const app = intakeApp.pipe(Layer.provide(Layer.succeed(Store, store)));
    const { dispose, handler } = HttpRouter.toWebHandler(app, { disableLogger: true });
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
      VERSION: shape.served?.(new URL(request.url).pathname) ?? version,
    };
    return compressed(request, await site.fetch(await onTheWire(request), env));
  };

const target = (live: boolean): Target => ({
  api: apiAddress,
  live,
  site: new URL(origin),
  version,
});

const failed = (results: ReadonlyArray<Result>): Array<string> =>
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

const githubAnswering =
  (answer: () => Promise<Response>, seen: Array<Request> = []) =>
  async (request: Request): Promise<Response> => {
    seen.push(request);
    if (request.url.startsWith('https://api.github.com/')) {
      return await answer();
    }
    return await fakeFetch({ intake: intakeOpen, live: false })(request);
  };

const limited = (): Promise<Response> =>
  Promise.resolve(Response.json({ message: 'API rate limit exceeded' }, { status: 403 }));

test('a refused GitHub answer fails only the branch check and says what GitHub said', async () => {
  const results = await checkAll({ fetch: githubAnswering(limited), target: target(false) });
  expect(failed(results)).toEqual(['GitHub 分支']);
  expect(report(results)).toContain('✘ GitHub 分支：GitHub 回 403：API rate limit exceeded');
  expect(results.map((each) => each.name)).toContain('上傳 204');
});

test('a check that throws is reported as failed while every other check still runs', async () => {
  const unreachable = (): Promise<Response> => Promise.reject(new Error('connection reset'));
  const results = await checkAll({ fetch: githubAnswering(unreachable), target: target(false) });
  expect(failed(results)).toEqual(['GitHub 分支']);
  expect(report(results)).toContain('connection reset');
  expect(results.map((each) => each.name)).toContain('版本');
});

test('a GitHub token goes to GitHub and to nothing else', async () => {
  const seen: Array<Request> = [];
  const branchesListed = (): Promise<Response> =>
    Promise.resolve(Response.json([{ name: 'dev' }, { name: 'main' }]));
  const results = await checkAll({
    fetch: githubAnswering(branchesListed, seen),
    githubToken: 'token-for-test',
    target: target(false),
  });
  expect(failed(results)).toEqual([]);
  const carrying = seen.filter((request) => request.headers.has('authorization'));
  expect(carrying.map((request) => new URL(request.url).hostname)).toEqual(['api.github.com']);
  expect(carrying[0]?.headers.get('authorization')).toBe('Bearer token-for-test');
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

interface Clock {
  at: number;
  readonly slept: Array<number>;
}

const clocked = (): [Clock, Pick<Probe, 'now' | 'sleep'>] => {
  const clock: Clock = { at: 0, slept: [] };
  return [
    clock,
    {
      now: () => clock.at,
      sleep: (milliseconds) => {
        clock.at += milliseconds;
        clock.slept.push(milliseconds);
        return Promise.resolve();
      },
    },
  ];
};

const lateMissing = (late: number): ((path: string) => string) => {
  const asked = new Map<string, number>();
  return (path) => {
    if (!path.startsWith('/_astro/does-not-exist') && !path.startsWith('/parts/')) {
      return version;
    }
    const times = (asked.get(path) ?? 0) + 1;
    asked.set(path, times);
    if (times > late) {
      return version;
    }
    return 'old0000';
  };
};

test('when the new version is already everywhere the checks start without sleeping', async () => {
  const [clock, timing] = clocked();
  const shape = { intake: intakeOpen, live: false };
  const results = await checkAll({ fetch: fakeFetch(shape), target: target(false), ...timing });
  expect(failed(results)).toEqual([]);
  expect(clock.slept).toEqual([]);
  expect(results[0]?.name).toBe('新版到位');
  expect(results.map((each) => each.name)).toContain('上傳 204');
});

test('a page already new while missing files still answer from the old version waits two rounds before checking', async () => {
  const [clock, timing] = clocked();
  const shape = { intake: intakeOpen, live: false, served: lateMissing(2) };
  const results = await checkAll({ fetch: fakeFetch(shape), target: target(false), ...timing });
  expect(failed(results)).toEqual([]);
  expect(clock.slept).toEqual([2000, 2000]);
  expect(results[0]?.detail).toContain('等了 4 秒');
  expect(results.map((each) => each.name)).toContain('缺檔不快取');
});

test('a version that never arrives fails after sixty seconds, names what each kind answered and runs nothing else', async () => {
  const [clock, timing] = clocked();
  const shape = { intake: intakeOpen, live: false, served: lateMissing(Infinity) };
  const results = await checkAll({ fetch: fakeFetch(shape), target: target(false), ...timing });
  expect(results.map((each) => each.name)).toEqual(['新版到位']);
  expect(failed(results)).toEqual(['新版到位']);
  expect(clock.at).toBe(60_000);
  const [arrival] = results;
  expect(arrival?.detail).toContain('等了 60 秒');
  expect(arrival?.detail).toContain('頁面的程式：abc1234');
  expect(arrival?.detail).toContain('/learn/start/：abc1234');
  expect(arrival?.detail).toContain('/parts/0000000000000000：old0000');
  expect(arrival?.detail).toContain('/_astro/does-not-exist-0000.js：old0000');
  expect(report(results)).toContain('✘ 新版到位');
});
