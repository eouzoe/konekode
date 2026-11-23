import { describe, expect, test } from 'bun:test';

import { type Due, type Link, type Step } from './plan';
import { createSupply, type Loader } from './supply';

const sentence: Step = { say: '一二三四五六七八九十', stage: 'empty' };
const steps: readonly Step[] = Array.from({ length: 20 }, () => sentence);
const fast: Link = { bitsPerMs: 100_000, latencyMs: 10 };

const due = (name: string, by: number, gate = true): Due => ({
  by,
  bytes: 1024,
  early: true,
  gate,
  name,
});

interface Pending {
  readonly name: string;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

const harness = (dues: readonly Due[]) => {
  const started: Pending[] = [];
  const settles: number[] = [];
  const failures: string[] = [];
  const connected: boolean[] = [];
  const loader =
    (name: string): Loader =>
    async () => {
      const { promise, reject, resolve } = Promise.withResolvers<null>();
      started.push({
        name,
        reject,
        resolve: () => {
          resolve(null);
        },
      });
      await promise;
    };
  const supply = createSupply({
    dues,
    link: () => fast,
    loaders: Object.fromEntries(dues.map((one) => [one.name, loader(one.name)])),
    onFailure: (name) => {
      failures.push(name);
    },
    onSettle: () => {
      settles.push(started.length);
    },
    online: () => connected.at(-1) ?? true,
    steps,
  });
  return { connected, failures, settles, started, supply };
};

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('the supply', () => {
  test('nothing is fetched while every deadline is far away', () => {
    const { started, supply } = harness([due('drill', 15)]);
    supply.advance(0);
    expect(started).toEqual([]);
    expect(supply.missing(0)).toEqual([]);
  });

  test('a need is fetched once the learner is a few sentences from it', () => {
    const { started, supply } = harness([due('drill', 15)]);
    supply.advance(12);
    expect(started.map((one) => one.name)).toEqual(['drill']);
  });

  test('one thing at a time, earliest deadline first, even when a later one is due to start', async () => {
    const { started, supply } = harness([due('drill', 15), due('editor', 16)]);
    supply.advance(14);
    expect(started.map((one) => one.name)).toEqual(['drill']);
    started[0]?.resolve();
    await settle();
    expect(started.map((one) => one.name)).toEqual(['drill', 'editor']);
  });

  test('a sentence whose need has not arrived is reported as missing until it does', async () => {
    const { started, supply } = harness([due('drill', 3)]);
    supply.advance(3);
    expect(supply.missing(3)).toEqual(['drill']);
    started[0]?.resolve();
    await settle();
    expect(supply.missing(3)).toEqual([]);
  });

  test('waiting for a sentence ends once what it needs has arrived', async () => {
    const { settles, started, supply } = harness([due('drill', 3), due('editor', 4)]);
    let done = false;
    const finish = async (): Promise<void> => {
      await supply.until(4);
      done = true;
    };
    const waiting = finish();
    await settle();
    expect(done).toBe(false);
    started[0]?.resolve();
    await settle();
    expect(done).toBe(false);
    started[1]?.resolve();
    await waiting;
    expect(done).toBe(true);
    expect(settles).toEqual([1, 2]);
  });

  test('offline, nothing is fetched ahead and a failure is not a fault; online again, it goes on', async () => {
    const { connected, failures, started, supply } = harness([due('drill', 3), due('editor', 12)]);
    connected.push(false);
    supply.advance(10);
    expect(started.map((one) => one.name)).toEqual(['drill']);
    started[0]?.reject(new Error('offline'));
    await settle();
    expect(failures).toEqual([]);
    expect(started).toHaveLength(1);
    connected.push(true);
    supply.resume();
    expect(started.map((one) => one.name)).toEqual(['drill', 'drill']);
  });

  test('a need that is not a gate never holds a sentence back', () => {
    const { supply } = harness([due('compiler', 3, false)]);
    supply.advance(5);
    expect(supply.missing(5)).toEqual([]);
  });

  test('a failed fetch is tried again when the learner moves on', async () => {
    const { failures, started, supply } = harness([due('drill', 3)]);
    supply.advance(3);
    started[0]?.reject(new Error('offline'));
    await settle();
    expect(failures).toEqual(['drill']);
    expect(supply.missing(3)).toEqual(['drill']);
    supply.advance(4);
    expect(started.map((one) => one.name)).toEqual(['drill', 'drill']);
  });
});
