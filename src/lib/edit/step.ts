import { isPlain, type Buffer, type Rules } from './buffer';
import { insertKey } from './insert';
import { commands, dropTwoLines, findChar, prefixes } from './normal';

interface Result {
  readonly buffer: Buffer;
  readonly refused: boolean;
}

const continued = (buffer: Buffer, key: string, rules: Rules): Buffer | null => {
  const ready: Buffer = { ...buffer, pending: '' };
  if (key === 'Escape') {
    return ready;
  }
  if (buffer.pending === 'd' && key === 'j' && rules.keys.has(key)) {
    return dropTwoLines(ready);
  }
  if (buffer.pending === 'f' && isPlain(key)) {
    return findChar(ready, key);
  }
  return null;
};

const normalKey = (buffer: Buffer, key: string, rules: Rules): Buffer | null => {
  if (buffer.pending !== '') {
    return continued(buffer, key, rules);
  }
  if (key === 'Escape') {
    return buffer;
  }
  if (!rules.keys.has(key)) {
    return null;
  }
  if (prefixes.has(key)) {
    return { ...buffer, pending: key };
  }
  return commands.get(key)?.(buffer) ?? null;
};

const basic = (buffer: Buffer, key: string, rules: Rules): Buffer | null => {
  if (buffer.mode === 'insert') {
    return insertKey(buffer, key, rules);
  }
  return normalKey(buffer, key, rules);
};

const cleared = (buffer: Buffer): Buffer => {
  if (buffer.pending === '') {
    return buffer;
  }
  return { ...buffer, pending: '' };
};

const repeat = (buffer: Buffer, rules: Rules): Buffer | null => {
  if (buffer.change.length === 0) {
    return null;
  }
  let now = buffer;
  for (const key of buffer.change) {
    now = basic(now, key, rules) ?? cleared(now);
  }
  return now;
};

const repeats = (buffer: Buffer, key: string, rules: Rules): boolean =>
  key === '.' && buffer.mode === 'normal' && buffer.pending === '' && rules.keys.has(key);

const advance = (buffer: Buffer, key: string, rules: Rules): Buffer | null => {
  if (repeats(buffer, key, rules)) {
    return repeat(buffer, rules);
  }
  return basic(buffer, key, rules);
};

const step = (buffer: Buffer, key: string, rules: Rules): Result => {
  const next = advance(buffer, key, rules);
  if (next === null) {
    return { buffer: cleared(buffer), refused: true };
  }
  return { buffer: next, refused: false };
};

const run = (buffer: Buffer, keys: readonly string[], rules: Rules): Buffer => {
  let now = buffer;
  for (const key of keys) {
    now = step(now, key, rules).buffer;
  }
  return now;
};

export { run, step, type Result };
