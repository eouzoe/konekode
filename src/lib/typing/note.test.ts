import { expect, test } from 'bun:test';

import { createDrill, escape, press, remind, type Drill } from './drill';
import { attemptOf } from './note';

const typed = (drill: Drill, text: string): Drill => {
  let next = drill;
  for (const char of text) {
    next = press(next, char);
  }
  return next;
};

const start = createDrill('ab');
const inserting = press(start, 'i');
const done = typed(inserting, 'ab');

test('the first step is opening insert mode with i', () => {
  expect(attemptOf(start, inserting, 'i')).toEqual({
    at: 0,
    cause: '',
    expected: 'i',
    key: 'i',
    kind: 'command',
    verdict: 'right',
  });
  expect(attemptOf(start, press(start, 'a'), 'a')).toMatchObject({
    at: 0,
    cause: 'need-insert',
    verdict: 'wrong',
  });
});

test('each character is its own step, right or mistyped', () => {
  expect(attemptOf(inserting, press(inserting, 'a'), 'a')).toMatchObject({
    at: 1,
    expected: 'a',
    kind: 'text',
    verdict: 'right',
  });
  expect(attemptOf(inserting, press(inserting, 'x'), 'x')).toMatchObject({
    at: 1,
    cause: 'mistyped',
    verdict: 'wrong',
  });
});

test('a delete press keeps its own label', () => {
  expect(attemptOf(inserting, remind(inserting, 'no-delete'), 'Backspace')).toMatchObject({
    cause: 'no-delete',
    verdict: 'wrong',
  });
});

test('leaving before the text is finished is wrong, leaving after it is the last step', () => {
  expect(attemptOf(inserting, escape(inserting), 'Escape')).toMatchObject({
    at: 1,
    cause: 'early-leave',
    verdict: 'wrong',
  });
  expect(attemptOf(done, escape(done), 'Escape')).toEqual({
    at: 3,
    cause: '',
    expected: 'Escape',
    key: 'Escape',
    kind: 'command',
    verdict: 'right',
  });
  expect(attemptOf(done, press(done, 'c'), 'c')).toMatchObject({
    at: 3,
    cause: 'mistyped',
    verdict: 'wrong',
  });
});

test('nothing is recorded when nothing was judged or the drill is over', () => {
  const finished = escape(done);
  expect(attemptOf(start, start, 'Shift')).toBeNull();
  expect(attemptOf(finished, escape(finished), 'Escape')).toBeNull();
});
