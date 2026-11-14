import { type PairItem } from './catalog';

interface Open {
  readonly closer: string;
  readonly index: number;
}

interface Scan {
  readonly found: Map<number, number>;
  readonly open: Open[];
  readonly pairs: readonly PairItem[];
  readonly text: string;
}

const includeLine = /^\s*#include\b/u;
const missing = -1;

const lineEnd = (text: string, index: number): number => {
  const end = text.indexOf('\n', index);
  if (end === missing) {
    return text.length;
  }
  return end;
};

const lineAround = (text: string, index: number): string =>
  text.slice(text.lastIndexOf('\n', index - 1) + 1, lineEnd(text, index));

const isIncludeLine = (line: string): boolean => includeLine.test(line);

const lineCloser = (scan: Scan, index: number): number | null => {
  const char = scan.text.charAt(index);
  const pair = scan.pairs.find((item) => item.where === 'include-line' && item.open === char);
  if (pair === undefined || !isIncludeLine(lineAround(scan.text, index))) {
    return null;
  }
  const closer = scan.text.indexOf(pair.close, index);
  if (closer === missing || closer > lineEnd(scan.text, index)) {
    return null;
  }
  return closer;
};

const openBracket = (scan: Scan, index: number): boolean => {
  const char = scan.text.charAt(index);
  const pair = scan.pairs.find(
    (item) => item.where === 'anywhere' && item.open === char && item.open !== item.close,
  );
  if (pair === undefined) {
    return false;
  }
  scan.open.push({ closer: pair.close, index });
  return true;
};

const closeBracket = (scan: Scan, index: number): boolean => {
  const last = scan.open.at(missing);
  if (last === undefined || scan.text.charAt(index) !== last.closer) {
    return false;
  }
  scan.open.pop();
  scan.found.set(last.index, index);
  return true;
};

const visit = (scan: Scan, index: number): void => {
  if (openBracket(scan, index) || closeBracket(scan, index)) {
    return;
  }
  const closer = lineCloser(scan, index);
  if (closer !== null) {
    scan.found.set(index, closer);
  }
};

const matchPairs = (text: string, pairs: readonly PairItem[]): Map<number, number> => {
  const scan: Scan = { found: new Map<number, number>(), open: [], pairs, text };
  for (let index = 0; index < text.length; index += 1) {
    visit(scan, index);
  }
  return scan.found;
};

const autoClosed = (text: string, position: number, pairs: readonly PairItem[]): Set<number> => {
  const closed = new Set<number>();
  for (const [opener, closer] of matchPairs(text, pairs)) {
    if (opener < position && closer >= position) {
      closed.add(closer);
    }
  }
  return closed;
};

export { autoClosed, isIncludeLine, matchPairs };
