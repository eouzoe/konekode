import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { homeAssets } from './home-assets';
import { refsRoute } from './scene/refs';

const shipped = join(import.meta.dir, '../../../public', refsRoute);

const walk = (folder: string): Array<string> =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(folder, entry.name)) : [join(folder, entry.name)],
  );

const styleAssets = (): Array<string> =>
  [...readFileSync(join(import.meta.dir, 'home.css'), 'utf8').matchAll(/url\('([^']+)'\)/gu)]
    .map((match) => match[1] ?? '')
    .filter((href) => href.startsWith(`${refsRoute}/`))
    .map((href) => href.slice(refsRoute.length + 1));

describe('the home page ships every picture, font and sound it uses', () => {
  const files = walk(shipped).map((path) => relative(shipped, path));
  const wanted = [...homeAssets, ...styleAssets()];

  test('everything the home page asks for is in the build', () => {
    expect(wanted.filter((path) => !files.includes(path))).toEqual([]);
  });

  test('nothing is shipped that the home page does not ask for', () => {
    expect(files.filter((path) => !wanted.includes(path))).toEqual([]);
  });
});
