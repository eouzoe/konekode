import { expect, test } from 'bun:test';

import { flatten, type Part } from './unit';

const parts: ReadonlyArray<Part> = [
  { id: 'one', stage: 'run' },
  { task: { demo: [{ id: 'two', keys: [] }], expect: '', goal: '', id: 'three', show: '' } },
];

test('every beat takes its sentence from the text by its id', () => {
  const text = { one: 'first', three: 'third', two: 'second' };
  expect(flatten(parts, text).map((beat) => beat.say)).toEqual(['first', 'second', 'third']);
});

test('a beat without a sentence is an error, not an empty line', () => {
  expect(() => flatten(parts, { one: 'first', two: 'second' })).toThrow('no sentence for three');
});
