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

test('只解釋第一個錯誤，原始訊息也只留它自己的那幾行', () => {
  const message =
    "main.cpp:7:14: error: expected ';' after expression\n    7 |     cout << 7\n      |              ^\nmain.cpp:9:1: error: expected '}'\n2 errors generated.";
  expect(explain(message).split('\n')).toEqual([
    '第 7 行的最後面少了分號 ;',
    '',
    '編譯器的原始訊息：',
    "main.cpp:7:14: error: expected ';' after expression",
    '    7 |     cout << 7',
    '      |              ^',
  ]);
});

test('箭頭打反時，編譯器列出的一百多行候選不顯示', () => {
  const candidates = [...Array.from({ length: 120 }).keys()].map(
    (at) =>
      `/usr/include/c++/v1/ostream:${String(at + 1)}:1: note: candidate template ignored: could not match\n  ${String(at + 1)} | operator<<(basic_ostream<_CharT, _Traits>& __os)\n      | ^`,
  );
  const message = [
    "main.cpp:9:9: error: invalid operands to binary expression ('istream' and 'int')",
    '    9 |     cin << a;',
    '      |     ~~~ ^  ~',
    ...candidates,
    '1 error generated.',
  ].join('\n');
  const shown = explain(message).split('\n');
  expect(shown.at(-1)).toBe('      |     ~~~ ^  ~');
  expect(shown).toHaveLength(6);
});

test('前面有警告時，原始訊息從第一個錯誤開始', () => {
  const message =
    'main.cpp:9:17: warning: adding \'int\' to a string does not append to the string\n    9 |     cout << "a" + a;\nmain.cpp:9:21: error: expected expression\n    9 |     cout << ;\nfatal error: too many errors emitted, stopping now';
  expect(explain(message).split('\n').slice(3)).toEqual([
    'main.cpp:9:21: error: expected expression',
    '    9 |     cout << ;',
  ]);
});

test('看不懂的長訊息只留開頭幾行', () => {
  const message = [...Array.from({ length: 40 }).keys()]
    .map((at) => `line ${String(at)}`)
    .join('\n');
  expect(explain(message).split('\n')).toHaveLength(6);
});

test('沒看過的錯誤也指出是哪一行', () => {
  expect(first('main.cpp:3:1: error: something unusual')).toBe('第 3 行有電腦看不懂的地方。');
});

test('不是編譯器格式的訊息原樣顯示', () => {
  expect(explain('TypeError: failed to fetch')).toBe('TypeError: failed to fetch');
});
