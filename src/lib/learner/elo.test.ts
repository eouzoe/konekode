import { expect, test } from 'bun:test';

import { assert, double, integer, property } from 'fast-check';

import { expected, fresh, uncertainty, update } from './elo';

test('equal ratings give an even chance, and a stronger learner a better one', () => {
  expect(expected(0, 0)).toBe(0.5);
  expect(expected(1, 0)).toBeCloseTo(0.731, 3);
  expect(expected(0, 1)).toBeCloseTo(0.269, 3);
});

test('the step size starts at one and shrinks with the number of answers', () => {
  expect(uncertainty(0)).toBe(1);
  expect(uncertainty(20)).toBe(0.5);
});

test('a right answer raises the learner and lowers the item by the same surprise', () => {
  const after = update({ item: fresh, learner: fresh }, true);
  expect(after.learner).toEqual({ count: 1, value: 0.5 });
  expect(after.item).toEqual({ count: 1, value: -0.5 });
  const again = update(after, false);
  expect(again.learner.value).toBeLessThan(after.learner.value);
  expect(again.item.value).toBeGreaterThan(after.item.value);
});

test('the chance stays between zero and one and an answer moves it the right way', () => {
  const rating = double({ max: 20, min: -20, noNaN: true });
  const count = integer({ max: 500, min: 0 });
  assert(
    property(rating, rating, count, (learner, item, answered) => {
      const before = expected(learner, item);
      const match = {
        item: { count: answered, value: item },
        learner: { count: answered, value: learner },
      };
      const won = update(match, true);
      const lost = update(match, false);
      expect(before).toBeGreaterThanOrEqual(0);
      expect(before).toBeLessThanOrEqual(1);
      expect(expected(won.learner.value, won.item.value)).toBeGreaterThanOrEqual(before);
      expect(expected(lost.learner.value, lost.item.value)).toBeLessThanOrEqual(before);
    }),
  );
});
