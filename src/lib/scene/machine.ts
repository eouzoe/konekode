import {
  array,
  boolean,
  nullable,
  number,
  object,
  picklist,
  string,
  type InferOutput,
} from 'valibot';
import { createMachine, type EventFromLogic } from 'xstate';

const checkSchema = picklist(['', 'drill', 'run']);
const whenSchema = picklist(['', 'fullscreen', 'windowed']);

const beatSchema = object({
  expect: nullable(string()),
  id: string(),
  next: boolean(),
  wait: checkSchema,
  when: whenSchema,
});

const contextSchema = object({
  beats: array(beatSchema),
  index: number(),
  mismatch: boolean(),
  passed: array(string()),
});

const inputSchema = object({
  beats: array(beatSchema),
  passed: array(string()),
  position: nullable(string()),
});

const moveSchema = object({ full: boolean() });
const checkedSchema = object({ full: boolean(), kind: checkSchema, output: string() });

type Check = InferOutput<typeof checkSchema>;
type BeatMeta = InferOutput<typeof beatSchema>;
type Context = InferOutput<typeof contextSchema>;
type Move = InferOutput<typeof moveSchema>;
type Checked = InferOutput<typeof checkedSchema>;

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
    context: contextSchema,
    events: {
      AUTO: moveSchema,
      BACK: moveSchema,
      CHECKED: checkedSchema,
      NEXT: moveSchema,
      PLAYED: moveSchema,
      REVEALED: object({}),
    },
    input: inputSchema,
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
