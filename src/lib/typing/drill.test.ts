import { expect, test } from 'bun:test';

import {
  createDrill,
  escape,
  expectedChar,
  isDone,
  isTyped,
  press,
  remind,
  type Drill,
} from './drill';
import { findKey } from './keyboard';

const typeAll = (target: string, keys: string): Drill => {
  let drill = createDrill(target);
  for (const key of keys) {
    drill = press(drill, key);
  }
  return drill;
};

test('一開始是下指令的狀態，按別的鍵打不出字', () => {
  const drill = press(createDrill('ab'), 'a');
  expect(drill.position).toBe(0);
  expect(drill.mode).toBe('normal');
  expect(drill.feedback).toBe('need-insert');
});

test('按 i 之後才能打字，i 本身不算打進去', () => {
  const drill = typeAll('ab', 'ia');
  expect(drill.mode).toBe('insert');
  expect(drill.position).toBe(1);
});

test('要打的第一個字剛好是 i 時，第一次按 i 仍然只是進入輸入', () => {
  const drill = typeAll('int', 'i');
  expect(drill.position).toBe(0);
  expect(typeAll('int', 'iint').position).toBe(3);
});

test('打錯留在原地並記一次錯', () => {
  const drill = typeAll('ab', 'ix');
  expect(drill.position).toBe(0);
  expect(drill.mistakes).toBe(1);
  expect(drill.feedback).toBe('wrong-key');
});

test('打完之後還要按 Esc 才算完成', () => {
  const typed = typeAll('ab', 'iab');
  expect(isTyped(typed)).toBe(true);
  expect(isDone(typed)).toBe(false);
  expect(isDone(escape(typed))).toBe(true);
});

test('打完之後多按的鍵算按錯，不會前進', () => {
  const extra = press(typeAll('a', 'ia'), 'z');
  expect(extra.position).toBe(1);
  expect(extra.feedback).toBe('wrong-key');
});

test('中途按 Esc 會回到下指令的狀態，再按 i 可以接著打', () => {
  const paused = escape(typeAll('abc', 'ia'));
  expect(paused.mode).toBe('normal');
  expect(isDone(paused)).toBe(false);
  expect(press(press(paused, 'i'), 'b').position).toBe(2);
});

test('換行之後的縮排不用自己打', () => {
  const drill = escape(typeAll('{\n    x\n}', 'i{\nx\n}'));
  expect(isDone(drill)).toBe(true);
  expect(drill.mistakes).toBe(0);
});

test('完成之後不會再變動', () => {
  const done = escape(typeAll('a', 'ia'));
  expect(press(done, 'i')).toEqual(done);
  expect(remind(done, 'no-delete')).toEqual(done);
});

test('提醒只改提示，不改進度', () => {
  const drill = remind(typeAll('ab', 'ia'), 'no-delete');
  expect(drill.position).toBe(1);
  expect(drill.feedback).toBe('no-delete');
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

test('樣板可以從頭打到完', () => {
  const template =
    '#include <bits/stdc++.h>\nusing namespace std;\n\nint main()\n{\n    cin.tie(nullptr)->sync_with_stdio(false);\n}';
  for (const char of template) {
    expect(findKey(char)).not.toBeNull();
  }
  const keys = `i${template.replaceAll('\n    ', '\n')}`;
  const finished = escape(typeAll(template, keys));
  expect(isDone(finished)).toBe(true);
});
