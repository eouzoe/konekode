import { Schema } from 'effect';
import { createMachine, type EventFromLogic } from 'xstate';

const checkSchema = Schema.Literals(['', 'drill', 'run']);
const whenSchema = Schema.Literals(['', 'fullscreen', 'windowed']);

const beatSchema = Schema.Struct({
  expect: Schema.NullOr(Schema.String),
  id: Schema.String,
  next: Schema.Boolean,
  wait: checkSchema,
  when: whenSchema,
});

const contextSchema = Schema.Struct({
  beats: Schema.Array(beatSchema),
  index: Schema.Finite,
  mismatch: Schema.Boolean,
  passed: Schema.Array(Schema.String),
});

const inputSchema = Schema.Struct({
  beats: Schema.Array(beatSchema),
  passed: Schema.Array(Schema.String),
  position: Schema.NullOr(Schema.String),
});

const moveSchema = Schema.Struct({ full: Schema.Boolean });
const checkedSchema = Schema.Struct({
  full: Schema.Boolean,
  kind: checkSchema,
  output: Schema.String,
});

const standardMove = Schema.toStandardSchemaV1(moveSchema);

type Check = typeof checkSchema.Type;
type BeatMeta = typeof beatSchema.Type;
type Context = typeof contextSchema.Type;
type Move = typeof moveSchema.Type;
type Checked = typeof checkedSchema.Type;

interface Arrival {
  readonly context: Context;
  readonly target: 'revealing' | 'settling';
}

const forward = 1;
const backward = -forward;

const applies = (beat: BeatMeta | undefined, full: boolean): boolean => {
  if (beat === undefined || beat.when === '') {
    return true;
  }
  return (beat.when === 'fullscreen') === full;
};

const seek = (context: Context, step: number, full: boolean): number => {
  let next = context.index + step;
  while (next >= 0 && next < context.beats.length && !applies(context.beats[next], full)) {
    next += step;
  }
  if (next < 0 || next >= context.beats.length) {
    return context.index;
  }
  return next;
};

const current = (context: Context): BeatMeta | undefined => context.beats[context.index];

const needsCheck = (context: Context): boolean => {
  const beat = current(context);
  return beat !== undefined && beat.wait !== '' && !context.passed.includes(beat.id);
};

const move = (context: Context, step: number, full: boolean): Arrival | undefined => {
  const index = seek(context, step, full);
  if (index === context.index || (step > 0 && needsCheck(context))) {
    return undefined;
  }
  const next = { ...context, index, mismatch: false };
  if (step < 0) {
    return { context: next, target: 'settling' };
  }
  return { context: next, target: 'revealing' };
};

const goBack = ({ context, event }: { context: Context; event: Move }): Arrival | undefined =>
  move(context, backward, event.full);

const goNext = ({ context, event }: { context: Context; event: Move }): Arrival | undefined =>
  move(context, forward, event.full);

interface Settled {
  readonly context: Context;
  readonly target?: 'ready';
}

const settle = ({
  context,
  event,
}: {
  context: Context;
  event: Checked;
}): Arrival | Settled | undefined => {
  const beat = current(context);
  if (beat === undefined || event.kind !== beat.wait || context.passed.includes(beat.id)) {
    return undefined;
  }
  if (beat.expect !== null && event.output.trim() !== beat.expect) {
    return { context: { ...context, mismatch: true } };
  }
  const passed = { ...context, passed: [...context.passed, beat.id] };
  if (event.kind === 'drill') {
    return { context: passed, target: 'ready' };
  }
  return move(passed, forward, event.full) ?? { context: passed, target: 'ready' };
};

const follow = ({ context, event }: { context: Context; event: Move }): Arrival | undefined => {
  if (current(context)?.next !== true) {
    return undefined;
  }
  return move(context, forward, event.full);
};

const adapt = ({ context, event }: { context: Context; event: Move }): Arrival | undefined => {
  if (!event.full || needsCheck(context) || current(context)?.when === 'fullscreen') {
    return undefined;
  }
  const index = [context.index + forward, context.index + backward].find(
    (at) => context.beats[at]?.when === 'fullscreen',
  );
  if (index === undefined) {
    return undefined;
  }
  return { context: { ...context, index, mismatch: false }, target: 'revealing' };
};

const sceneMachine = createMachine({
  context: ({ input }) => ({
    beats: input.beats,
    index: Math.max(
      input.beats.findIndex((beat) => beat.id === input.position),
      0,
    ),
    mismatch: false,
    passed: input.passed,
  }),
  id: 'scene',
  initial: 'revealing',
  schemas: {
    context: Schema.toStandardSchemaV1(contextSchema),
    events: {
      AUTO: standardMove,
      BACK: standardMove,
      CHECKED: Schema.toStandardSchemaV1(checkedSchema),
      NEXT: standardMove,
      PLAYED: standardMove,
      REVEALED: Schema.toStandardSchemaV1(Schema.Struct({})),
      SCREEN: standardMove,
    },
    input: Schema.toStandardSchemaV1(inputSchema),
  },
  states: {
    blocked: {
      on: {
        BACK: goBack,
        CHECKED: settle,
      },
    },
    ready: {
      on: {
        AUTO: goNext,
        BACK: goBack,
        NEXT: goNext,
        PLAYED: follow,
        SCREEN: adapt,
      },
    },
    revealing: {
      on: {
        AUTO: goNext,
        BACK: goBack,
        CHECKED: settle,
        NEXT: { target: 'settling' },
        PLAYED: follow,
        REVEALED: { target: 'settling' },
        SCREEN: adapt,
      },
    },
    settling: {
      choice: ({ context }) => {
        if (needsCheck(context)) {
          return { target: 'blocked' };
        }
        return { target: 'ready' };
      },
      type: 'choice',
    },
  },
});

type SceneEvent = EventFromLogic<typeof sceneMachine>;

export { beatSchema, sceneMachine, type BeatMeta, type Check, type SceneEvent };
