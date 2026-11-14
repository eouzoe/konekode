import { expect, test } from 'bun:test';

import { readEvent, type LearningEvent } from './event';
import { createLog, memoryPersistence, type Persistence, type Source } from './log';

const source = (persistence: Persistence): Source => {
  let clock = 1000;
  let count = 0;
  return {
    actor: 'someone',
    newId: () => {
      count += 1;
      return `id-${String(count)}`;
    },
    now: () => {
      clock += 1;
      return clock;
    },
    persistence,
    session: 'session-a',
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

test('每一筆事件發生時就立刻交給儲存，不用等前一筆寫完', async () => {
  const started: string[] = [];
  const gate = Promise.withResolvers<null>();
  const slow: Persistence = {
    append: async (event) => {
      started.push(event.kind);
      await gate.promise;
    },
    load: () => Promise.resolve([]),
  };
  const log = await createLog(source(slow));
  log.track('one');
  log.track('two');
  log.track('three');
  expect(started).toEqual(['one', 'two', 'three']);
  gate.resolve(null);
  await log.flush();
});

test('儲存失敗不會讓寫入中斷', async () => {
  const broken: Persistence = {
    append: async () => {
      await Promise.resolve();
      throw new Error('存不進去');
    },
    load: () => Promise.resolve([]),
  };
  const log = await createLog(source(broken));
  log.track('one');
  log.track('two');
  await log.flush();
  expect(log.events()).toHaveLength(2);
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
    data: {},
    id: 'e1',
    kind: 'beat.reached',
    ref: 'intro',
    seq: 0,
    session: 'legacy',
    unit: 'start',
    version: 2,
  });
});

test('形狀不對的資料不算事件', async () => {
  const good: LearningEvent = {
    actor: 'a',
    at: 1,
    data: {},
    id: 'e1',
    kind: 'k',
    ref: '',
    seq: 1,
    session: 's',
    unit: '',
    version: 2,
  };
  expect(readEvent(good)).toEqual(good);
  expect(readEvent(null)).toBeNull();
  expect(readEvent({ ...good, at: 1.5 })).toBeNull();
  expect(readEvent({ ...good, kind: '' })).toBeNull();
  expect(readEvent({ ...good, version: 3 })).toBeNull();
  expect(readEvent({ ...good, data: { nested: {} } })).toBeNull();
  const log = await createLog(source(memoryPersistence([good, { broken: true }, null])));
  expect(log.events()).toHaveLength(1);
});
