import { expect, test } from 'bun:test';

import { array, assert, constantFrom, integer, property, record, type Arbitrary } from 'fast-check';

import {
  dayLength,
  dueAt,
  recall,
  remember,
  wantedRecall,
  type Evidence,
  type Memory,
} from './memory';

interface Visit {
  readonly evidence: Evidence;
  readonly gap: number;
}

const minute = 60_000;
const start = 1_800_000_000_000;

const after = (visits: ReadonlyArray<Visit>): Memory => {
  let at = start;
  let memory: Memory | null = null;
  for (const visit of visits) {
    at += visit.gap;
    memory = remember(memory, at, visit.evidence);
  }
  if (memory === null) {
    throw new Error('no visits');
  }
  return memory;
};

const daysUntilDue = (memory: Memory): number => (dueAt(memory) - memory.at) / dayLength;
const untilDue = (visits: ReadonlyArray<Visit>): number => daysUntilDue(after(visits));

const helped = (gap: number): Visit => ({ evidence: 'helped', gap });
const unaided = (gap: number): Visit => ({ evidence: 'unaided', gap });
const wrong = (gap: number): Visit => ({ evidence: 'wrong', gap });

test('a first press that is wrong is due at once', () => {
  const memory = after([wrong(0)]);
  expect(dueAt(memory) - memory.at).toBeLessThan(minute);
});

test('right with the answer on screen is checked within the day, not days later', () => {
  const twice = [helped(0), helped(5 * minute)];
  expect(untilDue([helped(0)])).toBeCloseTo(0.6, 1);
  expect(untilDue(twice)).toBeCloseTo(0.76, 1);
});

test('right without help counts for more than right with the answer on screen', () => {
  const alone = untilDue([unaided(0)]);
  expect(alone).toBeCloseTo(4.78, 1);
  expect(alone).toBeGreaterThan(untilDue([helped(0)]));
});

test('checks come often at first and then spread out', () => {
  const visits = [helped(0), helped(5 * minute), unaided(dayLength), unaided(3 * dayLength)];
  const gaps = visits.map((_visit, index) => untilDue(visits.slice(0, index + 1)));
  expect(gaps[2]).toBeCloseTo(3.77, 1);
  expect(gaps[3]).toBeCloseTo(9.91, 1);
  expect(gaps).toEqual(gaps.toSorted((first, second) => first - second));
});

test('a miss after days brings the check back at once, and a right press does not undo it', () => {
  const missed = after([helped(0), wrong(5 * dayLength)]);
  const recovered = after([helped(0), wrong(5 * dayLength), helped(5 * minute)]);
  expect(dueAt(missed) - missed.at).toBeLessThan(minute);
  expect(daysUntilDue(recovered)).toBeLessThan(untilDue([helped(0)]));
});

test('time that runs backwards counts as no time', () => {
  const first = remember(null, start, 'helped');
  expect(remember(first, start - dayLength, 'helped')).toMatchObject({
    difficulty: remember(first, start, 'helped').difficulty,
    stability: remember(first, start, 'helped').stability,
  });
  expect(recall(first, start - dayLength)).toBe(recall(first, start));
});

const visit: Arbitrary<Visit> = record({
  evidence: constantFrom<Evidence>('helped', 'unaided', 'wrong'),
  gap: integer({ max: 40 * dayLength, min: 0 }),
});

const visits = array(visit, { maxLength: 12, minLength: 1 });
const later = integer({ max: 400 * dayLength, min: 0 });

test('the same visits give the same memory', () => {
  assert(
    property(visits, (list) => {
      expect(after(list)).toEqual(after(list));
    }),
  );
});

test('every number stays inside its bounds', () => {
  assert(
    property(visits, later, (list, wait) => {
      const memory = after(list);
      expect(memory.difficulty).toBeGreaterThanOrEqual(1);
      expect(memory.difficulty).toBeLessThanOrEqual(10);
      expect(memory.stability).toBeGreaterThan(0);
      expect(memory.stabilityFast).toBeGreaterThan(0);
      expect(recall(memory, memory.at + wait)).toBeGreaterThanOrEqual(0);
      expect(recall(memory, memory.at + wait)).toBeLessThanOrEqual(1);
      expect(dueAt(memory)).toBeGreaterThanOrEqual(memory.at);
    }),
  );
});

test('recall never rises while nothing is practised', () => {
  assert(
    property(visits, later, later, (list, wait, more) => {
      const memory = after(list);
      const sooner = recall(memory, memory.at + wait);
      expect(recall(memory, memory.at + wait + more)).toBeLessThanOrEqual(sooner);
    }),
  );
});

test('due means recall has fallen to the wanted level, and not before', () => {
  const slack = 0.01;
  assert(
    property(visits, (list) => {
      const memory = after(list);
      expect(recall(memory, dueAt(memory))).toBeLessThanOrEqual(wantedRecall + slack);
      if (dueAt(memory) - memory.at > minute) {
        expect(recall(memory, dueAt(memory) - minute)).toBeGreaterThanOrEqual(wantedRecall - slack);
      }
    }),
  );
});

test('better evidence at the same moment never brings the next check sooner', () => {
  assert(
    property(visits, later, (list, wait) => {
      const memory = after(list);
      const at = memory.at + wait;
      const next = (evidence: Evidence): number => dueAt(remember(memory, at, evidence));
      expect(next('wrong')).toBeLessThanOrEqual(next('helped'));
      expect(next('helped')).toBeLessThanOrEqual(next('unaided'));
    }),
  );
});
