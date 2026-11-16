import { expect, test } from 'bun:test';

import { array, assert, constantFrom, integer, property, record, type Arbitrary } from 'fast-check';

import { type LearningEvent } from '@/lib/record/event';
import { allDomains } from '@/units/index';

import { components } from './domain';
import { componentOf, learnerModel, observe, reviewDue, type Component, type Model } from './model';

interface Sketch {
  readonly at: number;
  readonly kind: string;
  readonly ref: string;
  readonly session: string;
  readonly step: number;
  readonly unit: string;
  readonly verdict: string;
}

const make = (sketch: Partial<Sketch>, seq: number): LearningEvent => ({
  actor: 'me',
  at: sketch.at ?? seq,
  data: { at: sketch.step ?? 0, verdict: sketch.verdict ?? 'right' },
  id: `event-${String(seq)}`,
  kind: sketch.kind ?? 'step.tried',
  ref: sketch.ref ?? 'run-cout',
  seq,
  session: sketch.session ?? 'one',
  unit: sketch.unit ?? 'start',
  version: 2,
});

const build = (sketches: readonly Partial<Sketch>[]): LearningEvent[] =>
  sketches.map((sketch, at) => make(sketch, at + 1));

const domains = allDomains();

const read = (events: readonly LearningEvent[]): Model => learnerModel(events, domains);

const plain = (model: Model): Record<string, Component> =>
  Object.fromEntries(components.map((id) => [id, componentOf(model, id)]));

const rank = { done: 2, shown: 1, unseen: 0 };

test('nothing recorded means nothing seen', () => {
  expect(componentOf(read([]), 'key.G')).toEqual({
    completed: 0,
    estimate: 0.2,
    firstRight: 0,
    opportunities: 0,
    shown: 0,
    standing: 'unseen',
  });
});

test('reaching a beat where the sprite presses a key counts as shown, once per beat', () => {
  const model = read(
    build([
      { kind: 'beat.reached', ref: 'go-end' },
      { kind: 'beat.reached', ref: 'go-end' },
    ]),
  );
  expect(componentOf(model, 'key.G')).toMatchObject({ shown: 1, standing: 'shown' });
  expect(componentOf(model, 'key.O').standing).toBe('unseen');
});

test('a first press that is right is one opportunity, right the first time', () => {
  const model = read(build([{ kind: 'task.entered' }, { step: 0 }]));
  expect(componentOf(model, 'key.G')).toMatchObject({
    completed: 1,
    firstRight: 1,
    opportunities: 1,
    standing: 'done',
  });
});

test('wrong then right is one opportunity, completed but not right the first time', () => {
  const model = read(
    build([{ kind: 'task.entered' }, { step: 0, verdict: 'wrong' }, { step: 0 }, { step: 0 }]),
  );
  expect(componentOf(model, 'key.G')).toMatchObject({
    completed: 1,
    firstRight: 0,
    opportunities: 1,
  });
});

test('entering the task again makes the same step a new opportunity', () => {
  const model = read(
    build([
      { kind: 'task.entered' },
      { step: 0, verdict: 'wrong' },
      { kind: 'task.entered' },
      { step: 0 },
    ]),
  );
  expect(componentOf(model, 'key.G')).toMatchObject({
    completed: 1,
    firstRight: 1,
    opportunities: 2,
  });
});

test('a press belongs to the entry of its own session', () => {
  const model = read(
    build([
      { kind: 'task.entered', session: 'one' },
      { session: 'two', step: 0 },
    ]),
  );
  expect(componentOf(model, 'key.G').opportunities).toBe(0);
});

test('typed text and steps past the end of the path are not observations', () => {
  const model = read(build([{ kind: 'task.entered' }, { step: 2 }, { step: 99 }]));
  expect(plain(model)).toEqual(plain(read([])));
});

test('starting the unit over does not erase what was seen and done', () => {
  const model = read(
    build([
      { kind: 'beat.reached', ref: 'go-end' },
      { kind: 'task.entered' },
      { step: 0 },
      { kind: 'unit.restarted', ref: '' },
    ]),
  );
  expect(componentOf(model, 'key.G')).toMatchObject({ completed: 1, shown: 1, standing: 'done' });
});

test('events of a unit without a domain are ignored', () => {
  const events = build([
    { kind: 'task.entered', unit: 'elsewhere' },
    { step: 0, unit: 'elsewhere' },
  ]);
  expect(plain(read(events))).toEqual(plain(read([])));
});

test('the side estimate follows first presses only and is not used for the standing', () => {
  const right = read(build([{ kind: 'task.entered' }, { step: 0 }]));
  const wrong = read(
    build([{ kind: 'task.entered' }, { step: 0, verdict: 'wrong' }, { step: 0 }, { step: 0 }]),
  );
  expect(componentOf(right, 'key.G').estimate).toBeCloseTo(0.636, 3);
  expect(componentOf(wrong, 'key.G').estimate).toBeLessThan(0.2);
  expect(componentOf(wrong, 'key.G').standing).toBe('done');
});

test('each opportunity is listed with the wait before it and the chance given beforehand', () => {
  const { observations } = observe(
    build([
      { at: 100, kind: 'task.entered' },
      { at: 400, step: 0, verdict: 'wrong' },
      { at: 500, step: 0 },
      { at: 900, step: 1 },
      { at: 2000, kind: 'task.entered' },
      { at: 2300, step: 0 },
    ]),
    domains,
  );
  expect(
    observations.map((item) => [item.component, item.opportunity, item.right, item.waited]),
  ).toEqual([
    ['key.G', 1, false, 300],
    ['key.O', 1, true, 400],
    ['key.G', 2, true, 300],
  ]);
  expect(observations[0]?.predicted).toBeCloseTo(0.396, 3);
  expect(observations[2]?.predicted).toBeLessThan(0.396);
  expect(observations[0]).toMatchObject({
    session: 'one',
    step: 0,
    task: 'run-cout',
    unit: 'start',
  });
});

test('nothing is due for review yet', () => {
  expect(reviewDue()).toEqual([]);
});

const sketch: Arbitrary<Partial<Sketch>> = record({
  at: integer({ max: 40, min: 0 }),
  kind: constantFrom('beat.reached', 'task.entered', 'step.tried', 'unit.restarted'),
  ref: constantFrom('go-end', 'repeat', 'run-cout', 'run-newline'),
  session: constantFrom('one', 'two'),
  step: integer({ max: 14, min: 0 }),
  verdict: constantFrom('right', 'wrong', 'ime'),
});

const sketches = array(sketch, { maxLength: 40 });

test('the same events give the same model in any order, with repeats', () => {
  assert(
    property(sketches, (list) => {
      const events = build(list);
      const expected = plain(read(events));
      const reversed = plain(read(events.toReversed()));
      const doubled = plain(read([...events, ...events]));
      expect(reversed).toEqual(expected);
      expect(doubled).toEqual(expected);
    }),
  );
});

test('first-time rights never exceed completions, which never exceed opportunities', () => {
  assert(
    property(sketches, (list) => {
      const reading = observe(build(list), domains);
      const model = plain(reading.model);
      for (const [id, component] of Object.entries(model)) {
        const listed = reading.observations.filter((item) => item.component === id);
        expect(listed).toHaveLength(component.opportunities);
        expect(component.estimate).toBeGreaterThanOrEqual(0);
        expect(component.estimate).toBeLessThanOrEqual(1);
        expect(component.firstRight).toBeLessThanOrEqual(component.completed);
        expect(component.completed).toBeLessThanOrEqual(component.opportunities);
      }
    }),
  );
});

test('more events never lower a standing or a count of what was shown, met or completed', () => {
  assert(
    property(sketches, sketches, (base, extra) => {
      const events = build([...base, ...extra]);
      const before = plain(read(events.slice(0, base.length)));
      const after = plain(read(events));
      for (const id of components) {
        const was = rank[before[id]?.standing ?? 'unseen'];
        const now = rank[after[id]?.standing ?? 'unseen'];
        expect(now).toBeGreaterThanOrEqual(was);
        expect(after[id]?.shown).toBeGreaterThanOrEqual(before[id]?.shown ?? 0);
        expect(after[id]?.opportunities).toBeGreaterThanOrEqual(before[id]?.opportunities ?? 0);
        expect(after[id]?.completed).toBeGreaterThanOrEqual(before[id]?.completed ?? 0);
      }
    }),
  );
});

test('events that come later never lower the count of first-time rights', () => {
  assert(
    property(sketches, sketches, (base, extra) => {
      const later = extra.map((item) => ({ ...item, at: (item.at ?? 0) + 100 }));
      const events = build([...base, ...later]);
      const before = plain(read(events.slice(0, base.length)));
      const after = plain(read(events));
      for (const id of components) {
        expect(after[id]?.firstRight).toBeGreaterThanOrEqual(before[id]?.firstRight ?? 0);
      }
    }),
  );
});
