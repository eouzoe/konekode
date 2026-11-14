import { parse } from 'valibot';

import { beatSchema, type BeatMeta } from './machine';

const readMeta = (beat: HTMLElement): BeatMeta => {
  const { after, expect, id = '', wait = '', when = '' } = beat.dataset;
  return parse(beatSchema, { expect: expect ?? null, id, next: after === 'next', wait, when });
};

export { readMeta };
