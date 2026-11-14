import { expect, test } from 'bun:test';

import { explain } from './explain';

const first = (message: string): string => explain(message).split('\n')[0] ?? '';

test('少了分號', () => {
  const message = "main.cpp:7:14: error: expected ';' after expression\n    7 |     cout << 7\n";
  expect(first(message)).toBe('第 7 行的最後面少了分號 ;');
});

test('打錯字而且編譯器猜得到', () => {
  const message = "main.cpp:7:5: error: use of undeclared identifier 'cot'; did you mean 'cout'?";
  expect(first(message)).toBe('第 7 行的 cot，電腦不認識這個名字。是不是想打 cout？');
});

test('沒宣告的名字', () => {
  const message = "main.cpp:8:13: error: use of undeclared identifier 'b'";
  expect(first(message)).toContain('第 8 行的 b');
});

test('箭頭方向反了', () => {
  const message =
    "main.cpp:7:10: error: invalid operands to binary expression ('ostream' and 'int')";
  expect(first(message)).toContain('箭頭方向可能反了');
});

test('只解釋第一個錯誤，並保留原始訊息', () => {
  const message =
    "main.cpp:7:14: error: expected ';' after expression\nmain.cpp:9:1: error: expected '}'\n2 errors generated.";
  const text = explain(message);
  expect(text.split('\n')[0]).toBe('第 7 行的最後面少了分號 ;');
  expect(text).toContain('編譯器的原始訊息：');
  expect(text).toContain('2 errors generated.');
});

test('沒看過的錯誤也指出是哪一行', () => {
  expect(first('main.cpp:3:1: error: something unusual')).toBe('第 3 行有電腦看不懂的地方。');
});

test('不是編譯器格式的訊息原樣顯示', () => {
  expect(explain('TypeError: failed to fetch')).toBe('TypeError: failed to fetch');
});
