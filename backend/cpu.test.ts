import { expect, test } from 'bun:test';

import { usageOf } from './cpu';

const row = (scriptName: string, status: string, requests: number, p50: number) => ({
  dimensions: { scriptName, status },
  max: { cpuTime: p50 * 4 },
  quantiles: { cpuTimeP50: p50, cpuTimeP90: p50 * 2, cpuTimeP99: p50 * 3 },
  sum: { errors: 0, requests },
});

test('CPU time comes back in milliseconds for the stage own Workers only', () => {
  const usage = usageOf(
    [
      row('cp-dev', 'success', 9, 633),
      row('someone-else', 'success', 5, 100),
      row('api-x', 'success', 40, 5659),
    ],
    { 'api-x': 'Api', 'cp-dev': 'Site' },
  );
  expect(usage.map((each) => each.worker)).toEqual(['Api', 'Site']);
  expect(usage[0]).toEqual({
    errors: 0,
    maxMs: 22.64,
    p50Ms: 5.66,
    p90Ms: 11.32,
    p99Ms: 16.98,
    requests: 40,
    status: 'success',
    worker: 'Api',
  });
});

test('the busiest status of a Worker comes first', () => {
  const usage = usageOf(
    [row('cp-dev', 'clientDisconnected', 1, 900), row('cp-dev', 'success', 30, 600)],
    { 'cp-dev': 'Site' },
  );
  expect(usage.map((each) => each.status)).toEqual(['success', 'clientDisconnected']);
});
