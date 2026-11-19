import { expect, test } from 'bun:test';

import { readEvent, type LearningEvent } from './event';
import { createLog, memoryPersistence, type Persistence, type Source } from './log';

const source = (persistence: Persistence, faults: unknown[] = []): Source => {
  let clock = 1000;
  let count = 0;
  return {
    actor: 'someone',
    content: 'content-a',
    newId: () => {
      count += 1;
      return `id-${String(count)}`;
    },
    now: () => {
      clock += 1;
      return clock;
    },
    onFault: (error) => {
      faults.push(error);
    },
    persistence,
    session: 'session-a',
    site: 'site-a',
  };
};

test('寫入的事件帶有是誰、哪一次使用、順序與數值', async () => {
  const log = await createLog(source(memoryPersistence()));
  const first = log.track('beat.reached', { ref: 'intro', unit: 'start' });
  const second = log.track('drill.finished', { data: { mistakes: 3, ms: 4200 }, unit: 'start' });
  expect(first).toMatchObject({ actor: 'someone', kind: 'beat.reached', ref: 'intro', seq: 1 });
  expect(first.session).toBe('session-a');
  expect(second.seq).toBe(2);
  expect(second.data).toEqual({ mistakes: 3, ms: 4200 });
  expect(second.ref).toBe('');
  expect(log.events()).toEqual([first, second]);
});

test('寫入的事件會存起來，重新開啟後讀得回來', async () => {
  const persistence = memoryPersistence();
  const before = await createLog(source(persistence));
  before.track('beat.reached', { ref: 'intro', unit: 'start' });
  before.track('check.passed', { ref: 'run-cout', unit: 'start' });
  await before.flush();
  const after = await createLog(source(persistence));
  expect(after.events().map((event) => event.kind)).toEqual(['beat.reached', 'check.passed']);
});

test('訂閱的人會收到之後寫入的每一筆', async () => {
  const log = await createLog(source(memoryPersistence()));
  const seen: string[] = [];
  log.subscribe((event) => {
    seen.push(event.kind);
  });
  log.track('one');
  log.track('two');
  expect(seen).toEqual(['one', 'two']);
});

test('one write is in flight at a time, and everything that arrived meanwhile goes in the next', async () => {
  const writes: string[][] = [];
  const gate = Promise.withResolvers<null>();
  const slow: Persistence = {
    append: async (events) => {
      writes.push(events.map((event) => event.kind));
      await gate.promise;
    },
    load: () => Promise.resolve([]),
    remove: () => Promise.resolve(),
  };
  const log = await createLog(source(slow));
  log.track('one');
  await Promise.resolve();
  log.track('two');
  log.track('three');
  log.track('four');
  await Promise.resolve();
  expect(writes).toEqual([['one']]);
  gate.resolve(null);
  await log.flush();
  expect(writes).toEqual([['one'], ['two', 'three', 'four']]);
});

test('an event is handed to the store at once when no write is in flight', async () => {
  const persistence = memoryPersistence();
  const log = await createLog(source(persistence));
  log.track('one');
  await Promise.resolve();
  await Promise.resolve();
  expect(await persistence.load()).toHaveLength(1);
});

test('儲存失敗不會讓寫入中斷，而且每一次失敗都會回報', async () => {
  const faults: unknown[] = [];
  const broken: Persistence = {
    append: async () => {
      await Promise.resolve();
      throw new Error('存不進去');
    },
    load: () => Promise.resolve([]),
    remove: () => Promise.resolve(),
  };
  const log = await createLog(source(broken, faults));
  log.track('one');
  await log.flush();
  log.track('two');
  await log.flush();
  expect(log.events()).toHaveLength(2);
  expect(faults.map(String)).toEqual(['Error: 存不進去', 'Error: 存不進去']);
});

test('forgotten events leave the store and stay in memory until the page goes', async () => {
  const persistence = memoryPersistence();
  const log = await createLog(source(persistence));
  const key = log.track('key.down');
  log.track('beat.reached', { ref: 'intro', unit: 'start' });
  log.forget([key.id]);
  await log.flush();
  const reopened = await createLog(source(persistence));
  expect(log.events().map((event) => event.kind)).toEqual(['key.down', 'beat.reached']);
  expect(reopened.events().map((event) => event.kind)).toEqual(['beat.reached']);
});

test('舊格式的事件會被升級成新格式', () => {
  const old = {
    at: 5,
    device: 'old-device',
    id: 'e1',
    kind: 'beat.reached',
    ref: 'intro',
    unit: 'start',
    version: 1,
  };
  expect(readEvent(old)).toEqual({
    actor: 'old-device',
    at: 5,
    content: '',
    data: {},
    id: 'e1',
    kind: 'beat.reached',
    ref: 'intro',
    seq: 0,
    session: 'legacy',
    site: '',
    unit: 'start',
    version: 3,
  });
});

const good: LearningEvent = {
  actor: 'a',
  at: 1,
  content: 'c',
  data: {},
  id: 'e1',
  kind: 'k',
  ref: '',
  seq: 1,
  session: 's',
  site: 'v',
  unit: '',
  version: 3,
};

test('形狀不對的資料不算事件', async () => {
  expect(readEvent(good)).toEqual(good);
  expect(readEvent(null)).toBeNull();
  expect(readEvent({ ...good, at: 1.5 })).toBeNull();
  expect(readEvent({ ...good, kind: '' })).toBeNull();
  expect(readEvent({ ...good, version: 4 })).toBeNull();
  expect(readEvent({ ...good, data: { nested: {} } })).toBeNull();
  const log = await createLog(source(memoryPersistence([good, { broken: true }, null])));
  expect(log.events()).toHaveLength(1);
});

test('events from before contents were labelled are read, marked unlabelled, and counted with the unreadable', async () => {
  const unlabelled = Object.fromEntries(
    Object.entries({ ...good, id: 'e2', version: 2 }).filter(
      ([field]) => field !== 'content' && field !== 'site',
    ),
  );
  expect(readEvent(unlabelled)).toEqual({ ...good, content: '', id: 'e2', site: '' });
  const log = await createLog(source(memoryPersistence([good, unlabelled, { broken: true }])));
  expect(log.events().map((event) => event.id)).toEqual(['e1', 'e2']);
  expect(log.loaded).toEqual({ unlabelled: 1, unreadable: 1 });
});

test('every new event carries the content and the site it was recorded under', async () => {
  const log = await createLog(source(memoryPersistence()));
  expect(log.track('one')).toMatchObject({ content: 'content-a', site: 'site-a', version: 3 });
});

test('the time on events only moves forward, even when the clock steps back or a new visit starts earlier', async () => {
  const persistence = memoryPersistence();
  const times = [5000, 5001, 2400, 2401];
  const first = await createLog({ ...source(persistence), now: () => times.shift() ?? 0 });
  const stamps = ['one', 'two', 'three', 'four'].map((kind) => first.track(kind).at);
  expect(stamps).toEqual([5000, 5001, 5002, 5003]);
  await first.flush();
  const second = await createLog({ ...source(persistence), now: () => 100 });
  expect(second.track('five').at).toBe(5004);
});
