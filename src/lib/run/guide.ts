import { isFullWidth } from '@/lib/typing/width';

interface Expected {
  readonly key: string;
  readonly kind: 'command' | 'run' | 'text';
}

interface Guide {
  at: number;
  pending: string | null;
  readonly steps: readonly Expected[];
}

interface Pressed {
  readonly composing: boolean;
  readonly key: string;
}

type Verdict = 'full-width' | 'ime' | 'right' | 'wrong';

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
  readonly inserting: boolean;
  readonly key: string;
  readonly taught: boolean;
}

interface Seen extends Slip {
  readonly expected: Expected;
  readonly upcoming: string;
}

const typePrefix = 'type:';
const named: Record<string, Expected> = {
  BS: { key: 'Backspace', kind: 'command' },
  Enter: { key: 'Enter', kind: 'command' },
  Esc: { key: 'Escape', kind: 'command' },
  run: { key: 'Enter', kind: 'run' },
};
const imeKey = 'Process';
const fromEnd = -1;

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

const createGuide = (path: readonly string[]): Guide => ({
  at: 0,
  pending: null,
  steps: expand(path),
});

const expectedNow = (guide: Guide): Expected | null => {
  const next = guide.steps[guide.at];
  if (next !== undefined) {
    return next;
  }
  const last = guide.steps.at(fromEnd);
  if (last?.kind === 'run') {
    return last;
  }
  return null;
};

const judge = (guide: Guide, pressed: Pressed): Verdict => {
  if (pressed.composing || pressed.key === imeKey) {
    return 'ime';
  }
  if (isFullWidth(pressed.key)) {
    return 'full-width';
  }
  if (expectedNow(guide)?.key === pressed.key) {
    return 'right';
  }
  return 'wrong';
};

const advance = (guide: Guide): void => {
  const expected = expectedNow(guide);
  if (expected === null) {
    return;
  }
  if (expected.kind === 'text') {
    guide.pending = expected.key;
  }
  if (guide.at < guide.steps.length) {
    guide.at += 1;
  }
};

const deleteKeys = new Set(['Backspace', 'Delete']);
const isChar = (key: string): boolean => key.length === 1;

const rules: readonly (readonly [Cause, (seen: Seen) => boolean])[] = [
  ['no-delete', (seen) => deleteKeys.has(seen.key)],
  ['case', (seen) => seen.key.toLowerCase() === seen.expected.key.toLowerCase()],
  ['early-leave', (seen) => seen.key === 'Escape' && seen.expected.kind === 'text'],
  ['early-run', (seen) => seen.key === 'Enter' && !seen.inserting],
  ['need-insert', (seen) => !seen.inserting && seen.key === seen.upcoming],
  ['taught', (seen) => !seen.inserting && isChar(seen.key) && seen.taught],
  ['untaught', (seen) => !seen.inserting && isChar(seen.key)],
  ['mistyped', (seen) => seen.inserting && isChar(seen.key)],
];

const upcomingText = (guide: Guide): string =>
  guide.steps.slice(guide.at).find((step) => step.kind === 'text')?.key ?? '';

const causeOf = (guide: Guide, slip: Slip): Cause => {
  const expected = expectedNow(guide);
  if (expected === null) {
    return 'other';
  }
  const seen: Seen = { ...slip, expected, upcoming: upcomingText(guide) };
  return rules.find(([, applies]) => applies(seen))?.[0] ?? 'other';
};

const takeText = (guide: Guide, text: string): boolean => {
  if (guide.pending !== text) {
    return false;
  }
  guide.pending = null;
  return true;
};

export {
  advance,
  causeOf,
  createGuide,
  expand,
  expectedNow,
  judge,
  takeText,
  type Cause,
  type Expected,
  type Guide,
  type Verdict,
};
