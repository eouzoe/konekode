import { expect, test } from 'bun:test';

import { array, assert, constantFrom, property } from 'fast-check';

import { catalog, keys as commandKeys } from '@/lib/complete/catalog';
import { expand } from '@/lib/run/guide';
import { checksOf, planOf, starterOf } from '@/units/index';

import { createBuffer, lastColumn, lineStart, type Buffer, type Rules } from './buffer';
import { run, step } from './step';

const rules: Rules = {
  keys: new Set(commandKeys.map((item) => item.key)),
  pairs: catalog.filter((item) => item.kind === 'pair'),
};
const bare: Rules = { keys: rules.keys, pairs: [] };

const printable = Array.from({ length: 95 }, (_unused, at) => String.fromCodePoint(at + 32));
const named = ['Escape', 'Enter', 'Backspace', 'Tab', 'ArrowLeft', 'Delete', 'Process', 'ｃ', '你'];
const alphabet = [...printable, ...named];
const searchDepth = 3;
const gates = checksOf('start');
const starter = starterOf('start') ?? '';

const keysOf = (tokens: readonly string[]): string[] =>
  expand(tokens)
    .filter((item) => item.kind !== 'run')
    .map((item) => item.key);

const startOf = (gate: string): Buffer =>
  run(createBuffer(starter), keysOf(planOf('start', gate)?.history ?? []), rules);

const pathOf = (gate: string): string[] => keysOf(planOf('start', gate)?.path ?? []);

const sound = (buffer: Buffer): string => {
  const { auto, cursor, mode, pending, text, typing } = buffer;
  const inText = cursor >= 0 && cursor <= text.length;
  const onChar = cursor >= lineStart(text, cursor) && cursor <= lastColumn(text, cursor);
  const calm = mode === 'insert' || (onChar && auto === 0 && typing.length === 0);
  const waits = pending === '' || (mode === 'normal' && ['d', 'f'].includes(pending));
  if (inText && calm && waits && auto >= 0) {
    return '';
  }
  return JSON.stringify(buffer);
};

const same = (before: Buffer, after: Buffer): boolean =>
  before.text === after.text && before.cursor === after.cursor && before.mode === after.mode;

const check = (before: Buffer, key: string): Buffer => {
  const { buffer, refused } = step(before, key, rules);
  expect(sound(buffer)).toBe('');
  if (refused) {
    expect(same(before, buffer)).toBe(true);
  }
  return buffer;
};

test('following each gate from the gate before it gives the handwritten program', () => {
  for (const gate of gates.filter((item) => pathOf(item.id).length > 0)) {
    expect(run(startOf(gate.id), pathOf(gate.id), rules).text).toBe(gate.program);
  }
});

test('every key on every path is accepted, and the path ends in normal mode', () => {
  for (const gate of gates) {
    let now = startOf(gate.id);
    for (const key of pathOf(gate.id)) {
      const result = step(now, key, rules);
      expect(result.refused).toBe(false);
      now = result.buffer;
    }
    expect(now.mode).toBe('normal');
    expect(now.pending).toBe('');
  }
});

test('at every step of every path, every key on the keyboard leaves a sound state', () => {
  for (const gate of gates) {
    let now = startOf(gate.id);
    for (const key of pathOf(gate.id)) {
      for (const other of alphabet) {
        check(now, other);
      }
      now = step(now, key, rules).buffer;
    }
  }
});

test('every sequence of up to three keys from the last gate leaves a sound state', () => {
  let frontier = [startOf('task')];
  for (let depth = 0; depth < searchDepth; depth += 1) {
    frontier = frontier.flatMap((buffer) => alphabet.map((key) => check(buffer, key)));
  }
  expect(frontier).toHaveLength(alphabet.length ** searchDepth);
});

test('two presses of Escape always return to normal mode with nothing pending', () => {
  const anyKeys = array(constantFrom(...alphabet), { maxLength: 60 });
  assert(
    property(anyKeys, (keys) => {
      let now = startOf('task');
      for (const key of keys) {
        now = check(now, key);
      }
      const calm = run(now, ['Escape', 'Escape'], rules);
      expect(calm.mode).toBe('normal');
      expect(calm.pending).toBe('');
    }),
    { numRuns: 500 },
  );
});

test('a key that was not taught does nothing, and dd does not exist', () => {
  const start = startOf('task');
  const few: Rules = { keys: new Set(['i']), pairs: [] };
  expect(step(start, 'x', few)).toEqual({ buffer: start, refused: true });
  const afterD = step(start, 'd', rules).buffer;
  expect(afterD.pending).toBe('d');
  expect(step(afterD, 'd', rules)).toEqual({ buffer: start, refused: true });
});

test('the cursor follows vim: Escape steps back, the end of line is remembered', () => {
  const text = 'abc\nabcdef\nab';
  const typed = run(createBuffer(text), ['i', 'x', 'y', 'Escape'], bare);
  expect([typed.text, typed.cursor]).toEqual(['xyabc\nabcdef\nab', 1]);
  const down = run(createBuffer(text, 4), ['$', 'j'], bare);
  expect(down.cursor).toBe(text.length - 1);
  const back = run(down, ['k', 'k'], bare);
  expect(back.cursor).toBe(2);
  const kept = run(createBuffer(text, 9), ['j', 'k'], bare);
  expect(kept.cursor).toBe(9);
});

test('opening a line indents like the block it is in', () => {
  const text = 'int main()\n{\n    a;\n}';
  expect(run(createBuffer(text), ['G', 'O', 'b', ';', 'Escape'], bare).text).toBe(
    'int main()\n{\n    a;\n    b;\n}',
  );
  expect(run(createBuffer(text, 11), ['o', 'b', ';', 'Escape'], bare).text).toBe(
    'int main()\n{\n    b;\n    a;\n}',
  );
  expect(run(createBuffer(text), ['G', 'o', 'x', 'Escape'], bare).text).toBe(`${text}\nx`);
});

test('the dot repeats the whole last change at the new place', () => {
  const text = 'a;\nb;';
  const once = run(createBuffer(text), ['$', 'i', '1', 'Escape'], bare);
  const twice = run(once, ['j', '$', '.'], bare);
  expect(twice.text).toBe('a1;\nb1;');
  expect(run(createBuffer('abc'), ['x', '.'], bare).text).toBe('c');
  expect(step(createBuffer('abc'), '.', bare).refused).toBe(true);
});

test('f finds on the line only, and dj removes two lines or nothing', () => {
  const text = 'a1b\nc1d\ne';
  expect(run(createBuffer(text), ['f', '1'], bare).cursor).toBe(1);
  const finding = run(createBuffer(text), ['f'], bare);
  expect(step(finding, 'd', bare).refused).toBe(true);
  expect(run(createBuffer(text), ['d', 'j'], bare).text).toBe('e');
  expect(run(createBuffer(text, 4), ['d', 'j'], bare).text).toBe('a1b');
  const deleting = run(createBuffer(text, 8), ['d'], bare);
  expect(step(deleting, 'j', bare).refused).toBe(true);
});

test('a pair is closed when it is opened, typed over, and removed together', () => {
  const open = run(createBuffer(''), ['i', '{'], rules);
  expect([open.text, open.cursor]).toEqual(['{}', 1]);
  expect(run(open, ['1', '}', ';'], rules).text).toBe('{1};');
  expect(run(open, ['Backspace'], rules).text).toBe('');
  expect(run(createBuffer('x'), ['i', '{'], rules).text).toBe('{x');
  expect(run(createBuffer('#include '), ['$', 'o', '<'], rules).text).toBe('#include \n<');
  expect(run(createBuffer('#include x'), ['$', 'i', '<'], rules).text).toBe('#include <x');
});
