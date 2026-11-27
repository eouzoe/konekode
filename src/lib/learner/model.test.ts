import { expect, test } from 'bun:test';

import { array, assert, constantFrom, integer, property, record, type Arbitrary } from 'fast-check';

import { allDomains } from '@/lib/learner/units';

import { components } from './domain';
import { dayLength } from './memory';
import {
  componentOf,
  learnerModel,
  observe,
  recollect,
  reviewDue,
  type Component,
  type Model,
} from './model';

import type { LearningEvent } from '@/lib/record/event';

interface Sketch {
  readonly at: number;
  readonly kind: string;
  readonly mode: string;
  readonly ref: string;
  readonly session: string;
  readonly step: number;
  readonly unit: string;
  readonly verdict: string;
}

const make = (sketch: Partial<Sketch>, seq: number): LearningEvent => ({
  actor: 'me',
  at: sketch.at ?? seq,
  content: 'test-content',
  data: { at: sketch.step ?? 0, mode: sketch.mode ?? 'guided', verdict: sketch.verdict ?? 'right' },
  id: `event-${String(seq)}`,
  kind: sketch.kind ?? 'step.tried',
  ref: sketch.ref ?? 'run-cout',
  seq,
  session: sketch.session ?? 'one',
  site: 'test',
  unit: sketch.unit ?? 'start',
  version: 3,
});

const build = (sketches: ReadonlyArray<Partial<Sketch>>): Array<LearningEvent> =>
  sketches.map((sketch, at) => make(sketch, at + 1));

const domains = allDomains();

const read = (events: ReadonlyArray<LearningEvent>): Model => learnerModel(events, domains);

const afterwards = (event: LearningEvent): LearningEvent => ({
  ...event,
  at: event.at + 100,
  id: `later-${event.id}`,
});

const plain = (model: Model): Record<string, Component> =>
  Object.fromEntries(components.map((id) => [id, componentOf(model, id)]));

const rank = { done: 2, shown: 1, unseen: 0 };

test('nothing recorded means nothing seen', () => {
  expect(componentOf(read([]), 'key.G')).toEqual({
    completed: 0,
    estimate: 0.2,
    firstRight: 0,
    memory: null,
    opportunities: 0,
    shown: 0,
    standing: 'unseen',
    unsettled: false,
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

test('a key stays unsettled until a later opportunity is right the first time', () => {
  const slipped = build([{ kind: 'task.entered' }, { step: 0, verdict: 'wrong' }, { step: 0 }]);
  const again = [
    ...slipped,
    ...build([{ kind: 'task.entered' }, { step: 0 }]).map((event) => afterwards(event)),
  ];
  expect(componentOf(read(slipped), 'key.G')).toMatchObject({ completed: 1, unsettled: true });
  expect(componentOf(read(again), 'key.G').unsettled).toBe(false);
  expect(componentOf(read(slipped), 'key.O').unsettled).toBe(false);
});

const day = dayLength;
const minute = 60_000;

test('nothing practised means nothing to review, however long it has been', () => {
  expect(reviewDue(read([]), 400 * day)).toEqual([]);
  const shown = read(build([{ kind: 'beat.reached', ref: 'go-end' }]));
  expect(reviewDue(shown, 400 * day)).toEqual([]);
});

test('a key pressed right with the answer on screen comes back the next day', () => {
  const model = read(
    build([
      { at: 100, kind: 'task.entered' },
      { at: 200, step: 0 },
    ]),
  );
  expect(reviewDue(model, 200)).toEqual([]);
  expect(reviewDue(model, 200 + day / 4)).toEqual([]);
  expect(reviewDue(model, 200 + day)).toEqual(['key.G']);
});

test('how well a key is remembered and how long until its check can be read at any moment', () => {
  const model = read(
    build([
      { at: 100, kind: 'task.entered' },
      { at: 200, step: 0 },
    ]),
  );
  const fresh = recollect(componentOf(model, 'key.G'), 200);
  const stale = recollect(componentOf(model, 'key.G'), 200 + 2 * day);
  expect(recollect(componentOf(model, 'key.O'), 200)).toBeNull();
  expect(fresh?.daysLeft).toBeCloseTo(0.6, 1);
  expect(fresh?.recall).toBeGreaterThan(0.99);
  expect(stale?.daysLeft).toBeCloseTo(-1.4, 1);
  expect(stale?.recall).toBeLessThan(0.9);
});

test('a key pressed right without help is left alone for days', () => {
  const model = read(
    build([
      { at: 100, kind: 'task.entered', mode: 'free' },
      { at: 200, step: 0 },
    ]),
  );
  expect(reviewDue(model, 200 + 3 * day)).toEqual([]);
  expect(reviewDue(model, 200 + 6 * day)).toEqual(['key.G']);
});

test('a key missed on its first press is due at once', () => {
  const model = read(
    build([
      { at: 100, kind: 'task.entered' },
      { at: 200, step: 0, verdict: 'wrong' },
      { at: 300, step: 0 },
    ]),
  );
  expect(reviewDue(model, 300 + minute)).toEqual(['key.G']);
});

test('only the first press of a step reaches the memory', () => {
  const once = read(
    build([
      { at: 100, kind: 'task.entered' },
      { at: 200, step: 0, verdict: 'wrong' },
    ]),
  );
  const corrected = read(
    build([
      { at: 100, kind: 'task.entered' },
      { at: 200, step: 0, verdict: 'wrong' },
      { at: 300, step: 0 },
    ]),
  );
  expect(componentOf(corrected, 'key.G').memory).toEqual(componentOf(once, 'key.G').memory);
});

test('what is most overdue comes first', () => {
  const model = read(
    build([
      { at: 100, kind: 'task.entered' },
      { at: 200, step: 0 },
      { at: 300, step: 1, verdict: 'wrong' },
    ]),
  );
  expect(reviewDue(model, 300 + minute)).toEqual(['key.O']);
  expect(reviewDue(model, 300 + day)).toEqual(['key.O', 'key.G']);
});

test('each opportunity carries the recall expected just before it', () => {
  const { observations } = observe(
    build([
      { at: 100, kind: 'task.entered' },
      { at: 200, step: 0 },
      { at: 200 + day, kind: 'task.entered' },
      { at: 300 + day, step: 0 },
    ]),
    domains,
  );
  expect(observations[0]?.remembered).toBeNull();
  expect(observations[1]?.remembered).toBeGreaterThan(0.8);
  expect(observations[1]?.remembered).toBeLessThan(0.9);
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

test('whatever is due has been practised, and stays due until it is practised again', () => {
  assert(
    property(
      sketches,
      integer({ max: 400, min: 0 }),
      integer({ max: 400, min: 0 }),
      (list, wait, more) => {
        const model = read(build(list));
        const sooner = reviewDue(model, wait * day);
        const later = reviewDue(model, (wait + more) * day);
        for (const id of sooner) {
          expect(componentOf(model, id).opportunities).toBeGreaterThan(0);
          expect(later).toContain(id);
        }
        expect(new Set(later).size).toBe(later.length);
      },
    ),
  );
});

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
