import { expect, test } from 'bun:test';

import { createActor } from 'xstate';
import { getShortestPaths } from 'xstate/graph';

import { sceneMachine, type BeatMeta, type SceneEvent } from './machine';

const plain = (id: string): BeatMeta => ({ expect: null, id, next: false, wait: '', when: '' });

const beats: BeatMeta[] = [
  plain('ask'),
  { ...plain('yes'), when: 'fullscreen' },
  { ...plain('no'), when: 'windowed' },
  { ...plain('demo'), next: true },
  { ...plain('type'), wait: 'drill' },
  { ...plain('print'), expect: '7', wait: 'run' },
  plain('end'),
];

const start = (position: string | null = null, passed: string[] = []) => {
  const actor = createActor(sceneMachine, { input: { beats, passed, position } });
  actor.start();
  return actor;
};

const at = (actor: ReturnType<typeof start>): string => {
  const { context } = actor.getSnapshot();
  return beats[context.index]?.id ?? '';
};

const next: SceneEvent = { full: false, type: 'NEXT' };
const back: SceneEvent = { full: false, type: 'BACK' };
const typed: SceneEvent = { full: false, kind: 'drill', output: '', type: 'CHECKED' };
const printed = (output: string): SceneEvent => ({
  full: false,
  kind: 'run',
  output,
  type: 'CHECKED',
});

test('往下時跳過不符合畫面狀態的拍子', () => {
  const windowed = start();
  windowed.send(next);
  expect(at(windowed)).toBe('no');
  const full = start();
  full.send({ full: true, type: 'NEXT' });
  expect(at(full)).toBe('yes');
  full.send({ full: true, type: 'NEXT' });
  expect(at(full)).toBe('demo');
});

test('往回時同樣跳過不符合的拍子', () => {
  const actor = start('demo');
  actor.send({ full: true, type: 'BACK' });
  expect(at(actor)).toBe('yes');
});

test('第一拍不能再往回，最後一拍不能再往下', () => {
  const first = start();
  first.send(back);
  expect(at(first)).toBe('ask');
  const last = start('end');
  last.send(next);
  expect(at(last)).toBe('end');
});

test('示範播完只在標記要接下一句的拍子自動往下', () => {
  const actor = start('demo');
  actor.send({ full: false, type: 'PLAYED' });
  expect(at(actor)).toBe('type');
  const other = start('ask');
  other.send({ full: false, type: 'PLAYED' });
  expect(at(other)).toBe('ask');
});

test('打字練習沒完成前不能往下，完成後停在原地等按鍵', () => {
  const actor = start('type');
  expect(actor.getSnapshot().value).toBe('blocked');
  actor.send(next);
  actor.send({ full: false, type: 'AUTO' });
  expect(at(actor)).toBe('type');
  actor.send(typed);
  expect(at(actor)).toBe('type');
  expect(actor.getSnapshot().value).toBe('ready');
  actor.send(next);
  expect(at(actor)).toBe('print');
});

test('執行結果不對時留在原地並標記，結果對了自動往下', () => {
  const actor = start('print');
  actor.send(printed('8'));
  expect(at(actor)).toBe('print');
  expect(actor.getSnapshot().context.mismatch).toBe(true);
  actor.send(typed);
  expect(at(actor)).toBe('print');
  actor.send(printed(' 7\n'));
  expect(at(actor)).toBe('end');
  expect(actor.getSnapshot().context.mismatch).toBe(false);
  expect(actor.getSnapshot().context.passed).toEqual(['print']);
});

test('已經通過的檢查，回來時不用再做一次', () => {
  const actor = start('type', ['type']);
  expect(actor.getSnapshot().value).toBe('ready');
  actor.send(next);
  expect(at(actor)).toBe('print');
  actor.send(back);
  expect(at(actor)).toBe('type');
  expect(actor.getSnapshot().value).toBe('ready');
});

test('等待中仍然可以往回，換拍後清掉錯誤標記', () => {
  const actor = start('print');
  actor.send(printed('8'));
  actor.send(back);
  expect(at(actor)).toBe('type');
  expect(actor.getSnapshot().context.mismatch).toBe(false);
});

test('不管怎麼操作，都不會越過還沒通過的檢查', () => {
  const events: SceneEvent[] = [
    next,
    back,
    typed,
    printed('7'),
    printed('8'),
    { full: true, type: 'NEXT' },
    { full: true, type: 'BACK' },
    { full: false, type: 'AUTO' },
    { full: false, type: 'PLAYED' },
  ];
  const paths = getShortestPaths(sceneMachine, {
    events,
    input: { beats, passed: [], position: null },
  });
  const reached = new Set<string>();
  for (const path of paths) {
    const { context } = path.state;
    reached.add(beats[context.index]?.id ?? '');
    const skipped = beats
      .slice(0, context.index)
      .filter((beat) => beat.wait !== '' && !context.passed.includes(beat.id));
    expect(skipped).toEqual([]);
  }
  expect([...reached].toSorted()).toEqual(beats.map((beat) => beat.id).toSorted());
});
