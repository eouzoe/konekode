import { expect, test } from 'bun:test';

import { blink, body, empty, palette, runsOf, size, talk } from './cat';

test('every row of every layer is as wide as the sprite and uses known colours', () => {
  for (const layer of [body, blink, talk]) {
    for (const row of layer.rows) {
      expect(row).toHaveLength(size);
      expect(row.split('').every((code) => code === empty || palette.has(code))).toBe(true);
    }
    expect(layer.top + layer.rows.length).toBeLessThanOrEqual(size);
  }
  expect(body.rows).toHaveLength(size);
});

test('the sprite is symmetrical apart from its tail', () => {
  const tailStart = 18;
  for (const row of body.rows.slice(0, tailStart)) {
    const mirrored = row.split('').toReversed().join('');
    expect(mirrored.replaceAll('W', 'Y')).toBe(row.replaceAll('W', 'Y'));
  }
});

test('a row becomes one run per stretch of the same colour', () => {
  expect(runsOf({ rows: ['..KKO.K.'], top: 3 })).toEqual([
    { column: 2, fill: '#0f0f14', line: 3, width: 2 },
    { column: 4, fill: '#565f89', line: 3, width: 1 },
    { column: 6, fill: '#0f0f14', line: 3, width: 1 },
  ]);
  expect(runsOf({ rows: ['........'], top: 0 })).toEqual([]);
});

const covered = (rows: readonly string[]): number[] => rows.map((row) => row.indexOf('O'));

test('the overlays cover exactly the rows they replace', () => {
  expect(covered(blink.rows)).toEqual(covered(body.rows.slice(blink.top, blink.top + 4)));
  expect(covered(talk.rows)).toEqual(covered(body.rows.slice(talk.top, talk.top + 2)));
});
