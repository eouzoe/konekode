import { expect, test } from 'bun:test';

import { beats as startBeats } from '@konekode/course/start';
import {
  array,
  assert,
  boolean,
  constant,
  constantFrom,
  oneof,
  property,
  record,
  string,
  subarray,
  tuple,
  type Arbitrary,
} from 'fast-check';
import { createActor } from 'xstate';

import { sceneMachine, type BeatMeta } from '@/lib/scene/machine';

import {
  adapted,
  checked,
  goBack,
  goNext,
  played,
  revealed,
  startAt,
  type Flow,
  type Where,
} from './flow';

import type { Beat } from '@konekode/contracts/unit';

type Op =
  | { readonly type: 'AUTO' | 'BACK' | 'NEXT' | 'PLAYED' | 'REVEALED' }
  | { readonly full: boolean; readonly type: 'SCREEN' }
  | {
      readonly expected: boolean;
      readonly kind: 'drill' | 'run';
      readonly output: string;
      readonly type: 'CHECKED';
    };

const say = '';

const sample: ReadonlyArray<Beat> = [
  { id: 'ask', say, stage: 'empty' },
  { id: 'yes', say, stage: 'empty', when: 'fullscreen' },
  { id: 'no', say, stage: 'empty', when: 'windowed' },
  { after: 'next', id: 'demo', say, stage: 'code' },
  { auto: 3000, id: 'pause', say, stage: 'empty' },
  { id: 'type', say, stage: 'drill', wait: 'drill' },
  { expect: '7', id: 'print', say, stage: 'run', wait: 'run' },
  { id: 'end', say, stage: 'empty' },
];

const metaOf = (beat: Beat): BeatMeta => ({
  expect: beat.expect ?? null,
  id: beat.id,
  next: beat.after === 'next',
  wait: beat.wait ?? '',
  when: beat.when ?? '',
});

const opOf: Arbitrary<Op> = oneof(
  constantFrom(
    { type: 'AUTO' } as const,
    { type: 'BACK' } as const,
    { type: 'NEXT' } as const,
    { type: 'PLAYED' } as const,
    { type: 'REVEALED' } as const,
  ),
  record({ full: boolean(), type: constant('SCREEN' as const) }),
  record({
    expected: boolean(),
    kind: constantFrom('drill' as const, 'run' as const),
    output: string({ maxLength: 4 }),
    type: constant('CHECKED' as const),
  }),
);

const newer = (beats: ReadonlyArray<Beat>, flow: Flow, op: Op, where: Where): Flow | null => {
  switch (op.type) {
    case 'AUTO':
      return flow.phase === 'blocked' ? null : goNext(beats, flow, where);
    case 'BACK':
      return goBack(beats, flow, where);
    case 'CHECKED':
      return checked(beats, flow, where, {
        kind: op.kind,
        output: op.expected ? (beats[flow.index]?.expect ?? '') : op.output,
      });
    case 'NEXT':
      if (flow.phase === 'revealing') {
        return revealed(beats, flow);
      }
      return flow.phase === 'ready' ? goNext(beats, flow, where) : null;
    case 'PLAYED':
      return played(beats, flow, where);
    case 'REVEALED':
      return revealed(beats, flow);
    case 'SCREEN':
      return adapted(beats, flow, where);
  }
};

const compare = (beats: ReadonlyArray<Beat>, fine: boolean) => {
  const shown = fine ? beats : beats.filter((beat) => beat.needs === undefined);
  const gates = beats.filter((beat) => beat.wait !== undefined).map((beat) => beat.id);
  const ids = beats.map((beat) => beat.id);
  return property(
    tuple(
      oneof(constant(null), constantFrom(...ids)),
      subarray(gates),
      boolean(),
      array(opOf, { maxLength: 60 }),
    ),
    ([position, passed, startFull, ops]) => {
      const index = startAt(beats, position, { fine, full: startFull });
      const old = createActor(sceneMachine, {
        input: { beats: shown.map(metaOf), passed, position: beats[index]?.id ?? null },
      }).start();
      let flow: Flow = {
        index,
        mismatch: false,
        passed,
        phase: 'revealing',
      };
      let full = startFull;
      for (const op of ops) {
        if (op.type === 'SCREEN') {
          full = op.full;
        }
        const where = { fine, full };
        const before = old.getSnapshot();
        if (op.type === 'CHECKED' && op.kind === 'drill' && before.value !== 'blocked') {
          continue;
        }
        if (op.type === 'CHECKED') {
          const meta = before.context.beats[before.context.index];
          old.send({
            full,
            kind: op.kind,
            output: op.expected ? (meta?.expect ?? '') : op.output,
            type: 'CHECKED',
          });
        } else if (op.type === 'REVEALED') {
          old.send({ type: 'REVEALED' });
        } else {
          old.send({ full, type: op.type });
        }
        flow = newer(beats, flow, op, where) ?? flow;
        const after = old.getSnapshot();
        const now: Readonly<Record<string, unknown>> = {
          id: beats[flow.index]?.id,
          mismatch: flow.mismatch,
          passed: flow.passed,
          phase: flow.phase,
        };
        expect(now).toEqual({
          id: after.context.beats[after.context.index]?.id,
          mismatch: after.context.mismatch,
          passed: after.context.passed,
          phase: after.value,
        });
      }
    },
  );
};

test('接著上次的位置時，跳過現在不適用的句子', () => {
  const windowed = { fine: true, full: false };
  expect(sample[startAt(sample, 'yes', windowed)]?.id).toBe('no');
  expect(sample[startAt(sample, 'yes', { fine: true, full: true })]?.id).toBe('yes');
  expect(
    startBeats[startAt(startBeats, null, { fine: false, full: false })]?.needs,
  ).toBeUndefined();
  expect(startAt(sample, 'missing', windowed)).toBe(0);
});

test('新舊兩套走法：同一串操作走到同一句、同一個狀態（示意單元）', () => {
  assert(compare(sample, true), { numRuns: 400, seed: 1 });
});

test('新舊兩套走法：同一串操作走到同一句、同一個狀態（起步單元，有全螢幕鍵）', () => {
  assert(compare(startBeats, true), { numRuns: 300, seed: 1 });
});

test('新舊兩套走法：同一串操作走到同一句、同一個狀態（起步單元，沒有全螢幕鍵）', () => {
  assert(compare(startBeats, false), { numRuns: 300, seed: 1 });
});
