import { expect, test } from 'bun:test';

import { backlogLimit, isOverfull } from './backlog';

test('a backlog is dropped only when it is over the limit and nothing is being sent', () => {
  expect(isOverfull(backlogLimit, false)).toBe(false);
  expect(isOverfull(backlogLimit + 1, false)).toBe(true);
  expect(isOverfull(backlogLimit + 1, true)).toBe(false);
});
