import { parse } from 'valibot';

import { record, unlockedNow } from '@/lib/progress/store';

import { beatSchema, type BeatMeta } from './machine';

const readMeta = (beat: HTMLElement): BeatMeta => {
  const { after, expect, id = '', wait = '', when = '' } = beat.dataset;
  return parse(beatSchema, { expect: expect ?? null, id, next: after === 'next', wait, when });
};

const grantUnlocks = (unit: string, beat: HTMLElement): void => {
  const ids = (beat.dataset.unlock ?? '').split(',').filter((id) => id !== '');
  for (const id of ids) {
    if (!unlockedNow().has(id)) {
      record('item.unlocked', unit, id);
    }
  }
};

export { grantUnlocks, readMeta };
