import { expect, test } from 'bun:test';

import { readEvent } from './event';

const stored = {
  actor: 'device',
  at: 10,
  content: 'c',
  data: { ok: true },
  id: 'e1',
  kind: 'beat.reached',
  ref: 'r',
  seq: 1,
  session: 's',
  site: 'site',
  unit: 'u',
  version: 3 as const,
};

test('drops keys the event does not define', () => {
  expect(readEvent({ ...stored, extra: 'kept?' })).toEqual(stored);
});

test('rejects an event whose time is not a whole number', () => {
  expect(readEvent({ ...stored, at: 1.5 })).toBeNull();
});

test('rejects data values that are not finite', () => {
  expect(readEvent({ ...stored, data: { n: Number.NaN } })).toBeNull();
});

test('rejects an empty name', () => {
  expect(readEvent({ ...stored, kind: '' })).toBeNull();
});
