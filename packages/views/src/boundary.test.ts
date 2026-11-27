import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const specifier = /(?:from|import)\s*\(?\s*['"](?<spec>[^'"]+)['"]/gu;
const contracts = '@konekode/contracts';

const forbidden = (spec: string): boolean =>
  spec.startsWith('@/') ||
  (spec.startsWith('@konekode/') && spec !== contracts && !spec.startsWith(`${contracts}/`));

const reaching = (): Array<string> =>
  [...new Bun.Glob('**/*.ts').scanSync({ cwd: import.meta.dir })].flatMap((file) =>
    [...readFileSync(join(import.meta.dir, file), 'utf8').matchAll(specifier)]
      .map((match) => match.groups?.spec ?? '')
      .filter(forbidden)
      .map((spec) => `${file}: ${spec}`),
  );

test('the views reach none of the site logic and none of our packages but the contracts', () => {
  expect(reaching()).toEqual([]);
});
