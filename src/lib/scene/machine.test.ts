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
  actor.send({ type: 'REVEALED' });
  return actor;
};

const go = (actor: ReturnType<typeof start>, event: SceneEvent): void => {
  actor.send(event);
  actor.send({ type: 'REVEALED' });
};

const fresh = (position: string): ReturnType<typeof start> => {
  const actor = createActor(sceneMachine, { input: { beats, passed: [], position } });
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
  go(windowed, next);
  expect(at(windowed)).toBe('no');
  const full = start();
  go(full, { full: true, type: 'NEXT' });
  expect(at(full)).toBe('yes');
  go(full, { full: true, type: 'NEXT' });
  expect(at(full)).toBe('demo');
});

test('往回時同樣跳過不符合的拍子', () => {
  const actor = start('demo');
  go(actor, { full: true, type: 'BACK' });
  expect(at(actor)).toBe('yes');
});

test('第一拍不能再往回，最後一拍不能再往下', () => {
  const first = start();
  go(first, back);
  expect(at(first)).toBe('ask');
  const last = start('end');
  go(last, next);
  expect(at(last)).toBe('end');
});

test('示範播完只在標記要接下一句的拍子自動往下', () => {
  const actor = start('demo');
  go(actor, { full: false, type: 'PLAYED' });
  expect(at(actor)).toBe('type');
  const other = start('ask');
  go(other, { full: false, type: 'PLAYED' });
  expect(at(other)).toBe('ask');
});

test('打字練習沒完成前不能往下，完成後停在原地等按鍵', () => {
  const actor = start('type');
  expect(actor.getSnapshot().value).toBe('blocked');
  go(actor, next);
  go(actor, { full: false, type: 'AUTO' });
  expect(at(actor)).toBe('type');
  go(actor, typed);
  expect(at(actor)).toBe('type');
  expect(actor.getSnapshot().value).toBe('ready');
  go(actor, next);
  expect(at(actor)).toBe('print');
});

test('執行結果不對時留在原地並標記，結果對了自動往下', () => {
  const actor = start('print');
  go(actor, printed('8'));
  expect(at(actor)).toBe('print');
  expect(actor.getSnapshot().context.mismatch).toBe(true);
  go(actor, typed);
  expect(at(actor)).toBe('print');
  go(actor, printed(' 7\n'));
  expect(at(actor)).toBe('end');
  expect(actor.getSnapshot().context.mismatch).toBe(false);
  expect(actor.getSnapshot().context.passed).toEqual(['print']);
});

test('已經通過的檢查，回來時不用再做一次', () => {
  const actor = start('type', ['type']);
  expect(actor.getSnapshot().value).toBe('ready');
  go(actor, next);
  expect(at(actor)).toBe('print');
  go(actor, back);
  expect(at(actor)).toBe('type');
  expect(actor.getSnapshot().value).toBe('ready');
});

test('等待中仍然可以往回，換拍後清掉錯誤標記', () => {
  const actor = start('print');
  go(actor, printed('8'));
  go(actor, back);
  expect(at(actor)).toBe('type');
  expect(actor.getSnapshot().context.mismatch).toBe(false);
});

test('文字還在出現時，按一下只是把整句顯示完', () => {
  const actor = fresh('ask');
  expect(actor.getSnapshot().value).toBe('revealing');
  actor.send(next);
  expect(at(actor)).toBe('ask');
  expect(actor.getSnapshot().value).toBe('ready');
  actor.send(next);
  expect(at(actor)).toBe('no');
  expect(actor.getSnapshot().value).toBe('revealing');
});

test('往回的那一句直接整句顯示', () => {
  const actor = fresh('demo');
  actor.send(back);
  expect(at(actor)).toBe('no');
  expect(actor.getSnapshot().value).toBe('ready');
});

test('文字還沒出完就完成檢查，也算通過', () => {
  const actor = fresh('type');
  actor.send(typed);
  expect(actor.getSnapshot().value).toBe('ready');
  expect(actor.getSnapshot().context.passed).toEqual(['type']);
});

test('畫面變成全螢幕時，自動換到稱讚的那一句', () => {
  const asking = fresh('ask');
  asking.send({ full: true, type: 'SCREEN' });
  expect(at(asking)).toBe('yes');
  const declined = start('no');
  declined.send({ full: true, type: 'SCREEN' });
  expect(at(declined)).toBe('yes');
  const later = start('demo');
  later.send({ full: true, type: 'SCREEN' });
  expect(at(later)).toBe('demo');
  const leaving = start('ask');
  leaving.send({ full: false, type: 'SCREEN' });
  expect(at(leaving)).toBe('ask');
});

test('已經通過的檢查不會被重複記錄', () => {
  const actor = fresh('type');
  actor.send(typed);
  actor.send(back);
  actor.send(next);
  actor.send(typed);
  expect(at(actor)).toBe('type');
  expect(actor.getSnapshot().context.passed).toEqual(['type']);
});

test('文字出完後，需要檢查的拍子會停下來等', () => {
  const actor = fresh('type');
  actor.send({ type: 'REVEALED' });
  expect(actor.getSnapshot().value).toBe('blocked');
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
    { type: 'REVEALED' },
    { full: true, type: 'SCREEN' },
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
