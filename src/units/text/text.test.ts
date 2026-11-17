import { expect, test } from 'bun:test';

import { beats } from '../start';
import text from './zh-TW/start.json' with { type: 'json' };

test('the text has a sentence for every beat and nothing else', () => {
  expect(Object.keys(text).toSorted()).toEqual(beats.map((beat) => beat.id).toSorted());
});

test('no sentence is empty', () => {
  expect(Object.values(text).filter((sentence) => sentence.trim() === '')).toEqual([]);
});
