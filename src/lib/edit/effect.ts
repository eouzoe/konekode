import type { Buffer } from './buffer';

interface Effect {
  readonly count: number;
  readonly keys: number;
  readonly kind: 'columns' | 'dropped' | 'lines' | 'repeat';
}

const newline = '\n';
const worthTelling = 2;

const linesIn = (text: string): number => text.split(newline).length;

const lineOf = ({ cursor, text }: Buffer): number => linesIn(text.slice(0, cursor));

const columnOf = ({ cursor, text }: Buffer): number =>
  cursor - (text.lastIndexOf(newline, cursor - 1) + 1);

const moved = (before: Buffer, after: Buffer, keys: number): Effect | null => {
  const lines = Math.abs(lineOf(after) - lineOf(before));
  const columns = Math.abs(columnOf(after) - columnOf(before));
  if (lines >= worthTelling) {
    return { count: lines, keys, kind: 'lines' };
  }
  if (lines === 0 && columns >= worthTelling) {
    return { count: columns, keys, kind: 'columns' };
  }
  return null;
};

const changed = (before: Buffer, after: Buffer, key: string): Effect | null => {
  const keys = before.pending.length + 1;
  if (key === '.' && before.pending === '') {
    return { count: before.change.length, keys, kind: 'repeat' };
  }
  const dropped = linesIn(before.text) - linesIn(after.text);
  if (dropped > 0) {
    return { count: dropped, keys, kind: 'dropped' };
  }
  return null;
};

const effectOf = (before: Buffer, after: Buffer, key: string): Effect | null => {
  if (before.mode !== 'normal' || after.mode !== 'normal') {
    return null;
  }
  if (before.text === after.text) {
    return moved(before, after, before.pending.length + 1);
  }
  return changed(before, after, key);
};

export { effectOf, type Effect };
