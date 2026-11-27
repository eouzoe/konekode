import { expect, test } from 'bun:test';

import { beats } from './start';
import text from './text/zh-TW/start.json' with { type: 'json' };

test('the text has a sentence for every beat and nothing else', () => {
  expect(Object.keys(text).toSorted()).toEqual(beats.map((beat) => beat.id).toSorted());
});

test('no sentence is empty', () => {
  expect(Object.values(text).filter((sentence) => sentence.trim() === '')).toEqual([]);
});

test('no on-screen string is empty, and every placeholder is a plain name', async () => {
  const { default: ui } = await import('./text/zh-TW/ui.json', { with: { type: 'json' } });
  const values = Object.values(ui);
  expect(values.filter((value) => value.trim() === '')).toEqual([]);
  const holes = values.flatMap((value) => value.match(/\{[^}]*\}/gu) ?? []);
  expect(holes.filter((hole) => !/^\{[a-z]+\}$/u.test(hole))).toEqual([]);
});
