import { lineAt, lineStart } from './buffer';

const indentUnit = '    ';
const closers = [';', '{', '}', ':'];

const leading = (line: string): string => line.slice(0, line.length - line.trimStart().length);

const nearestAbove = (text: string, from: number): number | null => {
  let start = from;
  while (lineAt(text, start).trim() === '') {
    if (start === 0) {
      return null;
    }
    start = lineStart(text, start - 1);
  }
  return start;
};

const previous = (text: string, start: number): number | null => {
  if (start === 0) {
    return null;
  }
  return nearestAbove(text, lineStart(text, start - 1));
};

const isOpen = (line: string): boolean => {
  const trimmed = line.trim();
  const closed = closers.some((closer) => trimmed.endsWith(closer));
  return trimmed !== '' && !trimmed.startsWith('#') && !closed;
};

const statementStart = (text: string, start: number): number => {
  let now = start;
  let above = previous(text, now);
  while (above !== null && isOpen(lineAt(text, above))) {
    now = above;
    above = previous(text, now);
  }
  return now;
};

const count = (text: string, char: string): number => text.split(char).length - 1;

const isInside = (text: string, end: number): boolean => {
  const before = text.slice(0, end);
  return count(before, '{') > count(before, '}');
};

const continues = (text: string, anchor: number): boolean => {
  const line = lineAt(text, anchor);
  if (!isOpen(line) || statementStart(text, anchor) !== anchor) {
    return false;
  }
  return isInside(text, anchor) || line.trimEnd().endsWith(')');
};

const deepens = (text: string, anchor: number): boolean =>
  lineAt(text, anchor).trimEnd().endsWith('{') || continues(text, anchor);

const baseOf = (text: string, anchor: number): string => {
  const line = lineAt(text, anchor);
  if (isOpen(line)) {
    return leading(line);
  }
  return leading(lineAt(text, statementStart(text, anchor)));
};

const indentBelow = (text: string, at: number): string => {
  const anchor = nearestAbove(text, lineStart(text, at));
  if (anchor === null) {
    return '';
  }
  const base = baseOf(text, anchor);
  if (deepens(text, anchor)) {
    return `${base}${indentUnit}`;
  }
  return base;
};

const opensParen = (line: string): boolean => count(line, '(') > count(line, ')');

const matchingBrace = (text: string): number | null => {
  let depth = 0;
  for (let at = text.length - 1; at >= 0; at -= 1) {
    const char = text.charAt(at);
    if (char === '{' && depth === 0) {
      return at;
    }
    depth += Number(char === '}') - Number(char === '{');
  }
  return null;
};

const closing = (head: string): string => {
  const brace = matchingBrace(head);
  if (brace === null) {
    return '';
  }
  const opener = statementStart(head, lineStart(head, brace));
  return leading(lineAt(head, opener));
};

const byTail = (head: string, tail: string, anchor: number): string => {
  if (tail.startsWith('}')) {
    return closing(head);
  }
  if (tail.startsWith('{')) {
    return baseOf(head, anchor);
  }
  return indentBelow(head, head.length);
};

const indentSplit = (head: string, tail: string): string => {
  const anchor = nearestAbove(head, lineStart(head, head.length));
  if (anchor === null) {
    return '';
  }
  const line = lineAt(head, anchor);
  if (opensParen(line)) {
    return `${leading(line)}${indentUnit}${indentUnit}`;
  }
  return byTail(head, tail, anchor);
};

export { indentBelow, indentSplit };
