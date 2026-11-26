import { follows } from './normal';
import { knownKeys } from './step';

interface Expected {
  readonly key: string;
  readonly kind: 'command' | 'run' | 'text';
}

type Cause =
  | ''
  | 'case'
  | 'early-leave'
  | 'early-run'
  | 'mistyped'
  | 'need-insert'
  | 'no-delete'
  | 'other'
  | 'taught'
  | 'untaught';

interface Slip {
  readonly expected: Expected;
  readonly inserting: boolean;
  readonly key: string;
  readonly taught: boolean;
  readonly upcoming: string;
}

const typePrefix = 'type:';

const isCommand = (token: string): boolean => {
  const [first = '', next, ...rest] = token.split('');
  if (rest.length > 0) {
    return false;
  }
  if (next === undefined) {
    return knownKeys.has(first);
  }
  return follows.get(first)?.accepts(next, knownKeys) ?? false;
};
const named: Record<string, Expected> = {
  BS: { key: 'Backspace', kind: 'command' },
  Enter: { key: 'Enter', kind: 'command' },
  Esc: { key: 'Escape', kind: 'command' },
  run: { key: 'Enter', kind: 'run' },
};

const expandToken = (token: string): Array<Expected> => {
  if (token === 'reset') {
    return [];
  }
  const known = named[token];
  if (known !== undefined) {
    return [known];
  }
  if (token.startsWith(typePrefix)) {
    return token
      .slice(typePrefix.length)
      .split('')
      .map((key) => ({ key, kind: 'text' }));
  }
  if (!isCommand(token)) {
    throw new Error(
      `「${token}」不是認得的按鍵記號：不是 BS、Enter、Esc、run、reset、type:…，也不是一個完整的指令`,
    );
  }
  return token.split('').map((key) => ({ key, kind: 'command' }));
};

const expand = (path: ReadonlyArray<string>): Array<Expected> =>
  path.flatMap((token) => expandToken(token));

const keysOf = (path: ReadonlyArray<string>): Array<string> =>
  expand(path)
    .filter((step) => step.kind !== 'run')
    .map((step) => step.key);

const deleteKeys = new Set(['Backspace', 'Delete']);
const isChar = (key: string): boolean => key.length === 1;

const causes: ReadonlyArray<readonly [Cause, (slip: Slip) => boolean]> = [
  ['no-delete', (slip) => deleteKeys.has(slip.key)],
  ['case', (slip) => slip.key.toLowerCase() === slip.expected.key.toLowerCase()],
  ['early-leave', (slip) => slip.key === 'Escape' && slip.expected.kind === 'text'],
  ['early-run', (slip) => slip.key === 'Enter' && !slip.inserting],
  ['need-insert', (slip) => !slip.inserting && slip.key === slip.upcoming],
  ['taught', (slip) => !slip.inserting && isChar(slip.key) && slip.taught],
  ['untaught', (slip) => !slip.inserting && isChar(slip.key)],
  ['mistyped', (slip) => slip.inserting && isChar(slip.key)],
];

const causeOf = (slip: Slip): Cause => causes.find(([, applies]) => applies(slip))?.[0] ?? 'other';

export { causeOf, expand, keysOf, type Cause, type Expected, type Slip };
