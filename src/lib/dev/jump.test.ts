import { expect, test } from 'bun:test';

import { jumpTo, skipFrom, type Stop } from './jump';

const stops: readonly Stop[] = [
  { id: 'a' },
  { id: 'gate-1', wait: 'drill' },
  { id: 'b' },
  { id: 'gate-2', wait: 'run' },
  { id: 'c' },
];

test('jumping passes every gate before the target and lands on it', () => {
  expect(jumpTo(stops, 'c')).toEqual([
    { kind: 'check.passed', ref: 'gate-1' },
    { kind: 'check.passed', ref: 'gate-2' },
    { kind: 'beat.reached', ref: 'c' },
  ]);
  expect(jumpTo(stops, 'gate-2')).toEqual([
    { kind: 'check.passed', ref: 'gate-1' },
    { kind: 'beat.reached', ref: 'gate-2' },
  ]);
  expect(jumpTo(stops, 'a')).toEqual([{ kind: 'beat.reached', ref: 'a' }]);
});

test('jumping to an unknown beat does nothing', () => {
  expect(jumpTo(stops, 'nowhere')).toEqual([]);
});

test('skipping passes the current beat and moves to the next', () => {
  expect(skipFrom(stops, 'gate-1')).toEqual([
    { kind: 'check.passed', ref: 'gate-1' },
    { kind: 'beat.reached', ref: 'b' },
  ]);
  expect(skipFrom(stops, 'c')).toEqual([]);
});
