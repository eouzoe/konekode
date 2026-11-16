import { expect, test } from 'bun:test';

import { advance, causeOf, createGuide, expand, expectedNow, judge, takeText } from './guide';

const press = (key: string): { composing: boolean; key: string } => ({ composing: false, key });

test('a path expands into one expected key per press', () => {
  expect(expand(['reset', 'G', 'dj', 'f1', 'type:a b', 'Esc', 'Enter', 'run'])).toEqual([
    { key: 'G', kind: 'command' },
    { key: 'd', kind: 'command' },
    { key: 'j', kind: 'command' },
    { key: 'f', kind: 'command' },
    { key: '1', kind: 'command' },
    { key: 'a', kind: 'text' },
    { key: ' ', kind: 'text' },
    { key: 'b', kind: 'text' },
    { key: 'Escape', kind: 'command' },
    { key: 'Enter', kind: 'command' },
    { key: 'Enter', kind: 'run' },
  ]);
});

test('only the expected key is right, and case matters', () => {
  const guide = createGuide(['G', 'O']);
  expect(judge(guide, press('g'))).toBe('wrong');
  expect(judge(guide, press('O'))).toBe('wrong');
  expect(judge(guide, press('G'))).toBe('right');
  advance(guide);
  expect(expectedNow(guide)).toEqual({ key: 'O', kind: 'command' });
  expect(judge(guide, press('G'))).toBe('wrong');
});

test('input method and full-width presses are told apart from wrong keys', () => {
  const guide = createGuide(['i']);
  expect(judge(guide, press('Process'))).toBe('ime');
  expect(judge(guide, { composing: true, key: 'i' })).toBe('ime');
  expect(judge(guide, press('ｉ'))).toBe('full-width');
});

test('typed text is let in exactly once per accepted key', () => {
  const guide = createGuide(['type:ab']);
  expect(takeText(guide, 'a')).toBe(false);
  advance(guide);
  expect(takeText(guide, 'b')).toBe(false);
  expect(takeText(guide, 'a')).toBe(true);
  expect(takeText(guide, 'a')).toBe(false);
});

test('commands do not open the door for typed text', () => {
  const guide = createGuide(['O', 'type:x']);
  advance(guide);
  expect(takeText(guide, 'O')).toBe(false);
});

test('after the path ends only the run can be repeated', () => {
  const guide = createGuide(['x', 'run']);
  advance(guide);
  advance(guide);
  expect(expectedNow(guide)).toEqual({ key: 'Enter', kind: 'run' });
  advance(guide);
  expect(judge(guide, press('Enter'))).toBe('right');
  expect(judge(guide, press('x'))).toBe('wrong');
  const silent = createGuide(['x']);
  advance(silent);
  expect(expectedNow(silent)).toBeNull();
});

const normal = (
  key: string,
  taught = false,
): { inserting: boolean; key: string; taught: boolean } => ({
  inserting: false,
  key,
  taught,
});

test('a wrong press in normal mode is told apart by what the learner probably meant', () => {
  const guide = createGuide(['G', 'O', 'type:cout', 'Esc', 'run']);
  expect(causeOf(guide, normal('g'))).toBe('case');
  expect(causeOf(guide, normal('c'))).toBe('need-insert');
  expect(causeOf(guide, normal('Enter'))).toBe('early-run');
  expect(causeOf(guide, normal('Backspace'))).toBe('no-delete');
  expect(causeOf(guide, normal('O', true))).toBe('taught');
  expect(causeOf(guide, normal('q'))).toBe('untaught');
  expect(causeOf(guide, normal('Tab'))).toBe('other');
});

test('a wrong press while typing is a slip of the finger, or leaving too early', () => {
  const guide = createGuide(['O', 'type:co', 'Esc']);
  advance(guide);
  const typing = { inserting: true, taught: false };
  expect(causeOf(guide, { ...typing, key: 'x' })).toBe('mistyped');
  expect(causeOf(guide, { ...typing, key: 'C' })).toBe('case');
  expect(causeOf(guide, { ...typing, key: 'Escape' })).toBe('early-leave');
  expect(causeOf(guide, { ...typing, key: 'Delete' })).toBe('no-delete');
  expect(causeOf(guide, { ...typing, key: 'Enter' })).toBe('other');
});

test('once the path is over a wrong press has no particular cause', () => {
  const guide = createGuide(['x']);
  advance(guide);
  expect(causeOf(guide, normal('x', true))).toBe('other');
});
