import { type CompileReply, type Outcome, type RunReply, type RunRequest } from './protocol';

const timeLimit = 5000;

let compiler: Worker | null = null;

const getCompiler = (): Worker => {
  compiler ??= new Worker(new URL('compiler.worker.ts', import.meta.url), { type: 'module' });
  return compiler;
};

const once = <Reply>(worker: Worker, message: unknown): Promise<Reply> => {
  const { promise, reject, resolve } = Promise.withResolvers<Reply>();
  const controller = new AbortController();
  const { signal } = controller;
  worker.addEventListener(
    'message',
    (event: MessageEvent<Reply>) => {
      controller.abort();
      resolve(event.data);
    },
    { signal },
  );
  worker.addEventListener(
    'error',
    (event) => {
      controller.abort();
      reject(new Error(event.message));
    },
    { signal },
  );
  worker.postMessage(message);
  return promise;
};

const finish = async (worker: Worker, request: RunRequest): Promise<Outcome> => {
  const reply = await once<RunReply>(worker, request);
  return { exitCode: reply.exitCode, kind: 'finished', output: reply.output };
};

const execute = async (request: RunRequest): Promise<Outcome> => {
  const worker = new Worker(new URL('program.worker.ts', import.meta.url), { type: 'module' });
  const { promise: expired, resolve: expire } = Promise.withResolvers<Outcome>();
  const timer = setTimeout(() => {
    expire({ kind: 'timeout' });
  }, timeLimit);
  try {
    return await Promise.race([finish(worker, request), expired]);
  } catch (error) {
    return { kind: 'crashed', message: String(error) };
  } finally {
    clearTimeout(timer);
    worker.terminate();
  }
};

let pending: Promise<unknown> = Promise.resolve();

const compile = async (source: string): Promise<CompileReply> => {
  const previous = pending;
  const { promise, resolve } = Promise.withResolvers<null>();
  pending = promise;
  try {
    await previous;
    return await once<CompileReply>(getCompiler(), { source });
  } finally {
    resolve(null);
  }
};

const warmUp = async (): Promise<boolean> => {
  try {
    await compile('int main() {}');
    return true;
  } catch {
    return false;
  }
};

const runProgram = async (source: string, input: string): Promise<Outcome> => {
  const compiled = await compile(source);
  if (!compiled.ok) {
    return { kind: 'compile-error', message: compiled.message };
  }
  return execute({ input, wasm: compiled.wasm });
};

export { runProgram, warmUp };
