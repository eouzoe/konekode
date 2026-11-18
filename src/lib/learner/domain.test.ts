import { expect, test } from 'bun:test';

import { allDomains } from '@/units/index';

import { components } from './domain';

const { start } = allDomains();

test('every command key in the catalogue is a component', () => {
  expect(components).toContain('key.G');
  expect(components).toContain('key..');
  expect(components.every((id) => id.startsWith('key.'))).toBe(true);
});

test('a step uses the command key it presses and typed text uses nothing', () => {
  const steps = start?.uses.get('run-cout') ?? [];
  expect(steps.slice(0, 3)).toEqual([['key.G'], ['key.O'], []]);
  expect(steps.at(-1)).toEqual([]);
  expect(steps.flat()).toEqual(['key.G', 'key.O']);
});

test('a two-key command uses both keys and its argument uses nothing', () => {
  expect(start?.uses.get('run-int')?.slice(0, 3)).toEqual([['key.d'], ['key.j'], ['key.O']]);
  expect(start?.uses.get('run-cin')?.slice(0, 4)).toEqual([['key.k'], ['key.0'], ['key.f'], []]);
});

test('a beat shows the keys it is labelled with and the keys the sprite presses', () => {
  expect(start?.shows.get('press-i')).toEqual(['key.i']);
  expect(start?.shows.get('go-end')).toEqual(['key.G']);
  expect(start?.shows.get('go-up')).toEqual(['key.k']);
  expect(start?.shows.get('repeat')).toEqual(['key..', 'key.$']);
  expect(start?.shows.get('intro')).toEqual([]);
});

test('the gate without a path uses nothing', () => {
  expect(start?.uses.get('task')).toEqual([]);
});

test('a typing drill uses the key that opens insert mode, as its first step', () => {
  expect(start?.uses.get('type-template')).toEqual([['key.i']]);
});
