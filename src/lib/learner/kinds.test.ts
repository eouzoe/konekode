import { expect, test } from 'bun:test';

import { array, assert, constantFrom, integer, property, record } from 'fast-check';

import { type LearningEvent } from '@/lib/record/event';
import { allDomains } from '@/units/index';

import { keptKinds, modelKinds, progressKinds } from './kinds';
import { handledKinds, learnerModel } from './model';
import { unitState, unlockedItems } from './progress';

interface Sketch {
  readonly at: number;
  readonly kind: string;
  readonly ref: string;
  readonly step: number;
  readonly verdict: string;
}

const domains = allDomains();
const others = ['key.down', 'run.finished', 'session.started', 'dev.note'];

const sketches = array(
  record({
    at: integer({ max: 30, min: 0 }),
    kind: constantFrom(...progressKinds, ...modelKinds, ...others),
    ref: constantFrom('go-end', 'run-cout', 'key.G', 'pair.brace'),
    step: integer({ max: 12, min: 0 }),
    verdict: constantFrom('right', 'wrong'),
  }),
  { maxLength: 40 },
);

const make = (sketch: Sketch, seq: number): LearningEvent => ({
  actor: 'me',
  at: sketch.at,
  data: { at: sketch.step, verdict: sketch.verdict },
  id: `event-${String(seq)}`,
  kind: sketch.kind,
  ref: sketch.ref,
  seq,
  session: 'one',
  unit: 'start',
  version: 2,
});

test('the model reads exactly the kinds it declares', () => {
  expect(handledKinds.toSorted()).toEqual([...modelKinds].toSorted());
});

test('dropping the kinds nobody reads changes nothing that is computed locally', () => {
  assert(
    property(sketches, (list) => {
      const events = list.map((sketch, at) => make(sketch, at + 1));
      const pruned = events.filter((event) => keptKinds.has(event.kind));
      expect(unitState(pruned, 'start')).toEqual(unitState(events, 'start'));
      expect(unlockedItems(pruned)).toEqual(unlockedItems(events));
      expect(learnerModel(pruned, domains)).toEqual(learnerModel(events, domains));
    }),
  );
});
