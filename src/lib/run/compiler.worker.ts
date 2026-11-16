import { type CompileMessage, type CompileReply, type CompileRequest } from './protocol';
import { umbrella } from './umbrella';

import type { commands } from '@yowasp/clang';

const flags = ['-std=c++17', '-O1', '-fno-exceptions', '-Iinclude', 'main.cpp', '-o', 'main.wasm'];

let reported = -1;

const complete = 100;

const post = (message: CompileMessage): void => {
  globalThis.postMessage(message);
};

const reportLoading = (done: number, total: number): void => {
  const percent = Math.floor((done * complete) / total);
  if (percent !== reported) {
    reported = percent;
    post({ kind: 'progress', percent });
  }
};

const load = async (): Promise<typeof commands> => {
  const clang = await import('@yowasp/clang');
  await clang.runLLVM(undefined, undefined, {
    fetchProgress: ({ doneLength, totalLength }) => {
      reportLoading(doneLength, totalLength);
    },
  });
  return clang.commands;
};

let loading: ReturnType<typeof load> | null = null;

const ready = async (): Promise<typeof commands | null> => {
  loading ??= load();
  try {
    return await loading;
  } catch {
    loading = null;
    return null;
  }
};

const build = async (
  tools: typeof commands,
  source: string,
  report: (text: string) => void,
): Promise<CompileReply> => {
  const decoder = new TextDecoder();
  const files = await tools['clang++'](
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
  return { cause: 'compiler', message: 'no output', ok: false };
};

const compile = async (source: string): Promise<CompileReply> => {
  const tools = await ready();
  if (tools === null) {
    return { cause: 'compiler', message: 'not loaded', ok: false };
  }
  let message = '';
  try {
    return await build(tools, source, (text) => {
      message += text;
    });
  } catch (error) {
    if (message === '') {
      return { cause: 'compiler', message: String(error), ok: false };
    }
    return { cause: 'program', message, ok: false };
  }
};

const answer = async (request: CompileRequest): Promise<void> => {
  post({ kind: 'done', reply: await compile(request.source) });
};

globalThis.addEventListener('message', (event: MessageEvent<CompileRequest>) => {
  void answer(event.data);
});
