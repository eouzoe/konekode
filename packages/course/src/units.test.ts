import { expect, test } from 'bun:test';

import { beatsOf, planOf, starterOf } from './units';

test('a beat before the first gate has no plan', () => {
  expect(planOf('start', 'intro')).toBeNull();
  expect(planOf('start', 'add-cout')).toBeNull();
});

test('a gate is planned with its own path and the earlier paths as history', () => {
  const first = planOf('start', 'run-cout');
  const second = planOf('start', 'run-two');
  expect(first?.history).toEqual([]);
  expect(first?.path.at(-1)).toBe('run');
  expect(second?.history).toEqual(first?.path.filter((token) => token !== 'run'));
});

test('a beat after a gate starts from everything done so far and asks for nothing', () => {
  const gate = planOf('start', 'run-two');
  const after = planOf('start', 'stuck-together');
  expect(after?.path).toEqual([]);
  expect(after?.history).toEqual(
    [...(gate?.history ?? []), ...(gate?.path ?? [])].filter((token) => token !== 'run'),
  );
});

test('an unknown unit has no plan, no beats and no starting text', () => {
  expect(planOf('nowhere', 'run-cout')).toBeNull();
  expect(beatsOf('nowhere')).toEqual([]);
  expect(starterOf('nowhere')).toBeNull();
});
