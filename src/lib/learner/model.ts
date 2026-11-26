import { ordered, type LearningEvent } from '@/lib/record/event';

import { bktExpect, bktUpdate, defaultParams } from './bkt';
import { described, shownBy, usedBy, type Count } from './describe';
import { recall, remember, type Evidence, type Memory } from './memory';

import type { UnitDomain } from './domain';

type Standing = 'done' | 'shown' | 'unseen';

interface Tally {
  completed: number;
  estimate: number;
  firstRight: number;
  memory: Memory | null;
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
  readonly remembered: number | null;
  readonly right: boolean;
  readonly session: string;
  readonly step: number;
  readonly task: string;
  readonly unit: string;
  readonly waited: number;
}

interface Entry {
  readonly helped: boolean;
  last: number;
  readonly steps: Map<number, boolean>;
}

interface Mark {
  readonly evidence: Evidence;
  readonly first: boolean;
  readonly right: boolean;
  readonly step: number;
  readonly waited: number;
}

interface Fold extends Count {
  readonly entries: Map<string, Entry>;
  readonly observations: Array<Observation>;
  readonly seen: Set<string>;
  readonly tallies: Map<string, Tally>;
}

type Handle = (fold: Fold, event: LearningEvent, domain: UnitDomain | undefined) => void;

const tallyOf = (fold: Fold, id: string): Tally => {
  const known = fold.tallies.get(id);
  if (known !== undefined) {
    return known;
  }
  const fresh: Tally = {
    completed: 0,
    estimate: defaultParams.pL0,
    firstRight: 0,
    memory: null,
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
  const shown = described(fold, event.data.shows, () => shownBy(domain, event.ref));
  for (const id of shown) {
    tallyOf(fold, id).shown += 1;
  }
};

const entryKey = (event: LearningEvent): string => `${event.session}|${event.unit}|${event.ref}`;

const enter: Handle = (fold, event) => {
  fold.entries.set(entryKey(event), {
    helped: event.data.mode !== 'free',
    last: event.at,
    steps: new Map(),
  });
};

const evidenceOf = (helped: boolean, right: boolean): Evidence => {
  if (!right) {
    return 'wrong';
  }
  if (helped) {
    return 'helped';
  }
  return 'unaided';
};

const score = (tally: Tally, mark: Mark, at: number): void => {
  if (mark.first) {
    tally.opportunities += 1;
    tally.estimate = bktUpdate(tally.estimate, defaultParams, { correct: mark.right });
    tally.memory = remember(tally.memory, at, mark.evidence);
    tally.unsettled = !mark.right;
  }
  if (mark.first && mark.right) {
    tally.firstRight += 1;
  }
  if (mark.right) {
    tally.completed += 1;
  }
};

const markOf = (entry: Entry, event: LearningEvent, step: number): Mark => {
  const right = event.data.verdict === 'right';
  const mark: Mark = {
    evidence: evidenceOf(entry.helped, right),
    first: !entry.steps.has(step),
    right,
    step,
    waited: event.at - entry.last,
  };
  entry.steps.set(step, mark.right);
  if (mark.right) {
    entry.last = event.at;
  }
  return mark;
};

const rememberedAt = (memory: Memory | null, at: number): number | null => {
  if (memory === null) {
    return null;
  }
  return recall(memory, at);
};

const observed = (
  event: LearningEvent,
  mark: Mark,
  tally: Tally,
): Omit<Observation, 'component'> => ({
  at: event.at,
  opportunity: tally.opportunities + 1,
  predicted: bktExpect(tally.estimate, defaultParams),
  remembered: rememberedAt(tally.memory, event.at),
  right: mark.right,
  session: event.session,
  step: mark.step,
  task: event.ref,
  unit: event.unit,
  waited: mark.waited,
});

interface Credit {
  readonly event: LearningEvent;
  readonly mark: Mark;
  readonly used: ReadonlyArray<string>;
}

const credit = (fold: Fold, { event, mark, used }: Credit): void => {
  for (const component of used) {
    const tally = tallyOf(fold, component);
    if (mark.first) {
      fold.observations.push({ component, ...observed(event, mark, tally) });
    }
    score(tally, mark, event.at);
  }
};

const attempt: Handle = (fold, event, domain) => {
  const entry = fold.entries.get(entryKey(event));
  const { at: step } = event.data;
  if (entry === undefined || typeof step !== 'number' || entry.steps.get(step) === true) {
    return;
  }
  const mark = markOf(entry, event, step);
  const used = described(fold, event.data.uses, () => usedBy(domain, event.ref, step));
  credit(fold, { event, mark, used });
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
  readonly legacy: number;
  readonly model: Model;
  readonly observations: ReadonlyArray<Observation>;
  readonly unread: number;
}

const own = <Value>(table: Readonly<Record<string, Value>>, key: string): Value | undefined => {
  if (Object.hasOwn(table, key)) {
    return table[key];
  }
  return undefined;
};

const observe = (events: ReadonlyArray<LearningEvent>, domains: Domains): Reading => {
  const fold: Fold = {
    entries: new Map(),
    legacy: 0,
    observations: [],
    seen: new Set(),
    tallies: new Map(),
    unread: 0,
  };
  for (const event of ordered(events)) {
    own(handles, event.kind)?.(fold, event, own(domains, event.unit));
  }
  const model: Model = new Map(
    [...fold.tallies].map(([id, tally]) => [id, { ...tally, standing: standingOf(tally) }]),
  );
  return { legacy: fold.legacy, model, observations: fold.observations, unread: fold.unread };
};

const learnerModel = (events: ReadonlyArray<LearningEvent>, domains: Domains): Model =>
  observe(events, domains).model;

const unseen: Component = {
  completed: 0,
  estimate: defaultParams.pL0,
  firstRight: 0,
  memory: null,
  opportunities: 0,
  shown: 0,
  standing: 'unseen',
  unsettled: false,
};

const componentOf = (model: Model, id: string): Component => model.get(id) ?? unseen;

const handledKinds: ReadonlyArray<string> = Object.keys(handles);

export { recollect, reviewDue } from './review';

export {
  componentOf,
  handledKinds,
  learnerModel,
  observe,
  type Component,
  type Domains,
  type Model,
  type Observation,
};
