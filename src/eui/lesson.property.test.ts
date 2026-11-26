import { expect, test } from 'bun:test';

import { Component } from '@effect/ui';
import { Story } from '@effect/ui/testing';
import { Schema } from 'effect';
import {
  array,
  assert,
  boolean,
  constant,
  constantFrom,
  integer,
  nat,
  oneof,
  property,
  record,
  string,
  type Arbitrary,
} from 'fast-check';

import { expectedChar } from '@/lib/typing/drill';
import { beats, template } from '@/units/start';

import {
  NoteCheck,
  NoteReached,
  NoteUnlock,
  OpenEngine,
  RestartUnit,
  RunProgram,
  Runner,
  WaitBeforeAuto,
  WaitBeforeStep,
  WarmCompiler,
} from './commands';
import { PlayCue } from './contract';
import { Lesson, LessonMessage, LessonModel } from './lesson';

type Step =
  | { readonly key: string; readonly type: 'key' }
  | { readonly full: boolean; readonly type: 'screen' }
  | { readonly percent: number; readonly type: 'loaded' }
  | { readonly type: 'back' | 'next' | 'restart' | 'right' | 'tick' }
  | {
      readonly expected: boolean;
      readonly finished: boolean;
      readonly output: string;
      readonly pick: number;
      readonly type: 'settle';
    };

const keys = [
  ...new Set([
    ...template,
    'i',
    'a',
    'x',
    'Escape',
    'Enter',
    'Backspace',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'PageDown',
  ]),
].map((key) => (key === '\n' ? 'Enter' : key));

const stepOf: Arbitrary<Step> = oneof(
  { arbitrary: record({ key: constantFrom(...keys), type: constant('key' as const) }), weight: 4 },
  { arbitrary: constant({ type: 'right' } as const), weight: 12 },
  {
    arbitrary: constantFrom(
      { type: 'back' } as const,
      { type: 'next' } as const,
      { type: 'restart' } as const,
      { type: 'tick' } as const,
    ),
    weight: 3,
  },
  { arbitrary: record({ full: boolean(), type: constant('screen' as const) }), weight: 1 },
  {
    arbitrary: record({
      percent: integer({ max: 100, min: 0 }),
      type: constant('loaded' as const),
    }),
    weight: 1,
  },
  {
    arbitrary: record({
      expected: boolean(),
      finished: boolean(),
      output: string({ maxLength: 4 }),
      pick: nat(),
      type: constant('settle' as const),
    }),
    weight: 6,
  },
);

const isModel = Schema.is(LessonModel);
const props = { calm: false, fine: true, full: false, unit: 'start' };
type Lessons = ReturnType<typeof Story.start<typeof Lesson>>;

const Issued = Schema.Struct({ token: Schema.Number });
const IssuedRun = Schema.Struct({ by: Runner, token: Schema.Number });

const settleOne = (story: Lessons, step: Extract<Step, { type: 'settle' }>): void => {
  const picked = story.pending[step.pick % Math.max(story.pending.length, 1)];
  const entry = story.pending.find((each) => each.command.name === picked?.command.name);
  if (entry === undefined) {
    return;
  }
  const beat = beats[story.model.index];
  switch (entry.command.name) {
    case 'WaitBeforeStep':
      story.resolve(WaitBeforeStep, Schema.decodeUnknownSync(Issued)(entry.command.args).token);
      return;
    case 'WaitBeforeAuto':
      story.resolve(WaitBeforeAuto, Schema.decodeUnknownSync(Issued)(entry.command.args).token);
      return;
    case 'RunProgram': {
      const { by, token } = Schema.decodeUnknownSync(IssuedRun)(entry.command.args);
      story.resolve(RunProgram, {
        by,
        finished: step.finished,
        output: step.expected ? (beat?.expect ?? '') : step.output,
        token,
        view: { state: step.finished ? 'ok' : 'error', status: '', text: step.output },
      });
      return;
    }
    case 'cues/PlayCue':
      story.resolve(PlayCue, Component.noop);
      return;
    case 'NoteCheck':
      story.resolve(NoteCheck, undefined);
      return;
    case 'NoteReached':
      story.resolve(NoteReached, undefined);
      return;
    case 'NoteUnlock':
      story.resolve(NoteUnlock, undefined);
      return;
    case 'RestartUnit':
      story.resolve(RestartUnit, undefined);
      return;
    case 'WarmCompiler':
      story.resolve(WarmCompiler, true);
      return;
    default:
      throw new Error(`no answer for ${entry.command.name}`);
  }
};

const definitions = {
  NoteCheck,
  NoteReached,
  NoteUnlock,
  RestartUnit,
  RunProgram,
  WaitBeforeAuto,
  WaitBeforeStep,
  WarmCompiler,
  'cues/PlayCue': PlayCue,
} as const;

const isDefined = (name: string): name is keyof typeof definitions => name in definitions;

const hold = (story: Lessons): void => {
  for (const name of new Set(story.pending.map((entry) => entry.command.name))) {
    if (!isDefined(name)) {
      throw new Error(`no definition for ${name}`);
    }
    story.keepPending(definitions[name]);
  }
};

const keyFor = (char: string | undefined): string =>
  char === undefined || char === '\n' ? 'Enter' : char;

const rightKey = (model: LessonModel): string => {
  const beat = beats[model.index];
  if (model.phase === 'blocked' && beat?.wait === 'drill') {
    const { drill } = model;
    if (drill.position >= drill.target.length) {
      return 'Escape';
    }
    return drill.mode === 'normal' ? 'i' : keyFor(expectedChar(drill));
  }
  if (model.phase === 'blocked' && beat?.wait === 'run') {
    return keyFor(model.student.path[model.student.at]?.key);
  }
  return 'Enter';
};

const apply = (story: Lessons, step: Step): void => {
  if (step.type !== 'settle') {
    hold(story);
  }
  switch (step.type) {
    case 'back':
      story.send(LessonMessage.ClickedBack());
      return;
    case 'key':
      story.send(LessonMessage.PressedKey({ key: step.key }));
      return;
    case 'loaded':
      story.send(LessonMessage.LoadedCompiler({ percent: step.percent }));
      return;
    case 'next':
      story.send(LessonMessage.ClickedNext());
      return;
    case 'restart':
      story.send(LessonMessage.ClickedRestart());
      return;
    case 'screen':
      story.send(LessonMessage.ChangedFullscreen({ full: step.full }));
      return;
    case 'settle':
      settleOne(story, step);
      return;
    case 'right':
      story.send(LessonMessage.PressedKey({ key: rightKey(story.model) }));
      return;
    case 'tick':
      story.send(LessonMessage.TickedReveal());
  }
};

const skippedGate = (model: LessonModel): string | undefined =>
  beats.find(
    (beat, at) => beat.wait !== undefined && at < model.index && !model.passed.includes(beat.id),
  )?.id;

const holds = (story: Lessons, before: LessonModel): void => {
  const { model } = story;
  expect(isModel(model)).toBe(true);
  expect(model.index).toBeGreaterThanOrEqual(0);
  expect(model.index).toBeLessThan(beats.length);
  expect(skippedGate(model)).toBeUndefined();
  expect(new Set(model.passed).size).toBe(model.passed.length);
  expect(new Set(model.unlocked).size).toBe(model.unlocked.length);
  expect(before.passed.every((id) => model.passed.includes(id))).toBe(true);
  expect(model.token).toBeGreaterThanOrEqual(before.token);
  if (model.phase === 'blocked') {
    const beat = beats[model.index];
    expect(beat?.wait).toBeDefined();
    expect(model.passed).not.toContain(beat?.id);
  }
  if (model.busy) {
    expect(story.pending.some((entry) => entry.command.name === 'RunProgram')).toBe(true);
  }
};

const settleRight = {
  expected: true,
  finished: true,
  output: '',
  pick: 0,
  type: 'settle',
} as const;

const drain = (story: Lessons): number => {
  let rounds = 0;
  while (story.pending.length > 0 && rounds < 2000) {
    settleOne(story, settleRight);
    rounds += 1;
  }
  return story.pending.length;
};

const gates = beats.filter((beat) => beat.wait !== undefined).map((beat) => beat.id);

const opened = (at: number): Lessons => {
  const story = Story.start(Lesson, props);
  story.send(LessonMessage.Booted());
  story.resolve(OpenEngine, {
    passed: beats.slice(0, at).flatMap((beat) => (beat.wait === undefined ? [] : [beat.id])),
    position: beats[at]?.id ?? null,
    unlocked: [],
  });
  return story;
};

test('照著做走得完整個起步單元，每個關卡都過', () => {
  const story = opened(0);
  let steps = 0;
  while (beats[story.model.index]?.id !== 'done' && steps < 5000) {
    const before = story.model;
    apply(story, story.pending.length > 0 ? settleRight : { type: 'right' });
    holds(story, before);
    steps += 1;
  }
  expect(beats[story.model.index]?.id).toBe('done');
  expect(gates.filter((id) => !story.model.passed.includes(id))).toEqual([]);
  expect(drain(story)).toBe(0);
});

test('從任何一句接著上、隨機操作：狀態永遠合法，沒過關到不了後面，背景工作做得完', () => {
  const reached = new Set<number>();
  assert(
    property(
      integer({ max: beats.length - 1, min: 0 }),
      array(stepOf, { maxLength: 200, minLength: 20 }),
      (at, steps) => {
        const story = opened(at);
        for (const step of steps) {
          const before = story.model;
          apply(story, step);
          holds(story, before);
          reached.add(story.model.index);
        }
        expect(drain(story)).toBe(0);
        expect(story.model.phase).not.toBe('loading');
      },
    ),
    { numRuns: 400, seed: 1 },
  );
  expect(beats.filter((_, index) => !reached.has(index)).map((beat) => beat.id)).toEqual([]);
}, 20_000);
