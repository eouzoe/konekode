import { expect, test } from 'bun:test';

import { type LearningEvent } from '@/lib/record/event';

import { pendingBatches } from './pending';
import { byteLength, fitBytes, free, holdAfter, isDue, isHeld, prefixBatch, timing } from './plan';

const actor = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const now = 10_000_000;

const event = (seq: number, at: number, text = ''): LearningEvent => ({
  actor,
  at,
  data: { text },
  id: `${session}-${String(seq)}`,
  kind: 'input.unusual',
  ref: '',
  seq,
  session,
  unit: '',
  version: 2,
});

const many = (count: number, at: number, text = ''): LearningEvent[] =>
  Array.from({ length: count }, (_unused, index) => event(index + 1, at, text));

const batchesOf = (events: readonly LearningEvent[]) =>
  pendingBatches(events, {}, timing.batchSize);

const dueWith = (events: readonly LearningEvent[]): boolean => isDue(batchesOf(events), now);

test('nothing is due when nothing waits, or when a little has waited a short while', () => {
  expect(isDue([], now)).toBe(false);
  expect(dueWith(many(10, now - timing.maxWait + 1))).toBe(false);
});

test('a full batch is due at once, and anything is due once its oldest event has waited long enough', () => {
  expect(dueWith(many(timing.batchSize, now))).toBe(true);
  expect(dueWith(many(1, now - timing.maxWait))).toBe(true);
});

test('the last batch keeps the longest prefix whose bytes fit, counting Chinese as three bytes', () => {
  const events = many(400, now, '中文'.repeat(50));
  const kept = fitBytes(events);
  const bytes = byteLength(JSON.stringify(kept));
  expect(kept.length).toBeGreaterThan(0);
  expect(kept.length).toBeLessThan(events.length);
  expect(bytes).toBeLessThanOrEqual(timing.finalBytes);
  const oneMore = JSON.stringify(events.slice(0, kept.length + 1));
  expect(byteLength(oneMore)).toBeGreaterThan(timing.finalBytes);
  expect(kept).toEqual(events.slice(0, kept.length));
});

test('the byte limit is exact, and an event too large on its own is left for the normal upload', () => {
  const events = many(3, now, 'x');
  const whole = byteLength(JSON.stringify(events));
  expect(fitBytes(events, whole)).toHaveLength(3);
  expect(fitBytes(events, whole - 1)).toHaveLength(2);
  expect(fitBytes(events, 1)).toEqual([]);
});

test('a prefix becomes a batch that acknowledges only what it carries', () => {
  const [batch] = batchesOf(many(5, now));
  if (batch === undefined) {
    throw new Error('expected a batch');
  }
  const part = prefixBatch(batch, batch.events.slice(0, 2));
  expect(part?.seq).toBe(1);
  expect(part?.last).toBe(2);
  expect(prefixBatch(batch, [])).toBeNull();
});

test('a refusal that says when to come back is waited out exactly', () => {
  const hold = holdAfter({ retryAfter: '120', status: 429 }, now, free);
  expect(hold).toEqual({ failures: 1, until: now + 120_000 });
  expect(isHeld(hold, now + 119_999)).toBe(true);
  expect(isHeld(hold, now + 120_000)).toBe(false);
});

test('other failures back off, doubling up to a ceiling, and a success clears the hold', () => {
  let hold = free;
  const waits: number[] = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    hold = holdAfter({ retryAfter: null, status: 503 }, now, hold);
    waits.push(hold.until - now);
  }
  expect(waits.slice(0, 3)).toEqual([
    timing.firstBackoff,
    timing.firstBackoff * 2,
    timing.firstBackoff * 4,
  ]);
  expect(Math.max(...waits)).toBe(timing.lastBackoff);
  expect(holdAfter({ retryAfter: 'soon', status: 429 }, now, free).until).toBe(
    now + timing.firstBackoff,
  );
  expect(holdAfter({ retryAfter: null, status: 204 }, now, hold)).toEqual(free);
});
