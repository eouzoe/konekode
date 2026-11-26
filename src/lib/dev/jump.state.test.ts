import { expect, test } from 'bun:test';

import { unitState } from '@/lib/learner/progress';

import { jumpTo, type Stop } from './jump';

import type { LearningEvent } from '@/lib/record/event';

const stops: ReadonlyArray<Stop> = [
  { id: 'a' },
  { id: 'gate-1', wait: 'run' },
  { id: 'b' },
  { id: 'gate-2', wait: 'run' },
];

const event = (kind: string, ref: string, seq: number): LearningEvent => ({
  actor: 'me',
  at: 1000,
  content: 'test-content',
  data: {},
  id: `e${String(seq)}`,
  kind,
  ref,
  seq,
  session: 's',
  site: 'test',
  unit: 'u',
  version: 3,
});

test('jumping back to a gate that was passed makes it a gate to do again', () => {
  const before = [event('check.passed', 'gate-1', 1), event('check.passed', 'gate-2', 2)];
  const jump = jumpTo(stops, 'gate-1').map((entry, at) => event(entry.kind, entry.ref, at + 3));
  const state = unitState([...before, ...jump], 'u');
  expect(state.position).toBe('gate-1');
  expect([...state.passed]).toEqual([]);
});

test('jumping forward leaves exactly the earlier gates passed', () => {
  const jump = jumpTo(stops, 'gate-2').map((entry, at) => event(entry.kind, entry.ref, at + 1));
  const state = unitState(jump, 'u');
  expect(state.position).toBe('gate-2');
  expect([...state.passed]).toEqual(['gate-1']);
});
