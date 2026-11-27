import { expect, test } from 'bun:test';

import { catalog, keys as commandKeys } from '@konekode/contracts/catalog';
import { checksOf, planOf, starterOf } from '@konekode/course/units';

import { createBuffer, type Rules } from './buffer';
import { finalText, fulfil, goalOf } from './goal';
import { expand, keysOf } from './path';
import { press, type Session } from './session';
import { run } from './step';

const pairs = catalog.filter((item) => item.kind === 'pair');
const all: Rules = { keys: new Set(commandKeys.map((item) => item.key)), pairs };
const bare: Rules = { keys: all.keys, pairs: [] };
const gates = checksOf('start').filter((gate) => (planOf('start', gate.id)?.path.length ?? 0) > 0);

const begin = (gate: string, rules: Rules): Session => {
  const plan = planOf('start', gate);
  const start = run(createBuffer(starterOf('start') ?? ''), keysOf(plan?.history ?? []), rules);
  return { at: 0, buffer: start, path: expand(plan?.path ?? []) };
};

test('at every step of every gate, what is drawn turns the text into what the gate ends with', () => {
  for (const rules of [all, bare]) {
    for (const gate of gates) {
      let session = begin(gate.id, all);
      for (const expected of session.path) {
        const hints = goalOf(session, rules);
        expect(fulfil(session.buffer.text, hints)).toBe(finalText(session, rules));
        ({ session } = press(session, expected.key, rules));
      }
      expect(session.buffer.text).toBe(gate.program);
      expect(goalOf(session, rules)).toEqual([]);
    }
  }
});

test('a gate starts by showing what is missing and nothing is drawn for a free task', () => {
  const first = begin('run-cout', all);
  expect(goalOf(first, all)).toEqual([{ before: 6, kind: 'line', text: '    cout << 11;' }]);
  expect(goalOf({ ...first, path: [] }, all)).toEqual([]);
});

test('text is drawn where it will go: after what is typed, and around what was closed for us', () => {
  const typing = run({ ...createBuffer('int a', 5), mode: 'insert' }, ['{'], all);
  const session: Session = { at: 0, buffer: typing, path: expand(['type:11};']) };
  expect(typing.text).toBe('int a{}');
  expect(goalOf(session, all)).toEqual([
    { column: 6, kind: 'insert', line: 0, text: '11' },
    { column: 7, kind: 'insert', line: 0, text: ';' },
  ]);
});
