import { array, object, string } from '@/lib/zod';

import { listPath } from './packed';
import { type PrefetchMessage } from './protocol';

const listSchema = object({ parts: array(string().regex(/^[\da-f]{64}$/u)) });

const lanes = 3;
const quietMs = 20_000;
const complete = 100;

interface Run {
  readonly controller: AbortController;
  done: number;
  readonly queue: string[];
  readonly total: number;
}

const post = (message: PrefetchMessage): void => {
  globalThis.postMessage(message);
};

const drain = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  heard: () => void,
): Promise<void> => {
  const { done } = await reader.read();
  heard();
  if (done) {
    return;
  }
  await drain(reader, heard);
};

const keep = async (run: Run, name: string): Promise<void> => {
  let timer = setTimeout(() => {
    run.controller.abort();
  }, quietMs);
  const heard = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      run.controller.abort();
    }, quietMs);
  };
  try {
    const response = await fetch(`/parts/${name}`, {
      priority: 'low',
      signal: run.controller.signal,
    });
    if (!response.ok || response.body === null) {
      throw new Error(`part ${name} answered ${String(response.status)}`);
    }
    heard();
    await drain(response.body.getReader(), heard);
  } finally {
    clearTimeout(timer);
  }
};

const lane = async (run: Run): Promise<void> => {
  const name = run.queue.shift();
  if (name === undefined) {
    return;
  }
  await keep(run, name);
  run.done += 1;
  post({ kind: 'progress', percent: Math.floor((run.done * complete) / run.total) });
  await lane(run);
};

const fetchList = async (controller: AbortController): Promise<string[]> => {
  const timer = setTimeout(() => {
    controller.abort();
  }, quietMs);
  try {
    const response = await fetch(listPath, { priority: 'low', signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${listPath} answered ${String(response.status)}`);
    }
    return [...listSchema.parse(await response.json()).parts];
  } finally {
    clearTimeout(timer);
  }
};

const fetchAll = async (): Promise<void> => {
  const controller = new AbortController();
  post({ kind: 'progress', percent: 0 });
  const queue = await fetchList(controller);
  const run: Run = { controller, done: 0, queue, total: Math.max(queue.length, 1) };
  try {
    await Promise.all(Array.from({ length: lanes }, () => lane(run)));
  } catch (error) {
    controller.abort();
    throw error;
  }
};

const fetchAndTell = async (): Promise<void> => {
  try {
    await fetchAll();
    post({ kind: 'done' });
  } catch (error) {
    post({ kind: 'failed', reason: String(error) });
  }
};

await fetchAndTell();
