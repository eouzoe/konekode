import { expect, test } from 'bun:test';

import { catalog, keys as commandKeys } from '@/lib/complete/catalog';
import { checksOf, planOf, starterOf } from '@/units/index';

import { createBuffer, type Rules } from './buffer';
import { expand, keysOf } from './path';
import { expectedNow, press, type Session } from './session';
import { run } from './step';

const pairs = catalog.filter((item) => item.kind === 'pair');
const all: Rules = { keys: new Set(commandKeys.map((item) => item.key)), pairs };
const none: Rules = { keys: new Set(), pairs: [] };
const printable = Array.from({ length: 95 }, (_unused, at) => String.fromCodePoint(at + 32));
const named = ['Escape', 'Enter', 'Backspace', 'Tab', 'ArrowLeft', 'Delete', 'Process', 'ｃ', '你'];
const alphabet = [...printable, ...named];
const gates = checksOf('start').filter((gate) => (planOf('start', gate.id)?.path.length ?? 0) > 0);

const begin = (gate: string, rules: Rules): Session => {
  const plan = planOf('start', gate);
  const start = run(createBuffer(starterOf('start') ?? ''), keysOf(plan?.history ?? []), rules);
  return { at: 0, buffer: start, path: expand(plan?.path ?? []) };
};

const others = (session: Session): string[] =>
  alphabet.filter((key) => key !== expectedNow(session)?.key);

test('there are guided gates to check', () => {
  expect(gates.length).toBeGreaterThan(0);
});

test('at every step of every gate only the expected key does anything', () => {
  for (const gate of gates) {
    let session = begin(gate.id, all);
    for (const expected of session.path) {
      for (const key of others(session)) {
        const wrong = press(session, key, all);
        expect(wrong.verdict).toBe('wrong');
        expect(wrong.session).toBe(session);
        expect(wrong.runs).toBe(false);
      }
      const right = press(session, expected.key, all);
      expect(right.verdict).toBe('right');
      expect(right.runs).toBe(expected.kind === 'run');
      ({ session } = right);
    }
  }
});

test('following a gate gives its handwritten program, whatever is unlocked', () => {
  for (const rules of [all, none, { keys: all.keys, pairs: [] }]) {
    for (const gate of gates) {
      let session = begin(gate.id, all);
      for (const expected of session.path) {
        ({ session } = press(session, expected.key, rules));
      }
      expect(session.buffer.text).toBe(gate.program);
      expect(session.buffer.mode).toBe('normal');
      expect(session.at).toBe(session.path.length);
    }
  }
});

test('after the last step Enter runs again and nothing else does anything', () => {
  for (const gate of gates) {
    let session = begin(gate.id, all);
    for (const expected of session.path) {
      ({ session } = press(session, expected.key, all));
    }
    expect(press(session, 'Enter', all)).toMatchObject({ runs: true, session, verdict: 'right' });
    for (const key of others(session)) {
      expect(press(session, key, all).session).toBe(session);
    }
  }
});

test('a wrong key is told apart by why it was pressed', () => {
  const session = begin('run-cout', all);
  expect(press(session, 'g', all).cause).toBe('case');
  expect(press(session, 'Enter', all).cause).toBe('early-run');
  expect(press(session, 'x', all).cause).toBe('taught');
  expect(press(session, 'x', none).cause).toBe('untaught');
  expect(press(session, 'c', all).cause).toBe('need-insert');
  expect(press(session, 'Backspace', all).cause).toBe('no-delete');
});

test('without a path only taught keys work, and Enter runs in normal mode', () => {
  const session: Session = { at: 0, buffer: createBuffer('ab'), path: [] };
  expect(press(session, 'Enter', all)).toMatchObject({ runs: true, verdict: 'moved' });
  expect(press(session, 'x', none)).toMatchObject({ runs: false, verdict: 'refused' });
  const typing = press(session, 'i', all).session;
  const broken = press(typing, 'Enter', all);
  expect(broken.runs).toBe(false);
  expect(broken.session.buffer.text).toBe('\nab');
});
