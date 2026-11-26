import { Command } from '@effect/ui';
import { Duration, Effect, Schema } from 'effect';

import { openEngine, unitProgress, unlockedNow } from '@/lib/learner/engine';
import { track } from '@/lib/record/current';
import { describe } from '@/lib/run/outcome';
import { runProgram } from '@/lib/run/runner';
import { noteCheck, noteReached, restart } from '@/lib/scene/session';

const RunView = Schema.Struct({ state: Schema.String, status: Schema.String, text: Schema.String });
const Runner = Schema.Literals(['sprite', 'student']);

const OpenEngine = Command.make('OpenEngine', { args: { unit: Schema.String } }, ({ unit }) =>
  Effect.promise(async () => {
    await openEngine();
    const progress = unitProgress(unit);
    return {
      passed: [...progress.passed],
      position: progress.position,
      unlocked: [...unlockedNow()],
    };
  }),
);

const WaitBeforeStep = Command.make(
  'WaitBeforeStep',
  { args: { delay: Schema.Number, token: Schema.Number }, mode: 'switch' },
  ({ delay, token }) => Effect.as(Effect.sleep(Duration.millis(delay)), token),
);

const WaitBeforeAuto = Command.make(
  'WaitBeforeAuto',
  { args: { delay: Schema.Number, token: Schema.Number }, mode: 'switch' },
  ({ delay, token }) => Effect.as(Effect.sleep(Duration.millis(delay)), token),
);

const RunProgram = Command.make(
  'RunProgram',
  {
    args: { by: Runner, input: Schema.String, source: Schema.String, token: Schema.Number },
    mode: 'queue',
  },
  ({ by, input, source, token }) =>
    Effect.promise(async () => {
      const outcome = await runProgram(source, input);
      const finished = outcome.kind === 'finished' && outcome.exitCode === 0;
      return {
        by,
        finished,
        output: outcome.kind === 'finished' ? outcome.output : '',
        token,
        view: describe(outcome),
      };
    }),
);

const NoteReached = Command.make(
  'NoteReached',
  { args: { beat: Schema.String, unit: Schema.String } },
  ({ beat, unit }) =>
    Effect.sync(() => {
      noteReached(unit, beat);
    }),
);

const NoteCheck = Command.make(
  'NoteCheck',
  { args: { beat: Schema.String, unit: Schema.String } },
  ({ beat, unit }) =>
    Effect.sync(() => {
      noteCheck(unit, beat);
    }),
);

const NoteUnlock = Command.make(
  'NoteUnlock',
  { args: { item: Schema.String, unit: Schema.String } },
  ({ item, unit }) =>
    Effect.sync(() => {
      track('item.unlocked', { ref: item, unit });
    }),
);

const RestartUnit = Command.make('RestartUnit', { args: { unit: Schema.String } }, ({ unit }) =>
  Effect.sync(() => {
    restart(unit);
  }),
);

export {
  NoteCheck,
  NoteReached,
  NoteUnlock,
  OpenEngine,
  RestartUnit,
  RunProgram,
  RunView,
  Runner,
  WaitBeforeAuto,
  WaitBeforeStep,
};
