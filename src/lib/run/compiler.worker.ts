import { baseFlags, pchMagic, pchName, pchUrl } from './flags';
import { type CompileMessage, type CompileReply, type CompileRequest } from './protocol';
import { umbrella } from './umbrella';

import type { commands } from '@yowasp/clang';

interface Tools {
  readonly commands: typeof commands;
  header: Uint8Array | null;
}

const outputs = ['main.cpp', '-o', 'main.wasm'];
const headerTrouble = /precompiled header|PCH file/iu;

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

const isHeader = (bytes: Uint8Array): boolean =>
  new TextDecoder().decode(bytes.subarray(0, pchMagic.length)) === pchMagic;

const fetchHeader = async (): Promise<Uint8Array | null> => {
  try {
    const response = await fetch(pchUrl);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (response.ok && isHeader(bytes)) {
      return bytes;
    }
    return null;
  } catch {
    return null;
  }
};

const load = async (): Promise<Tools> => {
  const clang = await import('@yowasp/clang');
  const [header] = await Promise.all([
    fetchHeader(),
    clang.runLLVM(undefined, undefined, {
      fetchProgress: ({ doneLength, totalLength }) => {
        reportLoading(doneLength, totalLength);
      },
    }),
  ]);
  return { commands: clang.commands, header };
};

let loading: ReturnType<typeof load> | null = null;

const ready = async (): Promise<Tools | null> => {
  loading ??= load();
  try {
    return await loading;
  } catch {
    loading = null;
    return null;
  }
};

const flagsFor = (header: Uint8Array | null): string[] => {
  if (header === null) {
    return [...baseFlags, ...outputs];
  }
  return [...baseFlags, '-include-pch', pchName, ...outputs];
};

type Files = NonNullable<Parameters<(typeof commands)['clang++']>[1]>;

const treeFor = (source: string, header: Uint8Array | null): Files => {
  const tree: Files = { include: { bits: { 'stdc++.h': umbrella } }, 'main.cpp': source };
  if (header !== null) {
    tree[pchName] = header;
  }
  return tree;
};

const build = async (
  tools: Tools,
  source: string,
  report: (text: string) => void,
): Promise<CompileReply> => {
  const decoder = new TextDecoder();
  const files = await tools.commands['clang++'](
    flagsFor(tools.header),
    treeFor(source, tools.header),
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

const attempt = async (tools: Tools, source: string): Promise<CompileReply> => {
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

const compile = async (source: string): Promise<CompileReply> => {
  const tools = await ready();
  if (tools === null) {
    return { cause: 'compiler', message: 'not loaded', ok: false };
  }
  const reply = await attempt(tools, source);
  if (reply.ok || tools.header === null || !headerTrouble.test(reply.message)) {
    return reply;
  }
  tools.header = null;
  return attempt(tools, source);
};

const answer = async (request: CompileRequest): Promise<void> => {
  post({ kind: 'done', reply: await compile(request.source) });
};

globalThis.addEventListener('message', (event: MessageEvent<CompileRequest>) => {
  void answer(event.data);
});
