import { expect, test } from 'bun:test';

import { Effect, Layer, Stream } from 'effect';

import { LessonCommands, LessonMessage, NoteCheck, OpenEngine, RunProgram } from './lesson';
import { Compiler, Learner } from './services';

const fakes = (log: Array<string>) =>
  Layer.mergeAll(
    Layer.succeed(Compiler, {
      loading: Stream.empty,
      run: (source, input) =>
        Effect.succeed({
          finished: true,
          output: `${source}|${input}`,
          view: { state: 'ok', status: '', text: '' },
        }),
      warm: Effect.succeed(true),
    }),
    Layer.succeed(Learner, {
      checked: (unit, beat) =>
        Effect.sync(() => {
          log.push(`checked ${unit} ${beat}`);
        }),
      open: () => Effect.succeed({ passed: ['run-cout'], position: 'task', unlocked: ['i'] }),
      reached: () => Effect.void,
      restart: () => Effect.void,
      unlocked: () => Effect.void,
    }),
  );

test('the lesson commands work through whatever Compiler and Learner they are given', async () => {
  const log: Array<string> = [];
  const results = await Effect.runPromise(
    Effect.all([
      RunProgram.make({ by: 'student', input: '3', source: 'main', token: 7 }).effect,
      OpenEngine.make({ unit: 'start' }).effect,
      NoteCheck.make({ beat: 'task', unit: 'start' }).effect,
    ]).pipe(Effect.provide(LessonCommands.pipe(Layer.provide(fakes(log))))),
  );
  expect(results[0]).toEqual(
    LessonMessage.CompletedRunProgram({
      by: 'student',
      finished: true,
      output: 'main|3',
      token: 7,
      view: { state: 'ok', status: '', text: '' },
    }),
  );
  expect(results[1]).toEqual(
    LessonMessage.CompletedOpenEngine({ passed: ['run-cout'], position: 'task', unlocked: ['i'] }),
  );
  expect(log).toEqual(['checked start task']);
});
