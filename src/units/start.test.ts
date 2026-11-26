import { expect, test } from 'bun:test';

import { catalog } from '../lib/complete/catalog';
import { beats } from './start';

const typed = 'type:';
const silent = new Set(['BS', 'Enter', 'Esc', 'reset', 'run']);
const known = new Set(catalog.map((item) => item.id));

test('every unlock names an item in the catalogue', () => {
  const unknown = beats.flatMap((beat) => (beat.unlock ?? []).filter((id) => !known.has(id)));
  expect(unknown).toEqual([]);
});

test('every command the sprite demonstrates is unlocked by that beat', () => {
  const unlocked = new Set<string>();
  const missing: Array<string> = [];
  for (const beat of beats) {
    for (const id of beat.unlock ?? []) {
      unlocked.add(id);
    }
    for (const token of beat.keys ?? []) {
      const isCommand = !silent.has(token) && !token.startsWith(typed);
      if (isCommand && !unlocked.has(`key.${token.charAt(0)}`)) {
        missing.push(`${beat.id}: ${token}`);
      }
    }
  }
  expect(missing).toEqual([]);
});
