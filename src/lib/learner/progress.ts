import { ordered, type LearningEvent } from '@/lib/record/event';

interface UnitState {
  readonly passed: ReadonlySet<string>;
  readonly position: string | null;
}

interface Draft {
  readonly passed: Set<string>;
  position: string | null;
}

const apply = (draft: Draft, event: LearningEvent): void => {
  if (event.kind === 'unit.restarted') {
    draft.passed.clear();
    draft.position = null;
    return;
  }
  if (event.kind === 'beat.reached') {
    draft.position = event.ref;
    return;
  }
  if (event.kind === 'check.passed') {
    draft.passed.add(event.ref);
  }
};

const unitState = (events: readonly LearningEvent[], unit: string): UnitState => {
  const draft: Draft = { passed: new Set<string>(), position: null };
  for (const event of ordered(events)) {
    if (event.unit === unit) {
      apply(draft, event);
    }
  }
  return draft;
};

const note = (byUnit: Map<string, Set<string>>, event: LearningEvent): void => {
  if (event.kind === 'unit.restarted') {
    byUnit.delete(event.unit);
    return;
  }
  if (event.kind === 'item.unlocked') {
    const items = byUnit.get(event.unit) ?? new Set<string>();
    byUnit.set(event.unit, items.add(event.ref));
  }
};

const unlockedItems = (events: readonly LearningEvent[]): Set<string> => {
  const byUnit = new Map<string, Set<string>>();
  for (const event of ordered(events)) {
    note(byUnit, event);
  }
  const all = new Set<string>();
  for (const items of byUnit.values()) {
    for (const item of items) {
      all.add(item);
    }
  }
  return all;
};

export { unitState, unlockedItems, type UnitState };
