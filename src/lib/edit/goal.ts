import { type Rules } from './buffer';
import { type Session } from './session';
import { knownKeys, run } from './step';

interface Insert {
  readonly column: number;
  readonly kind: 'insert';
  readonly line: number;
  readonly text: string;
}

interface Remove {
  readonly from: number;
  readonly kind: 'remove';
  readonly line: number;
  readonly to: number;
}

interface NewLine {
  readonly before: number;
  readonly kind: 'line';
  readonly text: string;
}

interface Drop {
  readonly kind: 'drop';
  readonly line: number;
}

type Hint = Drop | Insert | NewLine | Remove;

interface Gap {
  readonly inner: number;
  readonly outer: number;
  readonly text: string;
}

type Op = readonly [kind: 'add' | 'drop' | 'keep', text: string];

interface Hunk {
  readonly adds: string[];
  readonly drops: number[];
}

const newline = '\n';
const fromEnd = -1;

const finalText = ({ at, buffer, path }: Session, rules: Rules): string => {
  const keys = path
    .slice(at)
    .filter((expected) => expected.kind !== 'run')
    .map((expected) => expected.key);
  return run(buffer, keys, { keys: knownKeys, pairs: rules.pairs }).text;
};

const sharedStart = (left: string, right: string): number => {
  let at = 0;
  while (at < left.length && at < right.length && left.charAt(at) === right.charAt(at)) {
    at += 1;
  }
  return at;
};

const widen = (gaps: Gap[], gap: Gap): void => {
  const [nearest] = gaps;
  if (nearest?.inner === gap.inner) {
    gaps[0] = { inner: gap.inner, outer: gap.outer, text: gap.text + nearest.text };
    return;
  }
  gaps.unshift(gap);
};

interface Scan {
  readonly at: number;
  readonly gaps: Gap[];
}

const scan = (inner: string, outer: string, start: number): Scan => {
  const gaps: Gap[] = [];
  let at = inner.length - 1;
  for (let from = outer.length - 1; from >= start; from -= 1) {
    const text = outer.charAt(from);
    if (at >= start && inner.charAt(at) === text) {
      at -= 1;
    } else {
      widen(gaps, { inner: at + 1, outer: from, text });
    }
  }
  return { at, gaps };
};

const embed = (inner: string, outer: string): Gap[] | null => {
  const start = sharedStart(inner, outer);
  const { at, gaps } = scan(inner, outer, start);
  if (at >= start) {
    return null;
  }
  return gaps;
};

const kept = (ops: readonly Op[]): number => ops.filter(([kind]) => kind === 'keep').length;

const better = (first: Op[], second: Op[]): Op[] => {
  if (kept(second) > kept(first)) {
    return second;
  }
  return first;
};

const align = (old: readonly string[], next: readonly string[]): Op[] => {
  const [first, ...rest] = old;
  const [head, ...tail] = next;
  if (first === undefined) {
    return next.map((text) => ['add', text]);
  }
  if (head === undefined) {
    return old.map((text) => ['drop', text]);
  }
  if (first === head) {
    return [['keep', first], ...align(rest, tail)];
  }
  return better([['drop', first], ...align(rest, next)], [['add', head], ...align(old, tail)]);
};

const inline = (line: number, old: string, next: string): Hint[] | null => {
  const added = embed(old, next);
  if (added !== null) {
    return added.map((gap) => ({ column: gap.inner, kind: 'insert', line, text: gap.text }));
  }
  const removed = embed(next, old);
  if (removed === null) {
    return null;
  }
  return removed.map((gap) => ({
    from: gap.outer,
    kind: 'remove',
    line,
    to: gap.outer + gap.text.length,
  }));
};

const replaced = (line: number, after: number, text: string): Hint[] => [
  { kind: 'drop', line },
  { before: after, kind: 'line', text },
];

const settle = (old: readonly string[], hunk: Hunk, here: number): Hint[] => {
  const after = (hunk.drops.at(fromEnd) ?? here - 1) + 1;
  const hints: Hint[] = [];
  for (const [at, line] of hunk.drops.entries()) {
    const next = hunk.adds[at];
    if (next === undefined) {
      hints.push({ kind: 'drop', line });
    } else {
      hints.push(...(inline(line, old[line] ?? '', next) ?? replaced(line, after, next)));
    }
  }
  for (const text of hunk.adds.slice(hunk.drops.length)) {
    hints.push({ before: after, kind: 'line', text });
  }
  return hints;
};

interface Walk {
  readonly hints: Hint[];
  hunk: Hunk;
  line: number;
}

const walk = (state: Walk, old: readonly string[], [kind, text]: Op): void => {
  if (kind === 'add') {
    state.hunk.adds.push(text);
    return;
  }
  if (kind === 'drop') {
    state.hunk.drops.push(state.line);
  } else {
    state.hints.push(...settle(old, state.hunk, state.line));
    state.hunk = { adds: [], drops: [] };
  }
  state.line += 1;
};

const compare = (old: readonly string[], next: readonly string[]): Hint[] => {
  const state: Walk = { hints: [], hunk: { adds: [], drops: [] }, line: 0 };
  for (const op of [...align(old, next), ['keep', ''] as const]) {
    walk(state, old, op);
  }
  return state.hints;
};

const linesStill = (hints: readonly Hint[]): Hint[] => {
  const dropped = new Set<number>();
  for (const hint of hints) {
    if (hint.kind === 'drop') {
      dropped.add(hint.line);
    }
  }
  return hints.filter(
    (hint) => hint.kind === 'drop' || hint.kind === 'line' || !dropped.has(hint.line),
  );
};

const goalOf = (session: Session, rules: Rules): Hint[] => {
  if (session.path.length === 0) {
    return [];
  }
  const old = session.buffer.text.split(newline);
  const next = finalText(session, rules).split(newline);
  return linesStill(compare(old, next));
};

const rewrite = (text: string, hints: readonly Hint[]): string => {
  let column = text.length;
  let result = '';
  const inside = hints.filter((hint) => hint.kind === 'insert' || hint.kind === 'remove');
  for (const hint of inside.toReversed()) {
    if (hint.kind === 'insert') {
      result = hint.text + text.slice(hint.column, column) + result;
      ({ column } = hint);
    } else {
      result = text.slice(hint.to, column) + result;
      column = hint.from;
    }
  }
  return text.slice(0, column) + result;
};

const fulfil = (text: string, hints: readonly Hint[]): string => {
  const old = text.split(newline);
  const result: string[] = [];
  for (let line = 0; line <= old.length; line += 1) {
    const here = hints.filter((hint) => 'line' in hint && hint.line === line);
    result.push(
      ...hints.flatMap((hint) => {
        if (hint.kind === 'line' && hint.before === line) {
          return [hint.text];
        }
        return [];
      }),
    );
    const current = old[line];
    if (current !== undefined && !here.some((hint) => hint.kind === 'drop')) {
      result.push(rewrite(current, here));
    }
  }
  return result.join(newline);
};

export { finalText, fulfil, goalOf, type Hint };
