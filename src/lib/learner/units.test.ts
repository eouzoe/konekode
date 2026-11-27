import { expect, test } from 'bun:test';

import { beatsOf } from '@konekode/course/units';

import { allDomains } from './units';

test('every key a gate asks for was shown in an earlier beat', () => {
  const missing: Array<string> = [];
  for (const [unit, domain] of Object.entries(allDomains())) {
    const shown = new Set<string>();
    for (const beat of beatsOf(unit)) {
      const wanted = (domain.uses.get(beat.id) ?? []).flat();
      missing.push(
        ...wanted.filter((id) => !shown.has(id)).map((id) => `${unit}/${beat.id}: ${id}`),
      );
      for (const id of domain.shows.get(beat.id) ?? []) {
        shown.add(id);
      }
    }
  }
  expect(missing).toEqual([]);
});
