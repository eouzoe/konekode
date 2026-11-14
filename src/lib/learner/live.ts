import { recorded } from '@/lib/record/current';
import { type LearningEvent } from '@/lib/record/event';

import { unlockedItems } from './progress';

interface Cached {
  readonly count: number;
  readonly from: readonly LearningEvent[];
  readonly items: ReadonlySet<string>;
}

let cached: Cached | null = null;

const unlockedNow = (): ReadonlySet<string> => {
  const events = recorded();
  if (cached?.from !== events || cached.count !== events.length) {
    cached = { count: events.length, from: events, items: unlockedItems(events) };
  }
  return cached.items;
};

export { unlockedNow };
