import {
  far,
  firstNonBlank,
  isPlain,
  lastColumn,
  lineEnd,
  lineStart,
  missing,
  newline,
  place,
  splice,
  type Buffer,
  type Rules,
} from './buffer';
import { indentBelow } from './indent';

type Command = (buffer: Buffer) => Buffer | null;

const settle = (buffer: Buffer, start: number): Buffer => ({
  ...buffer,
  auto: 0,
  cursor: Math.min(start + buffer.want, lastColumn(buffer.text, start)),
});

const up: Command = (buffer) => {
  const start = lineStart(buffer.text, buffer.cursor);
  if (start === 0) {
    return null;
  }
  return settle(buffer, lineStart(buffer.text, start - 1));
};

const down: Command = (buffer) => {
  const end = lineEnd(buffer.text, buffer.cursor);
  if (end === buffer.text.length) {
    return null;
  }
  return settle(buffer, end + 1);
};

const toStart: Command = (buffer) => place(buffer, lineStart(buffer.text, buffer.cursor));

const toEnd: Command = (buffer) => ({
  ...place(buffer, lastColumn(buffer.text, buffer.cursor)),
  want: far,
});

const toLast: Command = (buffer) =>
  place(buffer, firstNonBlank(buffer.text, lineStart(buffer.text, buffer.text.length)));

const erase: Command = (buffer) => {
  const { cursor, text } = buffer;
  if (lineStart(text, cursor) === lineEnd(text, cursor)) {
    return null;
  }
  const next = splice(text, { from: cursor, insert: '', to: cursor + 1 });
  const changed: Buffer = { ...buffer, change: ['x'], text: next };
  const last = lastColumn(next, lineStart(text, cursor));
  return place(changed, Math.min(cursor, last));
};

const startInsert: Command = (buffer) => ({
  ...buffer,
  auto: 0,
  fresh: false,
  mode: 'insert',
  typing: ['i'],
});

const openBelow: Command = (buffer) => {
  const end = lineEnd(buffer.text, buffer.cursor);
  const indent = indentBelow(buffer.text, buffer.cursor);
  return {
    ...buffer,
    auto: 0,
    cursor: end + 1 + indent.length,
    fresh: true,
    mode: 'insert',
    text: splice(buffer.text, { from: end, insert: `${newline}${indent}`, to: end }),
    typing: ['o'],
  };
};

const indentAbove = (text: string, start: number): string => {
  if (start === 0) {
    return '';
  }
  return indentBelow(text, start - 1);
};

const openAbove: Command = (buffer) => {
  const start = lineStart(buffer.text, buffer.cursor);
  const indent = indentAbove(buffer.text, start);
  return {
    ...buffer,
    auto: 0,
    cursor: start + indent.length,
    fresh: true,
    mode: 'insert',
    text: splice(buffer.text, { from: start, insert: `${indent}${newline}`, to: start }),
    typing: ['O'],
  };
};

const dropFrom = (text: string, start: number, lastEnd: number): string => {
  if (lastEnd === text.length) {
    return text.slice(0, Math.max(start - 1, 0));
  }
  return splice(text, { from: start, insert: '', to: lastEnd + 1 });
};

const dropTwoLines: Command = (buffer) => {
  const { cursor, text } = buffer;
  const end = lineEnd(text, cursor);
  if (end === text.length) {
    return null;
  }
  const start = lineStart(text, cursor);
  const next = dropFrom(text, start, lineEnd(text, end + 1));
  const landed = lineStart(next, Math.min(start, next.length));
  return place({ ...buffer, change: ['d', 'j'], text: next }, firstNonBlank(next, landed));
};

const findChar = (buffer: Buffer, char: string): Buffer | null => {
  const at = buffer.text.indexOf(char, buffer.cursor + 1);
  if (at === missing || at >= lineEnd(buffer.text, buffer.cursor)) {
    return null;
  }
  return place(buffer, at);
};

const commands: ReadonlyMap<string, Command> = new Map([
  ['$', toEnd],
  ['0', toStart],
  ['G', toLast],
  ['O', openAbove],
  ['i', startInsert],
  ['j', down],
  ['k', up],
  ['o', openBelow],
  ['x', erase],
]);

interface Follow {
  readonly accepts: (key: string, keys: Rules['keys']) => boolean;
  readonly apply: (buffer: Buffer, key: string) => Buffer | null;
}

const follows: ReadonlyMap<string, Follow> = new Map<string, Follow>([
  ['d', { accepts: (key, keys) => key === 'j' && keys.has(key), apply: dropTwoLines }],
  ['f', { accepts: (key) => isPlain(key), apply: findChar }],
]);

const prefixes: ReadonlySet<string> = new Set(follows.keys());

export { commands, follows, prefixes, type Command, type Follow };
