import { Option, Schema } from 'effect';

import { bodyLimit, closedFor, intakePath, status, versionHeader } from './limits';

interface Target {
  readonly api: string | null;
  readonly live: boolean;
  readonly site: URL;
  readonly version: string | null;
}

interface Result {
  readonly detail: string;
  readonly name: string;
  readonly passed: boolean;
}

type Fetch = (input: Request) => Promise<Response>;

interface Probe {
  readonly fetch: Fetch;
  readonly githubToken?: string | undefined;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly target: Target;
}

const ok = 200;
const firstError = 400;
const securityHeaders = [
  'content-security-policy',
  'cross-origin-opener-policy',
  'permissions-policy',
  'referrer-policy',
  'x-content-type-options',
  'x-frame-options',
];
const pages = ['/', '/learn/start/'];
const otherApiPaths = ['/api/', '/api/anything'];
const branches = 'dev,main';
const repository = 'https://api.github.com/repos/eouzoe/konekode/branches';
const identifier = '00000000-0000-4000-8000-000000000000';
const someBytes = new TextEncoder().encode('deploy check');
const scriptPattern = /"(?<path>\/_astro\/[^"]+\.js)"/gu;
const importPattern = /"\.\/(?<name>[^"]+\.js)"/gu;
const robotsPattern = /<meta name="robots" content="(?<value>[^"]+)"/u;
const branchList = Schema.Array(Schema.Struct({ name: Schema.String }));

const result = (name: string, passed: boolean, detail: string): Result => ({
  detail,
  name,
  passed,
});

const shown = (values: ReadonlyArray<string>): string => {
  if (values.length === 0) {
    return '無';
  }
  return values.join(', ');
};

const send = (probe: Probe, path: string, init: RequestInit = {}): Promise<Response> =>
  probe.fetch(new Request(new URL(path, probe.target.site), init));

const textOf = async (probe: Probe, path: string): Promise<string> => {
  const response = await send(probe, path);
  return response.text();
};

const pageResults = async (probe: Probe, path: string): Promise<Array<Result>> => {
  const response = await send(probe, path);
  const html = await response.text();
  const missing = securityHeaders.filter((header) => !response.headers.has(header));
  const robots = robotsPattern.exec(html)?.groups?.value ?? '';
  return [
    result(`頁面 ${path}`, response.status === ok, `回 ${String(response.status)}`),
    result(`安全標頭 ${path}`, missing.length === 0, `少了：${shown(missing)}`),
    result(`收錄 ${path}`, robots.startsWith('index') === probe.target.live, `robots：${robots}`),
  ];
};

const site = async (probe: Probe): Promise<Array<Result>> => {
  const each = await Promise.all(pages.map((path) => pageResults(probe, path)));
  const robots = await textOf(probe, '/robots.txt');
  const closed = robots.split('\n').some((line) => line.trim() === 'Disallow: /');
  const packed = await send(probe, '/', { headers: { 'accept-encoding': 'gzip, br' } });
  const encoding = packed.headers.get('content-encoding') ?? '';
  return [
    ...each.flat(),
    result('robots.txt', closed !== probe.target.live, `全擋：${String(closed)}`),
    result('壓縮', ['br', 'gzip'].includes(encoding), `content-encoding：${encoding}`),
  ];
};

const scriptsOf = async (probe: Probe): Promise<Array<string>> => {
  const html = await textOf(probe, '/learn/start/');
  const paths = [...html.matchAll(scriptPattern)].map((match) => match.groups?.path ?? '');
  return [...new Set(paths)];
};

const scriptTexts = async (
  probe: Probe,
  scripts: ReadonlyArray<string>,
): Promise<Array<string>> => {
  const first = await Promise.all(scripts.map((path) => textOf(probe, path)));
  const imported = first.flatMap((text) =>
    [...text.matchAll(importPattern)].map((match) => `/_astro/${match.groups?.name ?? ''}`),
  );
  const second = [...new Set(imported)].filter((path) => !scripts.includes(path));
  return [...first, ...(await Promise.all(second.map((path) => textOf(probe, path))))];
};

const versionResult = async (
  probe: Probe,
  scripts: ReadonlyArray<string>,
): Promise<Array<Result>> => {
  const { version } = probe.target;
  if (version === null) {
    return [];
  }
  const texts = await scriptTexts(probe, scripts);
  const found = texts.some((text) => text.includes(version));
  return [result('版本', found, `頁面的程式裡有「${version}」：${String(found)}`)];
};

const missingAssets = ['/_astro/does-not-exist-0000.js', '/parts/0000000000000000'];
const notFound = 404;

const missingResult = async (probe: Probe, path: string): Promise<Result> => {
  const response = await send(probe, path);
  const cache = response.headers.get('cache-control') ?? '';
  return result(
    '缺檔不快取',
    response.status === notFound && !cache.includes('max-age=31536000'),
    `${path}：${String(response.status)}，${cache}`,
  );
};

const assets = async (probe: Probe): Promise<Array<Result>> => {
  const scripts = await scriptsOf(probe);
  const [first = '/none'] = scripts;
  const response = await send(probe, first);
  const cache = response.headers.get('cache-control') ?? '';
  return [
    result('靜態檔快取', cache.includes('immutable'), `${first}：${cache}`),
    ...(await Promise.all(missingAssets.map((path) => missingResult(probe, path)))),
    ...(await versionResult(probe, scripts)),
  ];
};

const ticketQuery = (): string =>
  new URLSearchParams({
    actor: identifier,
    encoding: 'identity',
    kind: 'events',
    seq: '1',
    session: identifier,
    site: 'deploy-check',
  }).toString();

const post = (
  probe: Probe,
  body: BodyInit,
  from: string = probe.target.site.origin,
): Promise<Response> =>
  send(probe, `${intakePath}?${ticketQuery()}`, {
    body,
    headers: { origin: from },
    method: 'POST',
  });

const expectStatus = (name: string, response: Response, wanted: number): Result =>
  result(name, response.status === wanted, `回 ${String(response.status)}，應該 ${String(wanted)}`);

const closedIntake = async (probe: Probe): Promise<Array<Result>> => {
  const response = await post(probe, someBytes);
  const retry = response.headers.get('retry-after') ?? '';
  return [
    expectStatus('入口關著', response, status.closed),
    result('入口關著的 Retry-After', retry === String(closedFor), `retry-after：${retry}`),
  ];
};

const openIntake = async (probe: Probe): Promise<Array<Result>> => {
  const [stored, read, other, method, large] = await Promise.all([
    post(probe, someBytes),
    send(probe, `${intakePath}?actor=x`, { body: someBytes, method: 'POST' }),
    post(probe, someBytes, 'https://elsewhere.example'),
    send(probe, intakePath),
    post(probe, new Uint8Array(bodyLimit + 1)),
  ]);
  return [
    expectStatus('上傳 204', stored, status.stored),
    expectStatus('信封錯 400', read, status.unreadable),
    expectStatus('別的來源 403', other, status.forbidden),
    expectStatus('錯的方法 405', method, status.notAllowed),
    expectStatus('太大 413', large, status.tooLarge),
  ];
};

const intake = (probe: Probe): Promise<Array<Result>> => {
  if (probe.target.live) {
    return closedIntake(probe);
  }
  return openIntake(probe);
};

const apiResult = async (probe: Probe): Promise<Result> => {
  const name = '後端沒有對外網址';
  const { api } = probe.target;
  if (api === null) {
    return result(name, true, '沒給後端的網址，略過（本機）');
  }
  const direct = await probe.fetch(new Request(api));
  return result(name, direct.status >= firstError, `${api} 回 ${String(direct.status)}`);
};

const isolation = async (probe: Probe): Promise<Array<Result>> => {
  const others = await Promise.all(otherApiPaths.map((path) => send(probe, path)));
  const results = others.map((response, index) =>
    expectStatus(`只轉發入口 ${otherApiPaths[index] ?? ''}`, response, status.notFound),
  );
  return [...results, await apiResult(probe)];
};

const branchCheck = 'GitHub 分支';
const githubRefusal = Schema.Struct({ message: Schema.String });

const githubHeaders = (probe: Probe): Record<string, string> => {
  if (probe.githubToken === undefined || probe.githubToken === '') {
    return {};
  }
  return { authorization: `Bearer ${probe.githubToken}` };
};

const refusalOf = (body: unknown): string =>
  Option.match(Schema.decodeUnknownOption(githubRefusal)(body), {
    onNone: () => '沒有說明',
    onSome: (refusal) => refusal.message,
  });

const github = async (probe: Probe): Promise<Array<Result>> => {
  const response = await probe.fetch(new Request(repository, { headers: githubHeaders(probe) }));
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return [result(branchCheck, false, `GitHub 回 ${String(response.status)}：${refusalOf(body)}`)];
  }
  return Option.match(Schema.decodeUnknownOption(branchList)(body), {
    onNone: () => [result(branchCheck, false, 'GitHub 回的不是分支清單')],
    onSome: (listed) => {
      const names = listed.map((branch) => branch.name).toSorted();
      return [result(branchCheck, names.join(',') === branches, `有：${shown(names)}`)];
    },
  });
};

const reasonOf = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const guarded =
  (name: string, check: (probe: Probe) => Promise<Array<Result>>) =>
  async (probe: Probe): Promise<Array<Result>> => {
    try {
      return await check(probe);
    } catch (error) {
      return [result(name, false, `檢查本身出錯：${reasonOf(error)}`)];
    }
  };

const dashboardOnly = [
  '追蹤：面板上一次上傳從 Site 到 Api 到 D1',
  'CPU 時間：invocation log 的中位數與最大，離 10 毫秒有餘裕',
  '請求數：一次上傳在面板上算一次請求',
  '錯誤堆疊照原始碼的行號（source map）',
  '遷移：__alchemy_migrations 三筆、時間是原本的',
];

const checkEvery = async (probe: Probe): Promise<Array<Result>> => {
  const checks = [
    guarded('頁面', site),
    guarded('靜態檔', assets),
    guarded('上傳', intake),
    guarded('只轉發入口', isolation),
    guarded(branchCheck, github),
  ];
  const groups = await Promise.all(checks.map((check) => check(probe)));
  return groups.flat();
};

const waitLimit = 60_000;
const waitEvery = 2000;
const millisecondsPerSecond = 1000;
const arrivalCheck = '新版到位';

interface Kind {
  readonly name: string;
  readonly read: (probe: Probe, version: string) => Promise<string | null>;
}

type Seen = ReadonlyMap<string, string | null>;

interface Arrival {
  readonly passed: boolean;
  readonly seen: Seen;
  readonly waited: number;
}

const scriptsVersion = async (probe: Probe, version: string): Promise<string | null> => {
  const texts = await scriptTexts(probe, await scriptsOf(probe));
  if (texts.some((text) => text.includes(version))) {
    return version;
  }
  return null;
};

const workerVersion =
  (path: string) =>
  async (probe: Probe): Promise<string | null> => {
    const response = await send(probe, path);
    return response.headers.get(versionHeader);
  };

const kinds: ReadonlyArray<Kind> = [
  { name: '頁面的程式', read: scriptsVersion },
  ...['/learn/start/', ...missingAssets].map((path) => ({ name: path, read: workerVersion(path) })),
];

const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const round = async (probe: Probe, version: string, seen: Seen): Promise<Seen> => {
  const pending = kinds.filter((kind) => seen.get(kind.name) !== version);
  const read = await Promise.all(
    pending.map((kind) => kind.read(probe, version).catch(() => null)),
  );
  return new Map([
    ...seen,
    ...pending.map((kind, index) => [kind.name, read[index] ?? null] as const),
  ]);
};

const waitFor = async (
  probe: Probe,
  version: string,
  start: number,
  seen: Seen,
): Promise<Arrival> => {
  const now = probe.now ?? Date.now;
  const next = await round(probe, version, seen);
  const waited = now() - start;
  if (kinds.every((kind) => next.get(kind.name) === version)) {
    return { passed: true, seen: next, waited };
  }
  if (waited >= waitLimit) {
    return { passed: false, seen: next, waited };
  }
  await (probe.sleep ?? pause)(waitEvery);
  return waitFor(probe, version, start, next);
};

const arrivalResult = async (probe: Probe, version: string): Promise<Result> => {
  const start = (probe.now ?? Date.now)();
  const arrival = await waitFor(probe, version, start, new Map());
  const seconds = String(Math.round(arrival.waited / millisecondsPerSecond));
  const each = kinds.map((kind) => `${kind.name}：${arrival.seen.get(kind.name) ?? '無'}`);
  return result(arrivalCheck, arrival.passed, `等了 ${seconds} 秒；${each.join('，')}`);
};

const checkAll = async (probe: Probe): Promise<Array<Result>> => {
  const { version } = probe.target;
  if (version === null) {
    return checkEvery(probe);
  }
  const arrived = await arrivalResult(probe, version);
  if (!arrived.passed) {
    return [arrived];
  }
  return [arrived, ...(await checkEvery(probe))];
};

const mark = (passed: boolean): string => {
  if (passed) {
    return '✓';
  }
  return '✘';
};

const report = (results: ReadonlyArray<Result>): string =>
  [
    ...results.map((each) => `${mark(each.passed)} ${each.name}：${each.detail}`),
    ...dashboardOnly.map((each) => `… 要到 Cloudflare 面板看：${each}`),
  ].join('\n');

export { checkAll, report, type Probe, type Result, type Target };
