import { type PairItem } from '@/lib/complete/catalog';

type Mode = 'insert' | 'normal';

interface Buffer {
  readonly auto: number;
  readonly change: readonly string[];
  readonly cursor: number;
  readonly fresh: boolean;
  readonly mode: Mode;
  readonly pending: string;
  readonly text: string;
  readonly typing: readonly string[];
  readonly want: number;
}

interface Rules {
  readonly keys: ReadonlySet<string>;
  readonly pairs: readonly PairItem[];
}

interface Edit {
  readonly from: number;
  readonly insert: string;
  readonly to: number;
}

const newline = '\n';
const missing = -1;
const far = Number.MAX_SAFE_INTEGER;

const lineStart = (text: string, at: number): number => {
  if (at === 0) {
    return 0;
  }
  return text.lastIndexOf(newline, at - 1) + 1;
};

const lineEnd = (text: string, at: number): number => {
  const end = text.indexOf(newline, at);
  if (end === missing) {
    return text.length;
  }
  return end;
};

const lineAt = (text: string, at: number): string =>
  text.slice(lineStart(text, at), lineEnd(text, at));

const columnOf = (text: string, at: number): number => at - lineStart(text, at);

const lastColumn = (text: string, at: number): number =>
  Math.max(lineStart(text, at), lineEnd(text, at) - 1);

const firstNonBlank = (text: string, start: number): number => {
  let at = start;
  while (text.charAt(at) === ' ') {
    at += 1;
  }
  return Math.min(at, lastColumn(text, start));
};

const plain = /^[ -~]$/u;

const isPlain = (key: string): boolean => plain.test(key);

const splice = (text: string, { from, insert, to }: Edit): string =>
  `${text.slice(0, from)}${insert}${text.slice(to)}`;

const place = (buffer: Buffer, cursor: number): Buffer => ({
  ...buffer,
  auto: 0,
  cursor,
  fresh: false,
  want: columnOf(buffer.text, cursor),
});

const createBuffer = (text: string, cursor = 0): Buffer => ({
  auto: 0,
  change: [],
  cursor,
  fresh: false,
  mode: 'normal',
  pending: '',
  text,
  typing: [],
  want: columnOf(text, cursor),
});

export {
  columnOf,
  createBuffer,
  far,
  firstNonBlank,
  isPlain,
  lastColumn,
  lineAt,
  lineEnd,
  lineStart,
  missing,
  newline,
  place,
  splice,
  type Buffer,
  type Mode,
  type Rules,
};
