import { unlockedNow } from '@/lib/learner/engine';
import { track } from '@/lib/record/current';

import { beatSchema, type BeatMeta } from './machine';

import type { Beat } from '@konekode/contracts/unit';

const readMeta = (beat: HTMLElement): BeatMeta => {
  const { after, expect, id = '', wait = '', when = '' } = beat.dataset;
  return beatSchema.parse({ expect: expect ?? null, id, next: after === 'next', wait, when });
};

const metaOf = (beat: Beat): BeatMeta =>
  beatSchema.parse({
    expect: beat.expect ?? null,
    id: beat.id,
    next: beat.after === 'next',
    wait: beat.wait ?? '',
    when: beat.when ?? '',
  });

const grantUnlocks = (unit: string, beat: HTMLElement): void => {
  const ids = (beat.dataset.unlock ?? '').split(',').filter((id) => id !== '');
  for (const id of ids) {
    if (!unlockedNow().has(id)) {
      track('item.unlocked', { ref: id, unit });
    }
  }
};

export { grantUnlocks, metaOf, readMeta };
