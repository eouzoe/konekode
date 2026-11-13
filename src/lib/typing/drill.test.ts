import { expect, test } from 'bun:test';

import { createDrill, erase, expectedChar, hasError, isDone, press, type Drill } from './drill';
import { findKey } from './keyboard';

const typeAll = (target: string, keys: string): Drill => {
  let drill = createDrill(target);
  for (const key of keys) {
    drill = press(drill, key);
  }
  return drill;
};

test('打對的字會留下來', () => {
  const drill = press(createDrill('ab'), 'a');
  expect(drill.typed).toBe('a');
  expect(hasError(drill)).toBe(false);
});

test('打錯的字也會留下來，並記一次錯', () => {
  const drill = press(createDrill('ab'), 'x');
  expect(drill.typed).toBe('x');
  expect(drill.mistakes).toBe(1);
  expect(hasError(drill)).toBe(true);
});

test('有錯字時就算後面打對也不算完成', () => {
  const drill = typeAll('ab', 'xb');
  expect(isDone(drill)).toBe(false);
});

test('刪除鍵會刪掉最後一個字', () => {
  const drill = erase(typeAll('abc', 'ax'));
  expect(drill.typed).toBe('a');
  expect(hasError(drill)).toBe(false);
});

test('刪掉錯字再打對就能完成', () => {
  const drill = press(erase(typeAll('ab', 'ax')), 'b');
  expect(isDone(drill)).toBe(true);
});

test('沒有字可以刪的時候不會出錯', () => {
  const empty = createDrill('ab');
  expect(erase(empty)).toEqual(empty);
});

test('換行之後的縮排不用自己打', () => {
  const drill = typeAll('{\n    x\n}', '{\nx\n}');
  expect(isDone(drill)).toBe(true);
  expect(drill.mistakes).toBe(0);
});

test('在自動補上的縮排按刪除鍵，會回到上一行的行尾', () => {
  const drill = erase(typeAll('{\n    x', '{\n'));
  expect(drill.typed).toBe('{');
});

test('空白行可以直接再按一次換行', () => {
  expect(isDone(typeAll('a\n\nb', 'a\n\nb'))).toBe(true);
});

test('打滿之後再按不會繼續增加', () => {
  const full = typeAll('a', 'x');
  expect(press(full, 'z')).toEqual(full);
});

test('下一個要打的字', () => {
  expect(expectedChar(createDrill('#include'))).toBe('#');
});

test('符號知道要不要按住上檔鍵', () => {
  expect(findKey('#')).toEqual({ key: '3', shift: true });
  expect(findKey('<')).toEqual({ key: ',', shift: true });
  expect(findKey(';')).toEqual({ key: ';', shift: false });
  expect(findKey('\n')).toEqual({ key: 'Enter', shift: false });
});

test('樣板可以從頭打到完，每個字都找得到對應的鍵', () => {
  const template =
    '#include <bits/stdc++.h>\nusing namespace std;\n\nint main()\n{\n    cin.tie(nullptr)->sync_with_stdio(false);\n}';
  for (const char of template) {
    expect(findKey(char)).not.toBeNull();
  }
  const keys = template.replaceAll('\n    ', '\n');
  expect(isDone(typeAll(template, keys))).toBe(true);
});
