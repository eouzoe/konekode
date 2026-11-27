import { expect, test } from 'bun:test';

import { catalog } from '@konekode/contracts/catalog';

import { createEngine } from './engine';

const everything = new Set(catalog.map((item) => item.id));

test('no command key is available before anything is unlocked', () => {
  const engine = createEngine(catalog, () => new Set());
  expect([...engine.keys()]).toEqual([]);
});

test('only unlocked command keys are available', () => {
  const engine = createEngine(catalog, () => new Set(['key.G', 'key.O', 'pair.brace']));
  expect([...engine.keys()].toSorted()).toEqual(['G', 'O']);
});

test('command keys are never treated as bracket pairs', () => {
  const engine = createEngine(catalog, () => everything);
  expect(
    engine
      .pairs()
      .map((pair) => pair.id)
      .toSorted(),
  ).toEqual(['pair.brace', 'pair.include-angle', 'pair.paren']);
  expect(engine.brackets().toSorted()).toEqual(['(', '{']);
});
