import { expect, test } from 'bun:test';

import { bktExpect, bktUpdate, bktUpdateAfterExam, defaultParams } from './bkt';

const params = { pG: 0.2, pL0: 0.3, pS: 0.1, pT: 0.4 };
const half = 0.5;

const repeat = (start: number, times: number, correct: boolean): number => {
  let pL = start;
  for (let count = 0; count < times; count += 1) {
    pL = bktUpdate(pL, params, { correct });
  }
  return pL;
};

test('a correct answer raises the estimate', () => {
  const result = bktUpdate(half, params, { correct: true });
  expect(result).toBeGreaterThan(half);
  expect(result).toBeCloseTo(0.913, 2);
});

test('an incorrect answer lowers the estimate', () => {
  expect(bktUpdate(half, params, { correct: false })).toBeLessThan(half);
});

test('repeated correct answers approach one', () => {
  expect(repeat(0.3, 10, true)).toBeGreaterThan(0.99);
});

test('an exam counts for more than an ordinary answer', () => {
  const normal = bktUpdate(half, params, { correct: true });
  expect(bktUpdateAfterExam(half, params, true)).toBeGreaterThan(normal);
});

test('soft evidence moves the estimate part of the way', () => {
  const result = bktUpdate(half, params, {
    correct: true,
    softEvidence: { probCorrect: 0.8, weight: 0.7 },
  });
  expect(result).toBeGreaterThan(half);
  expect(result).toBeLessThan(0.9);
});

test('the estimate stays between zero and one', () => {
  const result = bktUpdate(0.999, params, {
    correct: true,
    softEvidence: { probCorrect: 0.99, weight: 0.3 },
  });
  expect(result).toBeGreaterThanOrEqual(0);
  expect(result).toBeLessThanOrEqual(1);
});

test('repeated incorrect answers pull a high estimate down', () => {
  expect(repeat(0.95, 5, false)).toBeLessThan(0.8);
});

test('with the default parameters two correct answers pass 0.9', () => {
  const once = bktUpdate(defaultParams.pL0, defaultParams, { correct: true });
  const twice = bktUpdate(once, defaultParams, { correct: true });
  expect(once).toBeCloseTo(0.636, 3);
  expect(twice).toBeCloseTo(0.902, 3);
});

test('the chance of a right answer follows from the estimate, the guess and the slip', () => {
  expect(bktExpect(defaultParams.pL0, defaultParams)).toBeCloseTo(0.396, 3);
  expect(bktExpect(1, defaultParams)).toBeCloseTo(0.9, 3);
});
