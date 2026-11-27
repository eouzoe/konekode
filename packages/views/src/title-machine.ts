import { Schema } from 'effect';
import { createMachine } from 'xstate';

const signal = <Name extends string>(name: Name) =>
  Schema.toStandardSchemaV1(Schema.Struct({ type: Schema.Literal(name) }));

const fallback = 4000;

const titleMachine = createMachine({
  id: 'title',
  initial: 'lighting',
  schemas: {
    events: {
      DONE: signal('DONE'),
      REVEALING: signal('REVEALING'),
      SKIP: signal('SKIP'),
    },
  },
  states: {
    lighting: {
      after: { [fallback]: { target: 'revealing' } },
      on: {
        DONE: { target: 'lit' },
        REVEALING: { target: 'revealing' },
        SKIP: { target: 'lit' },
      },
    },
    lit: { type: 'final' },
    revealing: {
      on: {
        DONE: { target: 'lit' },
        SKIP: { target: 'lit' },
      },
    },
  },
});

export { titleMachine };
