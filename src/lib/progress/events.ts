type Kind = 'beat.reached' | 'check.passed' | 'unit.restarted';

interface LearningEvent {
  readonly at: number;
  readonly device: string;
  readonly id: string;
  readonly kind: Kind;
  readonly ref: string;
  readonly unit: string;
  readonly version: 1;
}

interface UnitState {
  readonly passed: ReadonlySet<string>;
  readonly position: string | null;
}

const currentVersion = 1;
const kinds: ReadonlySet<string> = new Set(['beat.reached', 'check.passed', 'unit.restarted']);
const textFields = ['device', 'id', 'kind', 'ref', 'unit'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isEvent = (value: unknown): value is LearningEvent => {
  if (!isRecord(value)) {
    return false;
  }
  if (textFields.some((field) => typeof value[field] !== 'string')) {
    return false;
  }
  return (
    Number.isSafeInteger(value.at) &&
    value.version === currentVersion &&
    kinds.has(String(value.kind))
  );
};

const byTime = (left: LearningEvent, right: LearningEvent): number => {
  if (left.at !== right.at) {
    return left.at - right.at;
  }
  return left.id.localeCompare(right.id);
};

const unique = (events: readonly LearningEvent[]): LearningEvent[] => [
  ...new Map(events.map((event) => [event.id, event])).values(),
];

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
  draft.passed.add(event.ref);
};

const unitState = (events: readonly LearningEvent[], unit: string): UnitState => {
  const draft: Draft = { passed: new Set<string>(), position: null };
  for (const event of unique(events).toSorted(byTime)) {
    if (event.unit === unit) {
      apply(draft, event);
    }
  }
  return draft;
};

export { currentVersion, isEvent, unitState, type Kind, type LearningEvent, type UnitState };
