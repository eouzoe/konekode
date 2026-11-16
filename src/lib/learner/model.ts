import { ordered, type LearningEvent } from '@/lib/record/event';

import { bktExpect, bktUpdate, defaultParams } from './bkt';
import { type UnitDomain } from './domain';

type Standing = 'done' | 'shown' | 'unseen';

interface Tally {
  completed: number;
  estimate: number;
  firstRight: number;
  opportunities: number;
  shown: number;
  unsettled: boolean;
}

interface Component extends Readonly<Tally> {
  readonly standing: Standing;
}

type Domains = Readonly<Record<string, UnitDomain>>;
type Model = ReadonlyMap<string, Component>;

interface Observation {
  readonly at: number;
  readonly component: string;
  readonly opportunity: number;
  readonly predicted: number;
  readonly right: boolean;
  readonly session: string;
  readonly step: number;
  readonly task: string;
  readonly unit: string;
  readonly waited: number;
}

interface Entry {
  last: number;
  readonly steps: Map<number, boolean>;
}

interface Mark {
  readonly first: boolean;
  readonly right: boolean;
  readonly step: number;
  readonly waited: number;
}

interface Fold {
  readonly entries: Map<string, Entry>;
  readonly observations: Observation[];
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
    unsettled: false,
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
  fold.entries.set(entryKey(event), { last: event.at, steps: new Map() });
};

const score = (tally: Tally, first: boolean, right: boolean): void => {
  if (first) {
    tally.opportunities += 1;
    tally.estimate = bktUpdate(tally.estimate, defaultParams, { correct: right });
    tally.unsettled = !right;
  }
  if (first && right) {
    tally.firstRight += 1;
  }
  if (right) {
    tally.completed += 1;
  }
};

const markOf = (entry: Entry, event: LearningEvent, step: number): Mark => {
  const mark: Mark = {
    first: !entry.steps.has(step),
    right: event.data.verdict === 'right',
    step,
    waited: event.at - entry.last,
  };
  entry.steps.set(step, mark.right);
  if (mark.right) {
    entry.last = event.at;
  }
  return mark;
};

const observed = (
  event: LearningEvent,
  mark: Mark,
  tally: Tally,
): Omit<Observation, 'component'> => ({
  at: event.at,
  opportunity: tally.opportunities + 1,
  predicted: bktExpect(tally.estimate, defaultParams),
  right: mark.right,
  session: event.session,
  step: mark.step,
  task: event.ref,
  unit: event.unit,
  waited: mark.waited,
});

const attempt: Handle = (fold, event, domain) => {
  const entry = fold.entries.get(entryKey(event));
  const { at: step } = event.data;
  if (entry === undefined || typeof step !== 'number' || entry.steps.get(step) === true) {
    return;
  }
  const mark = markOf(entry, event, step);
  for (const component of domain.uses.get(event.ref)?.[step] ?? []) {
    const tally = tallyOf(fold, component);
    if (mark.first) {
      fold.observations.push({ component, ...observed(event, mark, tally) });
    }
    score(tally, mark.first, mark.right);
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

interface Reading {
  readonly model: Model;
  readonly observations: readonly Observation[];
}

const observe = (events: readonly LearningEvent[], domains: Domains): Reading => {
  const fold: Fold = { entries: new Map(), observations: [], seen: new Set(), tallies: new Map() };
  for (const event of ordered(events)) {
    const domain = domains[event.unit];
    const handle = handles[event.kind];
    if (domain !== undefined && handle !== undefined) {
      handle(fold, event, domain);
    }
  }
  const model: Model = new Map(
    [...fold.tallies].map(([id, tally]) => [id, { ...tally, standing: standingOf(tally) }]),
  );
  return { model, observations: fold.observations };
};

const learnerModel = (events: readonly LearningEvent[], domains: Domains): Model =>
  observe(events, domains).model;

const unseen: Component = {
  completed: 0,
  estimate: defaultParams.pL0,
  firstRight: 0,
  opportunities: 0,
  shown: 0,
  standing: 'unseen',
  unsettled: false,
};

const componentOf = (model: Model, id: string): Component => model.get(id) ?? unseen;

const reviewDue = (): readonly string[] => [];

const handledKinds: readonly string[] = Object.keys(handles);

export {
  componentOf,
  handledKinds,
  learnerModel,
  observe,
  reviewDue,
  type Component,
  type Domains,
  type Model,
  type Observation,
};
