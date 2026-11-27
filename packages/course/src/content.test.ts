import { expect, test } from 'bun:test';

import { contentId, contentIdOf, contentText, unhashed } from './content';
import { unitContent } from './units';

test('the same content always gets the same short identifier', async () => {
  const once = await contentIdOf(contentText());
  const copied = structuredClone(unitContent());
  expect(await contentIdOf(contentText(copied))).toBe(once);
  expect(await contentId()).toBe(once);
  expect(once).toMatch(/^[0-9a-f]{16}$/u);
});

test('a page without the hashing API, which only secure pages have, still labels its events', async () => {
  expect(await contentIdOf(contentText(), null)).toBe(unhashed);
});

test('changing one character of the content changes the identifier', async () => {
  const text = contentText();
  const at = text.indexOf('"say":"') + '"say":"'.length;
  const changed = `${text.slice(0, at)}X${text.slice(at)}`;
  expect(changed).not.toBe(text);
  expect(await contentIdOf(changed)).not.toBe(await contentIdOf(text));
});
