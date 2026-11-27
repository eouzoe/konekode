import { expect, test } from 'bun:test';

import { catalog, keys as commandKeys } from '@konekode/contracts/catalog';

import { createBuffer, type Buffer, type Rules } from './buffer';
import { effectOf } from './effect';
import { run, step } from './step';

const rules: Rules = {
  keys: new Set(commandKeys.map((item) => item.key)),
  pairs: catalog.filter((item) => item.kind === 'pair'),
};
const program = ['int main()', '{', '    cout << 11;', '    cout << 22;', '}'].join('\n');

const told = (before: Buffer, key: string): ReturnType<typeof effectOf> =>
  effectOf(before, step(before, key, rules).buffer, key);

test('a jump of two lines or more is told; one line is not', () => {
  const top = createBuffer(program, 0);
  expect(told(top, 'G')).toEqual({ count: 4, keys: 1, kind: 'lines' });
  expect(told(run(top, ['G'], rules), 'k')).toBeNull();
});

test('a jump along the line counts the columns, and a two-key command says two keys', () => {
  const line = createBuffer(program, program.indexOf('    cout << 11;'));
  expect(told(line, '$')).toEqual({ count: 14, keys: 1, kind: 'columns' });
  const waiting = run(line, ['f'], rules);
  expect(told(waiting, '1')).toEqual({ count: 12, keys: 2, kind: 'columns' });
});

test('repeating tells how many keys it stood in for', () => {
  const first = createBuffer(program, program.indexOf(';'));
  const typed = run(first, ['i', ' ', '<', '<', ' ', '0', 'Escape', 'j'], rules);
  expect(told(typed, '.')).toEqual({ count: 7, keys: 1, kind: 'repeat' });
});

test('dropping lines tells how many, and typing tells nothing', () => {
  const line = createBuffer(program, program.indexOf('    cout << 11;'));
  expect(told(run(line, ['d'], rules), 'j')).toEqual({ count: 2, keys: 2, kind: 'dropped' });
  expect(told(run(line, ['i'], rules), 'x')).toBeNull();
  expect(told(line, 'o')).toBeNull();
  expect(told(line, 'i')).toBeNull();
});
