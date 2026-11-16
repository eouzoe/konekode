import { expect, test } from 'bun:test';

import { describe } from './outcome';

test('a compiler that is not ready is not blamed on the program', () => {
  const view = describe({ kind: 'unavailable', message: 'not loaded' });
  expect(view.status).toBe('執行不了');
  expect(view.status).not.toBe('編譯沒有過');
  expect(view.text).toContain('再執行一次');
});

test('a program that does not compile is reported as such', () => {
  const view = describe({ kind: 'compile-error', message: "main.cpp:7:15: error: expected ';'" });
  expect(view.status).toBe('編譯沒有過');
  expect(view.state).toBe('error');
});

test('a finished program shows its output, and a non-zero exit is an error', () => {
  expect(describe({ exitCode: 0, kind: 'finished', output: '11' })).toEqual({
    state: 'ok',
    status: '執行完成',
    text: '11',
  });
  expect(describe({ exitCode: 1, kind: 'finished', output: '' }).state).toBe('error');
  expect(describe({ kind: 'timeout' }).status).toBe('跑太久，已經停下來');
  expect(describe({ kind: 'crashed', message: 'boom' }).text).toBe('boom');
});
