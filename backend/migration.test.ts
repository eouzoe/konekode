import { expect, test } from 'bun:test';

import { flatName, newestFor, nextNumber } from './migration';

const applied = [
  '0001_create_intake.sql',
  '0002_create_intake_usage.sql',
  '0003_create_intake_actor_usage.sql',
];

test('the next flat migration follows the highest number already there', () => {
  expect(nextNumber(applied)).toBe('0004');
  expect(nextNumber([])).toBe('0001');
  expect(flatName(applied, 'add_device_key')).toBe('0004_add_device_key.sql');
});

test('the generated directory is the newest one with that name', () => {
  const generated = ['20261125170140_baseline', '20261201090000_add_key', '20261203090000_add_key'];
  expect(newestFor(generated, 'add_key')).toBe('20261203090000_add_key');
  expect(newestFor(generated, 'missing')).toBeUndefined();
});
