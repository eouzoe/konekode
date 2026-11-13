import { File, OpenFile, WASI, WASIProcExit } from '@bjorn3/browser_wasi_shim';

import { type RunReply, type RunRequest } from './protocol';

const isStartable = (
  exports: WebAssembly.Exports,
): exports is { _start: () => unknown; memory: WebAssembly.Memory } =>
  typeof exports._start === 'function' && exports.memory instanceof WebAssembly.Memory;

const start = (wasi: WASI, instance: WebAssembly.Instance): number => {
  if (!isStartable(instance.exports)) {
    throw new TypeError('這不是可以執行的程式。');
  }
  try {
    return wasi.start({ exports: instance.exports });
  } catch (error) {
    if (error instanceof WASIProcExit) {
      return error.code;
    }
    throw error;
  }
};

const run = async (request: RunRequest): Promise<RunReply> => {
  const output = new File([]);
  const errors = new File([]);
  const input = new File(new TextEncoder().encode(request.input));
  const wasi = new WASI([], [], [new OpenFile(input), new OpenFile(output), new OpenFile(errors)]);
  const module = await WebAssembly.compile(request.wasm);
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });
  const exitCode = start(wasi, instance);
  return { exitCode, output: new TextDecoder().decode(output.data) };
};

const answer = async (request: RunRequest): Promise<void> => {
  globalThis.postMessage(await run(request));
};

globalThis.addEventListener('message', (event: MessageEvent<RunRequest>) => {
  void answer(event.data);
});
