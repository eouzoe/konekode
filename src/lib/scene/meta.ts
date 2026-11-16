import { unlockedNow } from '@/lib/learner/live';
import { track } from '@/lib/record/current';

import { beatSchema, type BeatMeta } from './machine';

const readMeta = (beat: HTMLElement): BeatMeta => {
  const { after, expect, id = '', wait = '', when = '' } = beat.dataset;
  return beatSchema.parse({ expect: expect ?? null, id, next: after === 'next', wait, when });
};

const grantUnlocks = (unit: string, beat: HTMLElement): void => {
  const ids = (beat.dataset.unlock ?? '').split(',').filter((id) => id !== '');
  for (const id of ids) {
    if (!unlockedNow().has(id)) {
      track('item.unlocked', { ref: id, unit });
    }
  }
};

export { grantUnlocks, readMeta };
