import { Schema } from 'effect';

import { bodyLimit, closedFor, intakePath, status } from './limits';

interface Token {
  readonly id: string;
  readonly secret: string;
}

interface Target {
  readonly api: string | null;
  readonly live: boolean;
  readonly local: boolean;
  readonly site: URL;
  readonly token: Token | null;
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
  readonly target: Target;
}

const ok = 200;
const firstRedirect = 300;
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

const shown = (values: readonly string[]): string => {
  if (values.length === 0) {
    return '無';
  }
  return values.join(', ');
};

const accessHeaders = (token: Token | null): Record<string, string> => {
  if (token === null) {
    return {};
  }
  return { 'cf-access-client-id': token.id, 'cf-access-client-secret': token.secret };
};

const send = (probe: Probe, path: string, init: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(accessHeaders(probe.target.token))) {
    headers.set(name, value);
  }
  return probe.fetch(new Request(new URL(path, probe.target.site), { ...init, headers }));
};

const textOf = async (probe: Probe, path: string): Promise<string> => {
  const response = await send(probe, path);
  return response.text();
};

const wall = async (probe: Probe): Promise<Result[]> => {
  const name = '登入牆';
  if (probe.target.local) {
    return [result(name, true, '本機沒有 Access，略過')];
  }
  const bare = await probe.fetch(new Request(probe.target.site, { redirect: 'manual' }));
  if (probe.target.live) {
    return [result(name, bare.status === ok, `prod 不擋，沒登入回 ${String(bare.status)}`)];
  }
  const inside = await send(probe, '/');
  return [
    result(name, bare.status >= firstRedirect, `沒登入回 ${String(bare.status)}`),
    result(`${name}（服務憑證）`, inside.status === ok, `帶服務憑證回 ${String(inside.status)}`),
  ];
};

const pageResults = async (probe: Probe, path: string): Promise<Result[]> => {
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

const site = async (probe: Probe): Promise<Result[]> => {
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

const scriptsOf = async (probe: Probe): Promise<string[]> => {
  const html = await textOf(probe, '/learn/start/');
  const paths = [...html.matchAll(scriptPattern)].map((match) => match.groups?.path ?? '');
  return [...new Set(paths)];
};

const versionResult = async (probe: Probe, scripts: readonly string[]): Promise<Result[]> => {
  const { version } = probe.target;
  if (version === null) {
    return [];
  }
  const first = await Promise.all(scripts.map((path) => textOf(probe, path)));
  const imported = first.flatMap((text) =>
    [...text.matchAll(importPattern)].map((match) => `/_astro/${match.groups?.name ?? ''}`),
  );
  const second = [...new Set(imported)].filter((path) => !scripts.includes(path));
  const texts = [...first, ...(await Promise.all(second.map((path) => textOf(probe, path))))];
  const found = texts.some((text) => text.includes(version));
  return [result('版本', found, `頁面的程式裡有「${version}」：${String(found)}`)];
};

const assets = async (probe: Probe): Promise<Result[]> => {
  const scripts = await scriptsOf(probe);
  const [first = '/none'] = scripts;
  const response = await send(probe, first);
  const cache = response.headers.get('cache-control') ?? '';
  return [
    result('靜態檔快取', cache.includes('immutable'), `${first}：${cache}`),
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

const closedIntake = async (probe: Probe): Promise<Result[]> => {
  const response = await post(probe, someBytes);
  const retry = response.headers.get('retry-after') ?? '';
  return [
    expectStatus('入口關著', response, status.closed),
    result('入口關著的 Retry-After', retry === String(closedFor), `retry-after：${retry}`),
  ];
};

const openIntake = async (probe: Probe): Promise<Result[]> => {
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

const intake = (probe: Probe): Promise<Result[]> => {
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

const isolation = async (probe: Probe): Promise<Result[]> => {
  const others = await Promise.all(otherApiPaths.map((path) => send(probe, path)));
  const results = others.map((response, index) =>
    expectStatus(`只轉發入口 ${otherApiPaths[index] ?? ''}`, response, status.notFound),
  );
  return [...results, await apiResult(probe)];
};

const github = async (probe: Probe): Promise<Result[]> => {
  const response = await probe.fetch(new Request(repository));
  const listed = Schema.decodeUnknownSync(branchList)(await response.json());
  const names = listed.map((branch) => branch.name).toSorted();
  return [result('GitHub 分支', names.join(',') === branches, `有：${shown(names)}`)];
};

const dashboardOnly = [
  '追蹤：面板上一次上傳從 Site 到 Api 到 D1',
  'CPU 時間：invocation log 的中位數與最大，離 10 毫秒有餘裕',
  '請求數：一次上傳在面板上算一次請求',
  '錯誤堆疊照原始碼的行號（source map）',
  '遷移：__alchemy_migrations 三筆、時間是原本的',
];

const checkAll = async (probe: Probe): Promise<Result[]> => {
  const checks = [wall, site, assets, intake, isolation, github];
  const groups = await Promise.all(checks.map((check) => check(probe)));
  return groups.flat();
};

const mark = (passed: boolean): string => {
  if (passed) {
    return '✓';
  }
  return '✘';
};

const report = (results: readonly Result[]): string =>
  [
    ...results.map((each) => `${mark(each.passed)} ${each.name}：${each.detail}`),
    ...dashboardOnly.map((each) => `… 要到 Cloudflare 面板看：${each}`),
  ].join('\n');

export { checkAll, report, type Probe, type Result, type Target, type Token };
