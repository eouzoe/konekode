import { expect, test } from 'bun:test';

import { previewsIn, stagesIn } from './stages';

const listing = [
  'Konekode/dev/',
  'Konekode/prod/',
  'Konekode/pr-12/',
  'Konekode/look_lantern/',
  'Konekode/pr-12/Site',
  'Other/preview/',
  '  bun:   1.4.4',
  '',
].join('\n');

test('the stages are read from the state listing of this stack only', () => {
  expect(stagesIn(listing)).toEqual(['dev', 'prod', 'pr-12', 'look_lantern']);
});

test('every stage but prod and dev is a preview to clean', () => {
  expect(previewsIn(listing)).toEqual(['pr-12', 'look_lantern']);
  expect(previewsIn('Konekode/dev/\nKonekode/prod/\n')).toEqual([]);
});
