import { expect, test } from 'bun:test';

import { markPlatform, platformOfRequest } from './platform';

const macSafari =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const windowsChrome =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const iphone =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const asked = (headers: Record<string, string>): Request =>
  new Request('https://example.test/learn/start/', { headers });

const page = (body: string, type = 'text/html; charset=utf-8'): Response =>
  new Response(body, { headers: { 'content-type': type, etag: '"a"' }, status: 200 });

test('the platform comes from the client hint when the browser sends one', () => {
  expect(
    platformOfRequest(asked({ 'sec-ch-ua-platform': '"macOS"', 'user-agent': windowsChrome })),
  ).toBe('mac');
  expect(
    platformOfRequest(asked({ 'sec-ch-ua-platform': '"Chrome OS"', 'user-agent': windowsChrome })),
  ).toBe('chromeos');
  expect(
    platformOfRequest(asked({ 'sec-ch-ua-platform': '"Windows"', 'user-agent': macSafari })),
  ).toBe('pc');
});

test('without a client hint the user agent decides', () => {
  expect(platformOfRequest(asked({ 'user-agent': macSafari }))).toBe('mac');
  expect(platformOfRequest(asked({ 'user-agent': windowsChrome }))).toBe('pc');
  expect(platformOfRequest(asked({ 'user-agent': iphone }))).toBe('touch');
  expect(platformOfRequest(asked({}))).toBe('pc');
});

const opening =
  '<!doctype html><html lang="zh-TW"><body><p>先按 <span data-fullscreen-key>F11</span>。</p></body></html>';

test('a page is marked with the platform, names its key, and says it varies by it', async () => {
  const marked = markPlatform(asked({ 'user-agent': macSafari }), page(opening));
  const text = await marked.text();
  expect(text).toContain('<html lang="zh-TW" class="on-mac">');
  expect(text).toContain('<span data-fullscreen-key>Control + Command + F</span>');
  expect(marked.headers.get('vary')).toContain('Sec-CH-UA-Platform');
  expect(marked.headers.get('etag')).toBeNull();
  expect(marked.status).toBe(200);
});

test('a PC keeps the key the page was built with, and a phone gets no key named', async () => {
  const pc = await markPlatform(asked({ 'user-agent': windowsChrome }), page(opening)).text();
  expect(pc).toContain('<span data-fullscreen-key>F11</span>');
  const phone = await markPlatform(asked({ 'user-agent': iphone }), page(opening)).text();
  expect(phone).toContain('class="on-touch"');
  expect(phone).toContain('<span data-fullscreen-key>F11</span>');
});

test('a not-modified answer passes through untouched', () => {
  const unchanged = new Response(null, { headers: { 'content-type': 'text/html' }, status: 304 });
  expect(markPlatform(asked({ 'user-agent': macSafari }), unchanged)).toBe(unchanged);
});

test('anything that is not a page passes through untouched', async () => {
  const original = page('{"a":1}', 'application/json');
  const passed = markPlatform(asked({ 'user-agent': macSafari }), original);
  expect(passed).toBe(original);
  expect(await passed.text()).toBe('{"a":1}');
});
