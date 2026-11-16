import { expect, test } from 'bun:test';

import { assertTestCoverage, propertyTest, testPaths } from '@xstate/test';
import { boolean, constant, constantFrom, record, string } from 'fast-check';

import { sceneMachine, type BeatMeta } from './machine';

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

const input = { beats, passed: [], position: null };
const lastIndex = beats.length - 1;

interface Shape {
  readonly index: number;
  readonly mismatch: boolean;
  readonly passed: readonly string[];
}

const skippedGate = ({ index, passed }: Shape): string | undefined =>
  beats.find((beat, at) => beat.wait !== '' && at < index && !passed.includes(beat.id))?.id;

const check = (context: Shape): void => {
  expect(context.index).toBeGreaterThanOrEqual(0);
  expect(context.index).toBeLessThanOrEqual(lastIndex);
  expect(skippedGate(context)).toBeUndefined();
  if (context.mismatch) {
    expect(beats[context.index]?.wait).not.toBe('');
  }
};

const events = {
  CHECKED: [
    {
      case: 'expected',
      generate: boolean(),
      resolve: ({ generated, snapshot }: { generated: unknown; snapshot: { context: Shape } }) => {
        const beat = beats[snapshot.context.index] ?? plain('');
        return { full: generated === true, kind: beat.wait, output: beat.expect ?? '' };
      },
      when: ({ snapshot }: { snapshot: { context: Shape } }) =>
        (beats[snapshot.context.index]?.wait ?? '') !== '',
    },
    {
      case: 'anything',
      generate: record({
        full: boolean(),
        kind: constantFrom('' as const, 'drill' as const, 'run' as const),
        output: string(),
      }),
    },
  ],
  REVEALED: constant({}),
};

test('隨機操作：沒過關到不了關卡後面，位置不會出界', async () => {
  const { coverage } = await propertyTest(sceneMachine, {
    events,
    input,
    invariant: ({ snapshot }) => {
      check(snapshot.context);
    },
    maxCommands: 40,
    numRuns: 400,
    reachable: ['ready', 'blocked'],
    seed: 1,
    temporal: [
      {
        id: '已過關的不會消失',
        predicate: ({ previousSnapshot, snapshot }) =>
          previousSnapshot.context.passed.some((id) => !snapshot.context.passed.includes(id)),
        type: 'never',
      },
      {
        id: '走得到最後一句',
        predicate: ({ snapshot }) => snapshot.context.index === lastIndex,
        type: 'sometimes',
      },
    ],
  });
  assertTestCoverage(coverage, { states: 1, transitions: 1 });
});

test('每個可達狀態的最短路徑都守住同樣的規則', async () => {
  const { results } = await testPaths(sceneMachine, {
    events,
    input,
    invariant: ({ snapshot }) => {
      check(snapshot.context);
    },
  });
  expect(results.length).toBeGreaterThan(0);
  expect(results.every((result) => result.passed)).toBe(true);
});
