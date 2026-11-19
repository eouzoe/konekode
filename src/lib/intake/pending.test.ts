import { expect, test } from 'bun:test';

import { type LearningEvent } from '@/lib/record/event';

import { acknowledge, pendingBatches, settled } from './pending';

const actor = '11111111-1111-4111-8111-111111111111';
const first = '22222222-2222-4222-8222-222222222222';
const second = '33333333-3333-4333-8333-333333333333';

const event = (session: string, seq: number): LearningEvent => ({
  actor,
  at: 1000 + seq,
  content: 'test-content',
  data: {},
  id: `${session}-${String(seq)}`,
  kind: 'beat.reached',
  ref: 'intro',
  seq,
  session,
  site: 'test',
  unit: 'start',
  version: 3,
});

test('events that were never acknowledged are batched per session in order', () => {
  const events = [event(first, 2), event(second, 1), event(first, 1), event(first, 3)];
  const batches = pendingBatches(events, {}, 2);
  expect(
    batches.map((batch) => [batch.session, batch.seq, batch.last, batch.events.length]),
  ).toEqual([
    [first, 1, 2, 2],
    [first, 3, 3, 1],
    [second, 1, 1, 1],
  ]);
  expect(batches[0]?.actor).toBe(actor);
});

test('acknowledged events are not sent again', () => {
  const events = [event(first, 1), event(first, 2), event(first, 3)];
  const batches = pendingBatches(events, { [first]: 2 }, 10);
  expect(batches).toHaveLength(1);
  expect(batches[0]?.events.map((item) => item.seq)).toEqual([3]);
});

test('events from before sessions had identifiers are left out', () => {
  const batches = pendingBatches([event('legacy', 0), event('legacy', 5)], {}, 10);
  expect(batches).toEqual([]);
});

test('acknowledging a batch never moves the mark backwards', () => {
  const [batch] = pendingBatches([event(first, 1), event(first, 2)], {}, 10);
  if (batch === undefined) {
    throw new Error('expected one batch');
  }
  expect(acknowledge({}, batch)).toEqual({ [first]: 2 });
  expect(acknowledge({ [first]: 9 }, batch)).toEqual({ [first]: 9 });
});

test('only acknowledged events of kinds nobody reads locally are settled', () => {
  const kept = new Set(['beat.reached']);
  const events = [
    { ...event(first, 1), kind: 'key.down' },
    event(first, 2),
    { ...event(first, 3), kind: 'key.down' },
    { ...event(second, 1), kind: 'key.down' },
    { ...event('legacy', 0), kind: 'key.down' },
  ];
  expect(settled(events, { [first]: 2 }, kept)).toEqual([`${first}-1`]);
  expect(settled(events, {}, kept)).toEqual([]);
});
