import { type LearningEvent } from '@/lib/record/event';

import { type Batch } from './pending';

interface Timing {
  readonly batchSize: number;
  readonly finalBytes: number;
  readonly firstBackoff: number;
  readonly lastBackoff: number;
  readonly maxWait: number;
}

interface Hold {
  readonly failures: number;
  readonly until: number;
}

const timing: Timing = {
  batchSize: 1000,
  finalBytes: 60_000,
  firstBackoff: 60_000,
  lastBackoff: 1_800_000,
  maxWait: 300_000,
};

const second = 1000;
const stored = 204;
const refused = 429;
const doubling = 2;
const fromEnd = -1;
const free: Hold = { failures: 0, until: 0 };
const encoder = new TextEncoder();
const brackets = 2;

const isDue = (batches: readonly Batch[], now: number, rule: Timing = timing): boolean =>
  batches.some(
    (batch) =>
      batch.events.length >= rule.batchSize ||
      (batch.events[0]?.at ?? Number.POSITIVE_INFINITY) <= now - rule.maxWait,
  );

const fitBytes = (
  events: readonly LearningEvent[],
  limit: number = timing.finalBytes,
): LearningEvent[] => {
  let total = brackets;
  const kept: LearningEvent[] = [];
  for (const event of events) {
    const size = encoder.encode(JSON.stringify(event)).byteLength + Math.min(kept.length, 1);
    if (total + size > limit) {
      return kept;
    }
    total += size;
    kept.push(event);
  }
  return kept;
};

const byteLength = (text: string): number => encoder.encode(text).byteLength;

const prefixBatch = (batch: Batch, events: readonly LearningEvent[]): Batch | null => {
  const final = events.at(fromEnd);
  if (final === undefined) {
    return null;
  }
  return { ...batch, events, last: final.seq };
};

const secondsFrom = (header: string | null): number | null => {
  if (header === null || !/^\d+$/u.test(header.trim())) {
    return null;
  }
  return Number(header.trim());
};

const backoff = (failures: number): number =>
  Math.min(timing.firstBackoff * doubling ** failures, timing.lastBackoff);

const holdAfter = (
  answer: { readonly retryAfter: string | null; readonly status: number },
  now: number,
  before: Hold,
): Hold => {
  if (answer.status === stored) {
    return free;
  }
  const told = secondsFrom(answer.retryAfter);
  if (answer.status === refused && told !== null) {
    return { failures: before.failures + 1, until: now + told * second };
  }
  return { failures: before.failures + 1, until: now + backoff(before.failures) };
};

const isHeld = (hold: Hold, now: number): boolean => now < hold.until;

export {
  byteLength,
  fitBytes,
  free,
  holdAfter,
  isDue,
  isHeld,
  prefixBatch,
  timing,
  type Hold,
  type Timing,
};
