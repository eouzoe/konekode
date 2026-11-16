import { expect, test } from 'bun:test';

import { isFullWidth } from './width';

test('full-width letters, digits and symbols are detected', () => {
  for (const text of ['ｉ', '＃', '３', 'Ａ', '；', '｛']) {
    expect(isFullWidth(text)).toBe(true);
  }
});

test('the ideographic space counts as full-width', () => {
  expect(isFullWidth('\u3000')).toBe(true);
});

test('half-width input and Chinese text are not flagged', () => {
  for (const text of ['i', '#', '3', ' ', '\n', '', '喔', 'ㄛ']) {
    expect(isFullWidth(text)).toBe(false);
  }
});

test('one full-width character inside a longer string is enough', () => {
  expect(isFullWidth('int ａ{};')).toBe(true);
});
