import { expect, test } from 'bun:test';

import { chunks } from './rhythm';

test('一個單字是一塊，符號與空白各自一塊', () => {
  expect(chunks('cout << 11;').map((chunk) => chunk.text)).toEqual([
    'cout',
    ' ',
    '<',
    '<',
    ' ',
    '11',
    ';',
  ]);
});

test('切開之後接回去和原文相同', () => {
  const text = "#include <bits/stdc++.h>\nint main()\n{\n    cout << a << '\\n';\n}";
  expect(
    chunks(text)
      .map((chunk) => chunk.text)
      .join(''),
  ).toBe(text);
});

test('換行停得最久，單字比符號久，符號最短', () => {
  const [word, space, symbol] = chunks('a ;');
  const [line] = chunks('\n');
  expect(line?.pause ?? 0).toBeGreaterThan(word?.pause ?? 0);
  expect(word?.pause ?? 0).toBeGreaterThan(space?.pause ?? 0);
  expect(space?.pause ?? 0).toBeGreaterThan(symbol?.pause ?? 0);
});

test('空字串沒有任何一塊', () => {
  expect(chunks('')).toEqual([]);
});
