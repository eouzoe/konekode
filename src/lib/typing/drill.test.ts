import { expect, test } from 'bun:test';

import { createDrill, expectedChar, isDone, press } from './drill';
import { findKey } from './keyboard';

const typeAll = (target: string, keys: string): ReturnType<typeof createDrill> => {
  let drill = createDrill(target);
  for (const key of keys) {
    drill = press(drill, key);
  }
  return drill;
};

test('打對才會前進', () => {
  const drill = press(createDrill('ab'), 'a');
  expect(drill.position).toBe(1);
  expect(drill.wrong).toBe(false);
});

test('打錯留在原地並記一次錯', () => {
  const drill = press(createDrill('ab'), 'x');
  expect(drill.position).toBe(0);
  expect(drill.mistakes).toBe(1);
  expect(drill.wrong).toBe(true);
});

test('換行之後的縮排不用自己打', () => {
  const drill = typeAll('{\n    x\n}', '{\nx\n}');
  expect(isDone(drill)).toBe(true);
  expect(drill.mistakes).toBe(0);
});

test('空白行可以直接再按一次換行', () => {
  const drill = typeAll('a\n\nb', 'a\n\nb');
  expect(isDone(drill)).toBe(true);
});

test('打完之後再按不會出錯', () => {
  const done = typeAll('a', 'a');
  expect(press(done, 'z')).toEqual(done);
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

test('樣板裡每個字都找得到對應的鍵', () => {
  const template =
    '#include <bits/stdc++.h>\nusing namespace std;\n\nint main()\n{\n    cin.tie(nullptr)->sync_with_stdio(false);\n}';
  for (const char of template) {
    expect(findKey(char)).not.toBeNull();
  }
});
