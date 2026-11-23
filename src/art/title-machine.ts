import { createMachine } from 'xstate';

import { object } from '@/lib/zod';

const fallback = 4000;

const titleMachine = createMachine({
  id: 'title',
  initial: 'lighting',
  schemas: {
    events: {
      DONE: object({}),
      REVEALING: object({}),
      SKIP: object({}),
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
