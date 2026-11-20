import { expectedNow, press } from '../src/lib/edit/session';
import { checksOf } from '../src/units/index';
import { generator, openAt, pickFrom } from './fuzz-support';
import { arrive, expectSame, tap, type Walk } from './gate-support';
import { studentEditor } from './gate-view';
import { test } from './test';

const rounds = 3;
const length = 50;
const rightShare = 0.5;
const burst = 3;
const pool = String.raw`abcdefghijklmnopqrstuvwxyzGIOX$0.123<>(){};'"# `.split('');
const named = ['Escape', 'Escape', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowDown', 'Enter'];

test.use({ heldTime: true });

const rightKey = (walk: Walk): string | null => {
  const expected = expectedNow(walk.session);
  if (expected === null || expected.kind === 'run') {
    return null;
  }
  return expected.key;
};

const pick = (walk: Walk, random: () => number): string => {
  const right = rightKey(walk);
  if (right !== null && random() < rightShare) {
    return right;
  }
  return pickFrom(random, [...pool, ...named]);
};

const paceOf = (seed: number): number => {
  if (seed % 2 === 0) {
    return burst;
  }
  return 1;
};

for (const gate of checksOf('start')) {
  test(`${gate.id}: random keys never take the page away from what the rules say`, async ({
    page,
  }, info) => {
    const firstSeed = info.repeatEachIndex * rounds + 1;
    for (let seed = firstSeed; seed < firstSeed + rounds; seed += 1) {
      await openAt(page, gate.id, studentEditor);
      const walk = arrive(page, gate.id);
      const random = generator(seed);
      const label = (): string => `seed ${String(seed)}, keys: ${JSON.stringify(walk.actions)}`;
      await expectSame(walk, label());
      for (let count = 0; count < length; count += 1) {
        const key = pick(walk, random);
        if (!press(walk.session, key, walk.rules).runs) {
          await tap(walk, key);
        }
        if (count % paceOf(seed) === 0) {
          await expectSame(walk, label());
        }
      }
      await expectSame(walk, label());
    }
  });
}
