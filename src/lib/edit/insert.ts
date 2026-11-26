import { isIncludeLine } from '@/lib/complete/pairs';

import {
  columnOf,
  isPlain,
  lineAt,
  lineEnd,
  lineStart,
  newline,
  splice,
  type Buffer,
  type Rules,
} from './buffer';
import { indentSplit } from './indent';

import type { PairItem } from '@/lib/complete/catalog';

type Typed = (buffer: Buffer, rules: Rules) => Buffer | null;

const roomAfter: ReadonlySet<string> = new Set([')', ']', '}', ':', ';', '>', ' ', newline, '']);

const applies = (pair: PairItem, buffer: Buffer): boolean =>
  pair.where === 'anywhere' || isIncludeLine(lineAt(buffer.text, buffer.cursor));

const pairFor = (buffer: Buffer, key: string, rules: Rules): PairItem | null => {
  if (!roomAfter.has(buffer.text.charAt(buffer.cursor))) {
    return null;
  }
  return rules.pairs.find((pair) => pair.open === key && applies(pair, buffer)) ?? null;
};

const skips = (buffer: Buffer, key: string, rules: Rules): boolean =>
  buffer.auto > 0 &&
  buffer.text.charAt(buffer.cursor) === key &&
  rules.pairs.some((pair) => pair.close === key);

const typeChar = (buffer: Buffer, key: string, rules: Rules): Buffer => {
  const typing = [...buffer.typing, key];
  if (skips(buffer, key, rules)) {
    return { ...buffer, auto: buffer.auto - 1, cursor: buffer.cursor + 1, fresh: false, typing };
  }
  const closer = pairFor(buffer, key, rules)?.close ?? '';
  const insert = `${key}${closer}`;
  return {
    ...buffer,
    auto: buffer.auto + closer.length,
    cursor: buffer.cursor + 1,
    fresh: false,
    text: splice(buffer.text, { from: buffer.cursor, insert, to: buffer.cursor }),
    typing,
  };
};

const tidy = (buffer: Buffer): Buffer => {
  const start = lineStart(buffer.text, buffer.cursor);
  const end = lineEnd(buffer.text, buffer.cursor);
  if (!buffer.fresh || buffer.text.slice(start, end).trim() !== '') {
    return buffer;
  }
  return {
    ...buffer,
    cursor: start,
    text: splice(buffer.text, { from: start, insert: '', to: end }),
  };
};

const breakLine: Typed = (buffer) => {
  const { cursor, text } = tidy(buffer);
  const end = lineEnd(text, cursor);
  const head = text.slice(0, cursor);
  const tail = text.slice(cursor, end).trimStart();
  const indent = indentSplit(head, tail);
  return {
    ...buffer,
    auto: 0,
    cursor: head.length + 1 + indent.length,
    fresh: true,
    text: `${head}${newline}${indent}${tail}${text.slice(end)}`,
    typing: [...buffer.typing, 'Enter'],
  };
};

const isPaired = (buffer: Buffer, rules: Rules): boolean => {
  const before = buffer.text.charAt(buffer.cursor - 1);
  const after = buffer.text.charAt(buffer.cursor);
  return (
    buffer.auto > 0 && rules.pairs.some((pair) => pair.open === before && pair.close === after)
  );
};

const rubOut: Typed = (buffer, rules) => {
  const { cursor, text } = buffer;
  if (cursor === 0) {
    return null;
  }
  const paired = Number(isPaired(buffer, rules));
  return {
    ...buffer,
    auto: buffer.auto - paired,
    cursor: cursor - 1,
    text: splice(text, { from: cursor - 1, insert: '', to: cursor + paired }),
    typing: [...buffer.typing, 'Backspace'],
  };
};

const leave: Typed = (buffer) => {
  const tidied = tidy(buffer);
  const cursor = Math.max(lineStart(tidied.text, tidied.cursor), tidied.cursor - 1);
  return {
    ...tidied,
    auto: 0,
    change: [...buffer.typing, 'Escape'],
    cursor,
    fresh: false,
    mode: 'normal',
    typing: [],
    want: columnOf(tidied.text, cursor),
  };
};

const named: ReadonlyMap<string, Typed> = new Map([
  ['Backspace', rubOut],
  ['Enter', breakLine],
  ['Escape', leave],
]);

const insertKey = (buffer: Buffer, key: string, rules: Rules): Buffer | null => {
  const action = named.get(key);
  if (action !== undefined) {
    return action(buffer, rules);
  }
  if (!isPlain(key)) {
    return null;
  }
  return typeChar(buffer, key, rules);
};

export { insertKey };
