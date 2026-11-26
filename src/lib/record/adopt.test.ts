import { expect, test } from 'bun:test';

import { adopt } from './adopt';
import { readEvents, type LearningEvent } from './event';
import { memoryPersistence } from './log';

const event = (id: string): LearningEvent => ({
  actor: 'a',
  at: 1,
  content: 'c',
  data: {},
  id,
  kind: 'k',
  ref: '',
  seq: 1,
  session: 's',
  site: 'v',
  unit: '',
  version: 3,
});

const idsIn = async (values: Promise<Array<unknown>>): Promise<Array<string>> => {
  const loaded = await values;
  return readEvents(loaded).map((value) => value.id);
};

test('what was kept in memory before the store opened, and what came after, both end up in the store', async () => {
  const memory = memoryPersistence();
  const store = memoryPersistence();
  const opening = Promise.withResolvers<typeof store>();
  const adoption = adopt(memory, opening.promise, 0);
  await adoption.persistence.append([event('before')]);
  opening.resolve(store);
  await adoption.done;
  await adoption.persistence.append([event('after')]);
  expect(await idsIn(store.load())).toEqual(['before', 'after']);
  expect(await idsIn(adoption.persistence.load())).toEqual(['before', 'after']);
});

test('a store that never opens leaves everything in memory', async () => {
  const memory = memoryPersistence();
  const adoption = adopt(memory, Promise.withResolvers<typeof memory>().promise, 0);
  await adoption.persistence.append([event('one')]);
  await adoption.persistence.remove(['one']);
  await adoption.persistence.append([event('two')]);
  expect(await idsIn(adoption.persistence.load())).toEqual(['two']);
});

test('a store that fails late keeps the memory and says so', async () => {
  const memory = memoryPersistence();
  const adoption = adopt(memory, Promise.reject(new Error('gone')), 0);
  await adoption.persistence.append([event('one')]);
  expect(adoption.done).rejects.toThrow('gone');
  expect(await idsIn(adoption.persistence.load())).toEqual(['one']);
});
