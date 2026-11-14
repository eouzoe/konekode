import { expect, test } from 'bun:test';

import { type LearningEvent } from '@/lib/record/event';

import { unitState, unlockedItems } from './progress';

let counter = 0;

const make = (kind: string, ref: string, at: number): LearningEvent => {
  counter += 1;
  return {
    actor: 'test',
    at,
    data: {},
    id: `event-${String(counter)}`,
    kind,
    ref,
    seq: counter,
    session: 'test',
    unit: 'start',
    version: 2,
  };
};

const shuffles = (events: readonly LearningEvent[]): LearningEvent[][] => [
  [...events],
  events.toReversed(),
  [...events.slice(2), ...events.slice(0, 2)],
];

test('沒有事件時從頭開始', () => {
  expect(unitState([], 'start')).toEqual({ passed: new Set(), position: null });
});

test('位置是最後到達的那一拍', () => {
  const events = [make('beat.reached', 'intro', 1), make('beat.reached', 'remember', 2)];
  expect(unitState(events, 'start').position).toBe('remember');
});

test('通過的檢查會累積', () => {
  const events = [make('check.passed', 'type-template', 1), make('check.passed', 'run-cout', 2)];
  expect(unitState(events, 'start').passed).toEqual(new Set(['type-template', 'run-cout']));
});

test('重新開始會清掉這個單元之前的進度', () => {
  const events = [
    make('beat.reached', 'run-cout', 1),
    make('check.passed', 'run-cout', 2),
    make('unit.restarted', '', 3),
    make('beat.reached', 'intro', 4),
  ];
  expect(unitState(events, 'start')).toEqual({ passed: new Set(), position: 'intro' });
});

test('別的單元的事件不影響這個單元', () => {
  const events = [
    make('beat.reached', 'intro', 1),
    { ...make('beat.reached', 'elsewhere', 2), unit: 'loops' },
  ];
  expect(unitState(events, 'start').position).toBe('intro');
});

test('事件的排列順序不影響結果', () => {
  const events = [
    make('beat.reached', 'intro', 1),
    make('check.passed', 'type-template', 2),
    make('beat.reached', 'run-cout', 3),
    make('check.passed', 'run-cout', 4),
  ];
  const expected = unitState(events, 'start');
  for (const order of shuffles(events)) {
    expect(unitState(order, 'start')).toEqual(expected);
  }
});

test('同一筆事件重複出現只算一次', () => {
  const events = [make('beat.reached', 'intro', 1), make('beat.reached', 'remember', 2)];
  expect(unitState([...events, ...events], 'start')).toEqual(unitState(events, 'start'));
});

test('同一時間的事件用識別碼決定先後，結果仍然固定', () => {
  const events = [make('beat.reached', 'first', 5), make('beat.reached', 'second', 5)];
  expect(unitState(events, 'start')).toEqual(unitState(events.toReversed(), 'start'));
});

test('沒看過的事件種類不影響進度', () => {
  const events = [make('beat.reached', 'intro', 1), make('drill.finished', '', 2)];
  expect(unitState(events, 'start')).toEqual({ passed: new Set(), position: 'intro' });
});

test('解鎖的項目由紀錄算出來，重新開始單元會收回該單元給的', () => {
  const events = [
    make('item.unlocked', 'pair.paren', 1),
    make('item.unlocked', 'pair.brace', 2),
    make('item.unlocked', 'pair.paren', 3),
  ];
  expect([...unlockedItems(events)].toSorted()).toEqual(['pair.brace', 'pair.paren']);
  const restarted = [
    ...events,
    make('unit.restarted', '', 4),
    make('item.unlocked', 'pair.quote', 5),
  ];
  expect([...unlockedItems(restarted)]).toEqual(['pair.quote']);
});

test('解鎖紀錄不會被當成通過檢查', () => {
  const state = unitState([make('item.unlocked', 'pair.paren', 1)], 'start');
  expect(state.passed.size).toBe(0);
});
