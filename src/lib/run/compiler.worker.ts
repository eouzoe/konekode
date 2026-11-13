import { commands } from '@yowasp/clang';

import { type CompileReply, type CompileRequest } from './protocol';
import { umbrella } from './umbrella';

const flags = ['-std=c++17', '-O1', '-fno-exceptions', '-Iinclude', 'main.cpp', '-o', 'main.wasm'];

const build = async (source: string, report: (text: string) => void): Promise<CompileReply> => {
  const decoder = new TextDecoder();
  const files = await commands['clang++'](
    flags,
    { include: { bits: { 'stdc++.h': umbrella } }, 'main.cpp': source },
    {
      stderr: (bytes) => {
        if (bytes !== null) {
          report(decoder.decode(bytes, { stream: true }));
        }
      },
      stdout: null,
    },
  );
  const wasm = files?.['main.wasm'];
  if (wasm instanceof Uint8Array) {
    return { ok: true, wasm };
  }
  return { message: '編譯沒有產生結果。', ok: false };
};

const compile = async (source: string): Promise<CompileReply> => {
  let message = '';
  try {
    return await build(source, (text) => {
      message += text;
    });
  } catch (error) {
    if (message === '') {
      return { message: String(error), ok: false };
    }
    return { message, ok: false };
  }
};

const answer = async (request: CompileRequest): Promise<void> => {
  globalThis.postMessage(await compile(request.source));
};

globalThis.addEventListener('message', (event: MessageEvent<CompileRequest>) => {
  void answer(event.data);
});
