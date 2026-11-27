import { expect, test } from 'bun:test';

import { components, unitDomain, type UnitDomain } from './domain';
import { componentOf, observe, type Component, type Domains } from './model';

import type { Data, LearningEvent } from '@/lib/record/event';
import type { Beat, Task } from '@konekode/contracts/unit';

interface Content {
  readonly beats: ReadonlyArray<Beat>;
  readonly tasks: ReadonlyArray<Task>;
}

const unit = 'fake';

const contentWith = (keys: ReadonlyArray<string>, shown: ReadonlyArray<string>): Content => ({
  beats: [
    { id: 'look', keys: shown, say: '', stage: 'run' },
    { id: 'gate', say: '', stage: 'run', wait: 'run' },
  ],
  tasks: [{ demo: [{ id: 'look', keys }], expect: '', goal: '', id: 'gate', show: '' }],
});

const before = contentWith(['G', 'O', 'type:x', 'Esc'], ['G']);
const after = contentWith(['O', 'type:x', 'Esc', 'j', 'G'], ['j']);

interface Press {
  readonly at: number;
  readonly verdict: string;
}

const presses: ReadonlyArray<Press> = [
  { at: 0, verdict: 'wrong' },
  { at: 0, verdict: 'right' },
  { at: 1, verdict: 'right' },
  { at: 2, verdict: 'wrong' },
  { at: 2, verdict: 'right' },
  { at: 3, verdict: 'right' },
];

interface Sketch {
  readonly data: Data;
  readonly kind: string;
  readonly ref: string;
}

const eventOf = ({ data, kind, ref }: Sketch, seq: number): LearningEvent => ({
  actor: 'me',
  at: seq * 1000,
  content: 'recorded-under-before',
  data,
  id: `e${String(seq)}`,
  kind,
  ref,
  seq,
  session: 'one',
  site: 'test',
  unit,
  version: 3,
});

const recordUnder = (domain: UnitDomain, describe: boolean): Array<LearningEvent> => {
  const told = (field: string, ids: ReadonlyArray<string> | undefined): Data => {
    if (!describe) {
      return {};
    }
    return { [field]: (ids ?? []).join(',') };
  };
  const sketches: Array<Sketch> = [
    { data: told('shows', domain.shows.get('look')), kind: 'beat.reached', ref: 'look' },
    { data: { mode: 'guided' }, kind: 'task.entered', ref: 'gate' },
    ...presses.map((press) => ({
      data: {
        at: press.at,
        verdict: press.verdict,
        ...told('uses', domain.uses.get('gate')?.[press.at]),
      },
      kind: 'step.tried',
      ref: 'gate',
    })),
  ];
  return sketches.map((sketch, index) => eventOf(sketch, index + 1));
};

const domainsOf = (content: Content): Domains => ({ [unit]: unitDomain(content) });

const everything = (events: ReadonlyArray<LearningEvent>, domains: Domains) => {
  const reading = observe(events, domains);
  const model: Record<string, Component> = Object.fromEntries(
    components.map((id) => [id, componentOf(reading.model, id)]),
  );
  return {
    legacy: reading.legacy,
    model,
    observations: reading.observations,
    unread: reading.unread,
  };
};

test('events that describe themselves give the same learner model after the unit changes', () => {
  const events = recordUnder(unitDomain(before), true);
  const then = everything(events, domainsOf(before));
  const now = everything(events, domainsOf(after));
  expect(now).toEqual(then);
  expect(then.legacy).toBe(0);
  expect(then.model['key.G']).toMatchObject({ completed: 1, opportunities: 1, shown: 1 });
});

test('events that do not describe themselves are read through the current unit and counted', () => {
  const events = recordUnder(unitDomain(before), false);
  const then = everything(events, domainsOf(before));
  const now = everything(events, domainsOf(after));
  expect(now.model).not.toEqual(then.model);
  expect(now.legacy).toBe(presses.length + 1);
});

test('a described event of a unit that no longer exists still counts; an undescribed one is counted as unread', () => {
  const described = recordUnder(unitDomain(before), true);
  const bare = recordUnder(unitDomain(before), false);
  expect(everything(described, {}).model).toEqual(everything(described, domainsOf(before)).model);
  expect(everything(bare, {})).toMatchObject({ legacy: 0, unread: presses.length + 1 });
});
