import { afterEach, expect, test } from 'bun:test';

import { faultCounts, guard, onFault, reasonOf, report, resetFaults, type Fault } from './fault';
import { noticeFor } from './notice';

afterEach(() => {
  resetFaults();
});

const waitAMoment = async (): Promise<void> => {
  await Bun.sleep(1);
};

test('each kind and place is counted on its own, so every fault says which time it is', () => {
  const seen: Fault[] = [];
  onFault((fault) => {
    seen.push(fault);
  });
  report('storage.write', 'events', new Error('full'));
  report('storage.write', 'events', new Error('full'));
  report('storage.local', 'draft', new Error('blocked'));
  expect(seen.map((fault) => [fault.kind, fault.where, fault.count])).toEqual([
    ['storage.write', 'events', 1],
    ['storage.write', 'events', 2],
    ['storage.local', 'draft', 1],
  ]);
  expect([...faultCounts().values()]).toEqual([2, 1]);
});

test('a place that listens late still hears what happened before it', () => {
  report('rejected', 'scenes', new Error('early'));
  const seen: string[] = [];
  onFault((fault) => {
    seen.push(fault.where);
  });
  expect(seen).toEqual(['scenes']);
});

test('one listener that throws does not keep the others from hearing', () => {
  const seen: string[] = [];
  const logged: unknown[] = [];
  const { error } = globalThis.console;
  globalThis.console.error = (value: unknown): void => {
    logged.push(value);
  };
  try {
    onFault(() => {
      throw new Error('listener broke');
    });
    onFault((fault) => {
      seen.push(fault.kind);
    });
    report('uncaught', 'page', new Error('x'));
  } finally {
    globalThis.console.error = error;
  }
  expect(seen).toEqual(['uncaught']);
  expect(logged).toHaveLength(1);
});

test('work that nobody awaits reports its failure with where it was started', async () => {
  const seen: Fault[] = [];
  onFault((fault) => {
    seen.push(fault);
  });
  guard('scenes', Promise.reject(new TypeError('no scene')));
  guard('intake', Promise.resolve('fine'));
  await waitAMoment();
  expect(seen.map((fault) => [fault.kind, fault.where, fault.reason])).toEqual([
    ['rejected', 'scenes', 'TypeError: no scene'],
  ]);
});

test('reasons are short text, whatever was thrown', () => {
  expect(reasonOf(new RangeError('too far'))).toBe('RangeError: too far');
  expect(reasonOf('plain')).toBe('plain');
  expect(reasonOf(null)).toBe('null');
  const long = new Error('x'.repeat(1000));
  expect(reasonOf(long).length).toBeLessThanOrEqual(300);
});

const fault = (kind: string, where = 'events'): Fault => ({
  at: 0,
  count: 1,
  kind,
  reason: '',
  where,
});

test('only faults that change what happens to the learner are told to them', () => {
  expect(noticeFor(fault('storage.write'))).toBe('notice.unsaved');
  expect(noticeFor(fault('storage.dropped'))).toBe('notice.unsaved');
  expect(noticeFor(fault('storage.unavailable'))).toBe('notice.unsaved');
  expect(noticeFor(fault('storage.blocked'))).toBe('notice.blocked');
  expect(noticeFor(fault('rejected', 'scenes'))).toBe('notice.broken');
  expect(noticeFor(fault('rejected', 'replay'))).toBeNull();
  expect(noticeFor(fault('storage.local', 'draft'))).toBeNull();
  expect(noticeFor(fault('intake.refused', '429'))).toBeNull();
  expect(noticeFor(fault('uncaught', 'page'))).toBeNull();
});
