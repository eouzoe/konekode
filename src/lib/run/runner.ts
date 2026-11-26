import { knownOutcome } from './known';
import { prefetched, watchPrefetch } from './prefetch';

import type { CompileMessage, CompileReply, Outcome, RunReply, RunRequest } from './protocol';

type Listener = (percent: number) => void;

const timeLimit = 5000;
const complete = 100;
const listeners = new Set<Listener>();

const quiet = { compiling: 30_000, loading: 20_000 };

let compiler: Worker | null = null;
let loaded = 0;
let fetched = 0;

const getCompiler = (): Worker => {
  compiler ??= new Worker(new URL('compiler.worker.ts', import.meta.url), { type: 'module' });
  return compiler;
};

const discard = (worker: Worker): void => {
  if (worker === compiler) {
    compiler = null;
    loaded = 0;
    worker.terminate();
  }
};

const watchLoading = (listener: Listener): void => {
  listeners.add(listener);
};

const loadedPercent = (): number => Math.max(loaded, fetched);

const quietLimit = (): number => {
  if (loaded < complete) {
    return quiet.loading;
  }
  return quiet.compiling;
};

const tell = (): void => {
  for (const listener of listeners) {
    listener(loadedPercent());
  }
};

watchPrefetch((percent) => {
  fetched = percent;
  tell();
});

const readCompile = ({ data: message }: MessageEvent<CompileMessage>): CompileReply | null => {
  if (message.kind === 'done') {
    return message.reply;
  }
  if (message.kind === 'alive') {
    return null;
  }
  loaded = message.percent;
  tell();
  return null;
};

const readRun = ({ data }: MessageEvent<RunReply>): RunReply => data;

interface Exchange<Reply> {
  readonly limit: (() => number) | null;
  readonly message: unknown;
  readonly read: (event: MessageEvent) => Reply | null;
  readonly worker: Worker;
}

interface Watchdog {
  readonly restart: () => void;
  readonly stop: () => void;
}

const watchdog = (limit: (() => number) | null, onQuiet: (quietFor: number) => void): Watchdog => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  };
  const restart = (): void => {
    if (limit === null) {
      return;
    }
    stop();
    const quietFor = limit();
    timer = setTimeout(() => {
      onQuiet(quietFor);
    }, quietFor);
  };
  return { restart, stop };
};

interface Handlers {
  readonly error: (event: ErrorEvent) => void;
  readonly message: (event: MessageEvent) => void;
}

const listen = (worker: Worker, signal: AbortSignal, handlers: Handlers): void => {
  worker.addEventListener('message', handlers.message, { signal });
  worker.addEventListener('error', handlers.error, { signal });
};

const once = <Reply>({ limit, message, read, worker }: Exchange<Reply>): Promise<Reply> => {
  const { promise, reject, resolve } = Promise.withResolvers<Reply>();
  const controller = new AbortController();
  const settle = (): void => {
    guard.stop();
    controller.abort();
  };
  const fail = (error: Error): void => {
    settle();
    discard(worker);
    reject(error);
  };
  const guard = watchdog(limit, (quietFor) => {
    fail(new Error(`the compiler said nothing for ${String(quietFor)} ms`));
  });
  listen(worker, controller.signal, {
    error: (event) => {
      fail(new Error(event.message));
    },
    message: (event) => {
      const reply = read(event);
      if (reply === null) {
        guard.restart();
        return;
      }
      settle();
      resolve(reply);
    },
  });
  guard.restart();
  worker.postMessage(message);
  return promise;
};

const finish = async (worker: Worker, request: RunRequest): Promise<Outcome> => {
  const reply = await once({ limit: null, message: request, read: readRun, worker });
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
    await prefetched();
    return await once({
      limit: quietLimit,
      message: { source },
      read: readCompile,
      worker: getCompiler(),
    });
  } catch (error) {
    return { cause: 'compiler', message: String(error), ok: false };
  } finally {
    resolve(null);
  }
};

const warmUp = async (): Promise<boolean> => {
  const reply = await compile('int main() {}');
  return reply.ok;
};

const isKnown = (source: string, input: string): boolean => knownOutcome(source, input) !== null;

const runProgram = async (source: string, input: string): Promise<Outcome> => {
  const known = knownOutcome(source, input);
  if (known !== null) {
    return known;
  }
  const compiled = await compile(source);
  if (!compiled.ok && compiled.cause === 'compiler') {
    return { kind: 'unavailable', message: compiled.message };
  }
  if (!compiled.ok) {
    return { kind: 'compile-error', message: compiled.message };
  }
  return execute({ input, wasm: compiled.wasm });
};

export { isKnown, loadedPercent, runProgram, warmUp, watchLoading };
