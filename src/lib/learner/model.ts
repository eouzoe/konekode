import { ordered, type LearningEvent } from '@/lib/record/event';

import { bktUpdate, defaultParams } from './bkt';
import { type UnitDomain } from './domain';

type Standing = 'done' | 'shown' | 'unseen';

interface Tally {
  completed: number;
  estimate: number;
  firstRight: number;
  opportunities: number;
  shown: number;
}

interface Component extends Readonly<Tally> {
  readonly standing: Standing;
}

type Domains = Readonly<Record<string, UnitDomain>>;
type Model = ReadonlyMap<string, Component>;

interface Fold {
  readonly entries: Map<string, Map<number, boolean>>;
  readonly seen: Set<string>;
  readonly tallies: Map<string, Tally>;
}

type Handle = (fold: Fold, event: LearningEvent, domain: UnitDomain) => void;

const tallyOf = (fold: Fold, id: string): Tally => {
  const known = fold.tallies.get(id);
  if (known !== undefined) {
    return known;
  }
  const fresh: Tally = {
    completed: 0,
    estimate: defaultParams.pL0,
    firstRight: 0,
    opportunities: 0,
    shown: 0,
  };
  fold.tallies.set(id, fresh);
  return fresh;
};

const reach: Handle = (fold, event, domain) => {
  const key = `${event.unit}|${event.ref}`;
  if (fold.seen.has(key)) {
    return;
  }
  fold.seen.add(key);
  for (const id of domain.shows.get(event.ref) ?? []) {
    tallyOf(fold, id).shown += 1;
  }
};

const entryKey = (event: LearningEvent): string => `${event.session}|${event.unit}|${event.ref}`;

const enter: Handle = (fold, event) => {
  fold.entries.set(entryKey(event), new Map());
};

const score = (tally: Tally, first: boolean, right: boolean): void => {
  if (first) {
    tally.opportunities += 1;
    tally.estimate = bktUpdate(tally.estimate, defaultParams, { correct: right });
  }
  if (first && right) {
    tally.firstRight += 1;
  }
  if (right) {
    tally.completed += 1;
  }
};

const attempt: Handle = (fold, event, domain) => {
  const entry = fold.entries.get(entryKey(event));
  const { at } = event.data;
  if (entry === undefined || typeof at !== 'number' || entry.get(at) === true) {
    return;
  }
  const first = !entry.has(at);
  const right = event.data.verdict === 'right';
  entry.set(at, right);
  for (const id of domain.uses.get(event.ref)?.[at] ?? []) {
    score(tallyOf(fold, id), first, right);
  }
};

const handles: Readonly<Record<string, Handle>> = {
  'beat.reached': reach,
  'step.tried': attempt,
  'task.entered': enter,
};

const standingOf = (tally: Tally): Standing => {
  if (tally.completed > 0) {
    return 'done';
  }
  if (tally.shown > 0) {
    return 'shown';
  }
  return 'unseen';
};

const learnerModel = (events: readonly LearningEvent[], domains: Domains): Model => {
  const fold: Fold = { entries: new Map(), seen: new Set(), tallies: new Map() };
  for (const event of ordered(events)) {
    const domain = domains[event.unit];
    const handle = handles[event.kind];
    if (domain !== undefined && handle !== undefined) {
      handle(fold, event, domain);
    }
  }
  return new Map(
    [...fold.tallies].map(([id, tally]) => [id, { ...tally, standing: standingOf(tally) }]),
  );
};

const unseen: Component = {
  completed: 0,
  estimate: defaultParams.pL0,
  firstRight: 0,
  opportunities: 0,
  shown: 0,
  standing: 'unseen',
};

const componentOf = (model: Model, id: string): Component => model.get(id) ?? unseen;

const reviewDue = (): readonly string[] => [];

export { componentOf, learnerModel, reviewDue, type Component, type Domains, type Model };
