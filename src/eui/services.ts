import { Context, Effect, Layer, Queue, Schema, Stream } from 'effect';

import { openEngine, unitProgress, unlockedNow } from '@/lib/learner/engine';
import { track } from '@/lib/record/current';
import { describe } from '@/lib/run/outcome';
import { runProgram, warmUp, watchLoading } from '@/lib/run/runner';
import { noteCheck, noteReached, restart } from '@/lib/scene/session';

const RunView = Schema.Struct({ state: Schema.String, status: Schema.String, text: Schema.String });
type RunView = typeof RunView.Type;

const Runner = Schema.Literals(['sprite', 'student']);

interface Ran {
  readonly finished: boolean;
  readonly output: string;
  readonly view: RunView;
}

interface Progress {
  readonly passed: ReadonlyArray<string>;
  readonly position: string | null;
  readonly unlocked: ReadonlyArray<string>;
}

class Compiler extends Context.Service<
  Compiler,
  {
    readonly loading: Stream.Stream<number>;
    readonly run: (source: string, input: string) => Effect.Effect<Ran>;
    readonly warm: Effect.Effect<boolean>;
  }
>()('lesson/Compiler') {
  static readonly layer = Layer.succeed(Compiler, {
    loading: Stream.callback<number>((queue) =>
      Effect.sync(() => {
        watchLoading((percent) => {
          Queue.offerUnsafe(queue, percent);
        });
      }),
    ),
    run: (source, input) =>
      Effect.promise(async () => {
        const outcome = await runProgram(source, input);
        return {
          finished: outcome.kind === 'finished' && outcome.exitCode === 0,
          output: outcome.kind === 'finished' ? outcome.output : '',
          view: describe(outcome),
        };
      }),
    warm: Effect.promise(() => warmUp()),
  });
}

class Learner extends Context.Service<
  Learner,
  {
    readonly checked: (unit: string, beat: string) => Effect.Effect<void>;
    readonly open: (unit: string) => Effect.Effect<Progress>;
    readonly reached: (unit: string, beat: string) => Effect.Effect<void>;
    readonly restart: (unit: string) => Effect.Effect<void>;
    readonly unlocked: (unit: string, item: string) => Effect.Effect<void>;
  }
>()('lesson/Learner') {
  static readonly layer = Layer.succeed(Learner, {
    checked: (unit, beat) =>
      Effect.sync(() => {
        noteCheck(unit, beat);
      }),
    open: (unit) =>
      Effect.promise(async () => {
        await openEngine();
        const progress = unitProgress(unit);
        return {
          passed: [...progress.passed],
          position: progress.position,
          unlocked: [...unlockedNow()],
        };
      }),
    reached: (unit, beat) =>
      Effect.sync(() => {
        noteReached(unit, beat);
      }),
    restart: (unit) =>
      Effect.sync(() => {
        restart(unit);
      }),
    unlocked: (unit, item) =>
      Effect.sync(() => {
        track('item.unlocked', { ref: item, unit });
      }),
  });
}

export { Compiler, Learner, RunView, Runner };
