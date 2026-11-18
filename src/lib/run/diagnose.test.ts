import { expect, test } from 'bun:test';

import { diagnose } from './diagnose';

test('a wrong output is told by what is wrong with it', () => {
  expect(diagnose('5\n3', '')).toBe('程式沒有輸出任何東西。');
  expect(diagnose('5\n3', '53\n')).toBe('輸出的內容是對的，但是換行或空格的位置不一樣。');
  expect(diagnose('5\n3', '5 3\n')).toBe('輸出的內容是對的，但是換行或空格的位置不一樣。');
  expect(diagnose('5\n3', '3\n5\n')).toBe('輸出的內容都對，但是順序不一樣。');
  expect(diagnose('5\n3', '3\n')).toBe('應該要輸出 2 行，目前只輸出了 1 行。');
  expect(diagnose('5\n3', '5\n3\n3\n')).toBe('應該只輸出 2 行，目前輸出了 3 行。');
  expect(diagnose('5\n3', '5\n4\n')).toBe('第 2 行應該是 3，目前輸出的是 4。');
});
