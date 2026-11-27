import { expect, test } from 'bun:test';

import { checksOf, planOf } from '@konekode/course/units';

import { expand } from './path';

test('every key token in the units is one the editor knows', () => {
  for (const check of checksOf('start')) {
    expect(() => expand(planOf('start', check.id)?.path ?? [])).not.toThrow();
  }
});

test('a whole command is a known key, or a prefix with a key it takes', () => {
  expect(expand(['dj', 'f1', 'G', '.'])).toEqual([
    { key: 'd', kind: 'command' },
    { key: 'j', kind: 'command' },
    { key: 'f', kind: 'command' },
    { key: '1', kind: 'command' },
    { key: 'G', kind: 'command' },
    { key: '.', kind: 'command' },
  ]);
});

test('a token that is not a command is refused instead of split into letters', () => {
  for (const token of ['Escape', 'Tab', 'dk', 'dd', 'Gx', 'q']) {
    expect(() => expand([token])).toThrow('不是認得的按鍵記號');
  }
});
