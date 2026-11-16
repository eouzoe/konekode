import { expect, test } from 'bun:test';

import { flatten, pathOf, tasksOf, type Part, type Task } from './format';

const task: Task = {
  ask: 'your turn',
  demo: [
    { id: 'first', keys: ['G'], say: 'go to the end', teaches: ['key.G'] },
    { id: 'second', keys: ['O', 'type:x;', 'Esc'], say: 'open a line' },
  ],
  expect: '1',
  id: 'gate',
  input: '7',
  show: 'x;',
};

const parts: readonly Part[] = [
  { id: 'before', say: 'hello', stage: 'run' },
  { task },
  { id: 'after', say: 'done', stage: 'run' },
];

test('a task becomes its demonstration beats followed by its gate', () => {
  expect(flatten(parts).map((beat) => beat.id)).toEqual([
    'before',
    'first',
    'second',
    'gate',
    'after',
  ]);
});

test('the first demonstration beat resets and every beat shows the target', () => {
  const [, first, second, gate] = flatten(parts);
  expect(first).toEqual({
    id: 'first',
    keys: ['reset', 'G'],
    say: 'go to the end',
    snippet: 'x;',
    stage: 'run',
    unlock: ['key.G'],
  });
  expect(second?.keys).toEqual(['O', 'type:x;', 'Esc']);
  expect(gate).toEqual({
    expect: '1',
    id: 'gate',
    input: '7',
    say: 'your turn',
    snippet: 'x;',
    stage: 'run',
    wait: 'run',
  });
});

test('the path a learner follows is the demonstration plus a run', () => {
  expect(pathOf(task)).toEqual(['G', 'O', 'type:x;', 'Esc', 'run']);
  expect(pathOf({ ...task, demo: [{ id: 'only', keys: ['Esc', 'run'], say: '' }] })).toEqual([
    'Esc',
    'run',
  ]);
  expect(pathOf({ ...task, demo: [] })).toEqual([]);
});

test('tasks are listed in the order they appear', () => {
  expect(tasksOf(parts)).toEqual([task]);
});
