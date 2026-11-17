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
const named: Record<string, Expected> = {
  BS: { key: 'Backspace', kind: 'command' },
  Enter: { key: 'Enter', kind: 'command' },
  Esc: { key: 'Escape', kind: 'command' },
  run: { key: 'Enter', kind: 'run' },
};

const expandToken = (token: string): Expected[] => {
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
  return token.split('').map((key) => ({ key, kind: 'command' }));
};

const expand = (path: readonly string[]): Expected[] => path.flatMap((token) => expandToken(token));

const keysOf = (path: readonly string[]): string[] =>
  expand(path)
    .filter((step) => step.kind !== 'run')
    .map((step) => step.key);

const deleteKeys = new Set(['Backspace', 'Delete']);
const isChar = (key: string): boolean => key.length === 1;

const causes: readonly (readonly [Cause, (slip: Slip) => boolean])[] = [
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
