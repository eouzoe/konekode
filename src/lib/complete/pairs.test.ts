import { expect, test } from 'bun:test';

import { catalog } from './catalog';
import { createEngine } from './engine';
import { autoClosed, matchPairs } from './pairs';

const sample = [
  '#include <bits/stdc++.h>',
  'int main()',
  '{',
  '    cout << 7;',
  '    f(g(1));',
  '}',
].join('\n');

const all = createEngine(catalog, () => new Set(catalog.map((item) => item.id))).pairs();

test('括號、大括號、標頭檔的角括號會配成對', () => {
  const pairs = matchPairs(sample, all);
  expect(pairs.get(sample.indexOf('<'))).toBe(sample.indexOf('>'));
  expect(pairs.get(sample.indexOf('('))).toBe(sample.indexOf(')'));
  expect(pairs.get(sample.indexOf('{'))).toBe(sample.lastIndexOf('}'));
});

test('cout 的 << 不會被當成成對符號', () => {
  const pairs = matchPairs(sample, all);
  expect(pairs.has(sample.indexOf('<< 7'))).toBe(false);
  expect(pairs.has(sample.indexOf('<< 7') + 1)).toBe(false);
});

test('巢狀的括號各自配對', () => {
  const pairs = matchPairs(sample, all);
  const outer = sample.indexOf('f(') + 1;
  const inner = sample.indexOf('g(') + 1;
  expect(pairs.get(inner)).toBe(sample.indexOf('1)') + 1);
  expect(pairs.get(outer)).toBe(sample.indexOf('));') + 1);
});

test('打完左邊的符號後，右邊的那個算是已經補上', () => {
  const afterAngle = sample.indexOf('<') + 1;
  expect([...autoClosed(sample, afterAngle, all)]).toEqual([sample.indexOf('>')]);
  expect([...autoClosed(sample, sample.indexOf('<'), all)]).toEqual([]);
  const afterBrace = sample.indexOf('{') + 1;
  expect([...autoClosed(sample, afterBrace, all)]).toEqual([sample.lastIndexOf('}')]);
  expect([...autoClosed(sample, sample.length, all)]).toEqual([]);
});

test('還沒解鎖的項目不會補', () => {
  const none = createEngine(catalog, () => new Set<string>());
  expect(none.pairs()).toEqual([]);
  expect(none.brackets()).toEqual([]);
  expect(matchPairs(sample, none.pairs()).size).toBe(0);
});

test('只解鎖小括號時，只有小括號會補', () => {
  const some = createEngine(catalog, () => new Set(['pair.paren']));
  expect(some.brackets()).toEqual(['(']);
  expect(some.linePair('<')).toBeNull();
  const pairs = matchPairs(sample, some.pairs());
  expect(pairs.has(sample.indexOf('('))).toBe(true);
  expect(pairs.has(sample.indexOf('{'))).toBe(false);
  expect(pairs.has(sample.indexOf('<'))).toBe(false);
});

test('標頭檔的角括號解鎖後，引擎才認得它', () => {
  const some = createEngine(catalog, () => new Set(['pair.include-angle']));
  expect(some.linePair('<')?.close).toBe('>');
  expect(some.brackets()).toEqual([]);
});
