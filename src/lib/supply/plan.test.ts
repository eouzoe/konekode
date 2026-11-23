import { describe, expect, test } from 'bun:test';

import { beats } from '@/units/start';

import {
  downloadMs,
  dues,
  msBetween,
  overdue,
  readDues,
  timeToStart,
  type Link,
  type Rule,
} from './plan';
import { rules } from './rules';

const slow: Link = { bitsPerMs: 1600, latencyMs: 150 };
const fast: Link = { bitsPerMs: 100_000, latencyMs: 10 };

const found = dues(beats, rules);
const at = (name: string): number => found.find((due) => due.name === name)?.by ?? -1;

describe('dues of the start unit', () => {
  test('each need is due at the first sentence that uses it, the compiler one sentence ahead', () => {
    expect(at('drill')).toBe(beats.findIndex((beat) => beat.stage === 'drill'));
    expect(at('editor')).toBe(beats.findIndex((beat) => beat.stage === 'run'));
    expect(at('compiler')).toBe(beats.findIndex((beat) => beat.free === true) - 1);
  });

  test('the start unit has a free task, and the compiler is not due while a guided task is ahead of it', () => {
    const free = beats.findIndex((beat) => beat.free === true);
    expect(free).toBeGreaterThan(0);
    const guided = beats.findLastIndex(
      (beat, index) => index < free && beat.wait === 'run' && beat.free !== true,
    );
    expect(at('compiler')).toBeGreaterThan(guided);
  });

  test('nothing is due on the opening sentence', () => {
    expect(found.every((due) => due.by > 0)).toBe(true);
    expect(overdue(found, 0)).toEqual([]);
  });

  test('needs are listed in the order they fall due', () => {
    const order = found.map((due) => due.by);
    expect(order).toEqual(order.toSorted((left, right) => left - right));
  });

  test('the schedule survives the trip through the page', () => {
    expect(readDues(JSON.stringify(found))).toEqual(found);
    expect(readDues('')).toEqual([]);
  });
});

const sentence = { say: '一二三四五六七八九十', stage: 'empty' };

describe('when to start', () => {
  const steps = [sentence, sentence, { say: '一二三', stage: 'drill' }];
  const due = { by: 2, bytes: 8 * 1024, early: true, gate: true, name: 'drill' };

  test('reading time counts every sentence before the deadline, at least a floor each', () => {
    expect(msBetween(steps, 0, 2)).toBe(3000);
    expect(msBetween(steps, 2, 2)).toBe(0);
  });

  test('a small file on a fast link still starts several sentences ahead', () => {
    expect(timeToStart({ at: 0, due, link: fast, steps })).toBe(true);
    const far = [...Array.from({ length: 10 }, () => sentence), ...steps];
    const later = { ...due, by: far.length - 1 };
    expect(timeToStart({ at: 0, due: later, link: fast, steps: far })).toBe(false);
    expect(timeToStart({ at: far.length - 4, due: later, link: fast, steps: far })).toBe(true);
  });

  test('anything that would not arrive in time starts at once', () => {
    const big = { ...due, bytes: 2 * 1024 * 1024 };
    expect(downloadMs(big.bytes, slow)).toBeGreaterThan(msBetween(steps, 0, 2));
    expect(timeToStart({ at: 0, due: big, link: slow, steps })).toBe(true);
  });

  test('a need that may not start early waits for its own sentence, however slow the link', () => {
    const onTime = { ...due, bytes: 2 * 1024 * 1024, early: false };
    expect(timeToStart({ at: 0, due: onTime, link: slow, steps })).toBe(false);
    expect(timeToStart({ at: 1, due: onTime, link: slow, steps })).toBe(false);
    expect(timeToStart({ at: 2, due: onTime, link: slow, steps })).toBe(true);
  });

  test('a need already past its deadline always starts', () => {
    expect(timeToStart({ at: 2, due, link: fast, steps })).toBe(true);
    expect(overdue([due], 2)).toEqual([due]);
  });
});

describe('a lead', () => {
  const steps = [sentence, sentence, { free: true, say: '一', stage: 'run' }];
  const rule: Rule = {
    bytes: 1,
    early: false,
    gate: false,
    lead: 0,
    name: 'x',
    wants: (step) => step.free === true,
  };

  test('moves a need earlier but never before the first sentence', () => {
    expect(dues(steps, [rule])[0]?.by).toBe(2);
    expect(dues(steps, [{ ...rule, lead: 1 }])[0]?.by).toBe(1);
    expect(dues(steps, [{ ...rule, lead: 5 }])[0]?.by).toBe(0);
  });

  test('leaves out a need nothing asks for', () => {
    expect(dues([sentence], [{ ...rule, lead: 1 }])).toEqual([]);
  });
});
