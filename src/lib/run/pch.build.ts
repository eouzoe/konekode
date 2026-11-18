import { commands } from '@yowasp/clang';

import packageInfo from '../../../node_modules/@yowasp/clang/package.json' with { type: 'json' };
import { baseFlags, headerPath, pchName } from './flags';
import { umbrella } from './umbrella';

const folder = new URL('../../../public/compiler/', import.meta.url);
const target = new URL(pchName, folder);
const stamp = new URL('std.json', folder);

const digest = new Bun.CryptoHasher('sha256')
  .update(JSON.stringify([packageInfo.version, baseFlags, headerPath, umbrella]))
  .digest('hex');

const current = async (): Promise<boolean> => {
  if (!(await Bun.file(target).exists()) || !(await Bun.file(stamp).exists())) {
    return false;
  }
  const known: unknown = await Bun.file(stamp).json();
  return (
    typeof known === 'object' && known !== null && 'digest' in known && known.digest === digest
  );
};

const make = async (): Promise<Uint8Array> => {
  const made = await commands['clang++'](
    [...baseFlags, '-x', 'c++-header', headerPath, '-o', pchName],
    { include: { bits: { 'stdc++.h': umbrella } } },
    { stderr: null, stdout: null },
  );
  const header = made?.[pchName];
  if (!(header instanceof Uint8Array)) {
    throw new TypeError('the compiler gave no precompiled header');
  }
  return header;
};

if (!(await current())) {
  await Bun.write(target, await make());
  await Bun.write(stamp, JSON.stringify({ digest }));
}
