import type { PrefetchMessage } from './protocol';

type Listener = (percent: number) => void;

const startLimit = 20_000;
const listeners = new Set<Listener>();

const watchPrefetch = (listener: Listener): void => {
  listeners.add(listener);
};

const tell = (percent: number): void => {
  for (const listener of listeners) {
    listener(percent);
  }
};

const fetchInWorker = async (): Promise<void> => {
  const worker = new Worker(new URL('prefetch.worker.ts', import.meta.url), { type: 'module' });
  const { promise, reject, resolve } = Promise.withResolvers<null>();
  const silent = setTimeout(() => {
    reject(new Error(`the download did not start within ${String(startLimit)} ms`));
  }, startLimit);
  worker.addEventListener('message', ({ data }: MessageEvent<PrefetchMessage>) => {
    clearTimeout(silent);
    if (data.kind === 'progress') {
      tell(data.percent);
      return;
    }
    if (data.kind === 'done') {
      resolve(null);
      return;
    }
    reject(new Error(data.reason));
  });
  worker.addEventListener('error', (event) => {
    reject(new Error(event.message));
  });
  try {
    await promise;
  } finally {
    clearTimeout(silent);
    worker.terminate();
  }
};

let running: Promise<void> | null = null;

const prefetchCompiler = async (): Promise<void> => {
  if (!import.meta.env.PROD) {
    return;
  }
  running ??= fetchInWorker();
  await running;
};

const prefetched = async (): Promise<boolean> => {
  try {
    await prefetchCompiler();
    return true;
  } catch {
    return false;
  }
};

export { prefetchCompiler, prefetched, watchPrefetch };
