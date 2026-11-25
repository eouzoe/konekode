import { expect, test } from 'bun:test';

import { apiAddress, targetOf } from './check-stage';

test('the backend address is the site address with the Worker name in front', () => {
  const site = new URL('https://cp-dev.konekode.workers.dev/');
  expect(apiAddress(site, 'konekode-api-dev-abc')).toBe(
    'https://konekode-api-dev-abc.konekode.workers.dev/',
  );
});

test('a local stage has no backend address to try and no wall', () => {
  const target = targetOf(
    'e2e',
    { api: 'konekode-api-e2e-abc', site: 'http://localhost:38689' },
    null,
  );
  expect(target.api).toBeNull();
  expect(target.local).toBe(true);
  expect(target.live).toBe(false);
});

test('only prod is the live stage', () => {
  const recorded = { api: 'konekode-api-prod-abc', site: 'https://cp.konekode.workers.dev' };
  expect(targetOf('prod', recorded, 'abc1234').live).toBe(true);
  expect(targetOf('dev', recorded, null).live).toBe(false);
});
