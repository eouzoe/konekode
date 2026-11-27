import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Manifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly name: string;
}

const root = join(import.meta.dir, '../../..');
const folders = ['contracts', 'course', 'views'];
const own = '@konekode/';
const allowedOwn: Readonly<Record<string, ReadonlyArray<string>>> = {
  contracts: [],
  course: ['@konekode/contracts'],
  views: ['@konekode/contracts'],
};
const specifier = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/gu;

const manifestOf = (folder: string): Manifest =>
  JSON.parse(readFileSync(join(root, 'packages', folder, 'package.json'), 'utf8')) as Manifest;

const declared = (manifest: Manifest): Set<string> =>
  new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);

const packageName = (spec: string): string => {
  const [first = '', second = ''] = spec.split('/');
  return first.startsWith('@') ? `${first}/${second}` : first;
};

const importsOf = (folder: string): Array<{ file: string; name: string }> =>
  [...new Bun.Glob('src/**/*.ts').scanSync({ cwd: join(root, 'packages', folder) })].flatMap(
    (file) =>
      [...readFileSync(join(root, 'packages', folder, file), 'utf8').matchAll(specifier)]
        .map((match) => match[1] ?? '')
        .filter(
          (spec) => !spec.startsWith('.') && !spec.startsWith('bun:') && !spec.startsWith('node:'),
        )
        .map((spec) => ({ file, name: packageName(spec) })),
  );

for (const folder of folders) {
  test(`${folder} imports only what its package.json declares`, () => {
    const manifest = manifestOf(folder);
    const known = declared(manifest);
    const undeclared = importsOf(folder)
      .filter((found) => found.name !== manifest.name && !known.has(found.name))
      .map((found) => `${found.file}: ${found.name}`);
    expect(undeclared).toEqual([]);
  });

  test(`${folder} depends on no package of ours beyond the contracts it is allowed`, () => {
    const ours = [...declared(manifestOf(folder))].filter((name) => name.startsWith(own));
    expect(ours.toSorted()).toEqual([...(allowedOwn[folder] ?? [])]);
  });
}
