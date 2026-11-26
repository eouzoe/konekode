import { Component, Mount } from '@effect/ui';
import { Effect, Schema, Stream } from 'effect';

import { createBuffer, type Buffer } from '@/lib/edit/buffer';
import { createScreen } from '@/lib/run/screen';

const Hint = Schema.Union([
  Schema.Struct({ kind: Schema.Literals(['drop']), line: Schema.Number }),
  Schema.Struct({
    column: Schema.Number,
    kind: Schema.Literals(['insert']),
    line: Schema.Number,
    text: Schema.String,
  }),
  Schema.Struct({ before: Schema.Number, kind: Schema.Literals(['line']), text: Schema.String }),
  Schema.Struct({
    from: Schema.Number,
    kind: Schema.Literals(['remove']),
    line: Schema.Number,
    to: Schema.Number,
  }),
]);

const CodeArgs = {
  cursor: Schema.Number,
  flash: Schema.String,
  flashes: Schema.Number,
  hints: Schema.Array(Hint),
  mode: Schema.Literals(['insert', 'normal']),
  text: Schema.String,
};

interface Shown {
  readonly cursor: number;
  readonly mode: 'insert' | 'normal';
  readonly text: string;
}

const bufferOf = ({ cursor, mode, text }: Shown): Buffer => ({
  ...createBuffer(text, cursor),
  mode,
});

const ShowCode = Mount.make('ShowCode', { args: CodeArgs }, (node: HTMLElement, args, changes) =>
  Effect.gen(function* showCode() {
    const screen = createScreen(node, bufferOf(args));
    const told = { flashes: args.flashes };
    yield* Stream.runForEach(changes, (next) =>
      Effect.sync(() => {
        screen.show(bufferOf(next), next.hints);
        if (next.flashes !== told.flashes) {
          told.flashes = next.flashes;
          screen.flash(next.flash);
        }
      }),
    );
    return Component.noop;
  }),
);

export { ShowCode };
