import { causeOf, type Cause, type Expected } from './path';
import { knownKeys, step } from './step';

import type { Buffer, Rules } from './buffer';

interface Session {
  readonly at: number;
  readonly buffer: Buffer;
  readonly path: ReadonlyArray<Expected>;
}

type Verdict = 'moved' | 'refused' | 'right' | 'wrong';

interface Pressed {
  readonly at: number;
  readonly cause: Cause;
  readonly expected: Expected | null;
  readonly key: string;
  readonly runs: boolean;
  readonly session: Session;
  readonly verdict: Verdict;
}

const fromEnd = -1;

const expectedNow = ({ at, path }: Session): Expected | null => {
  const last = path.at(fromEnd);
  if (at >= path.length && last?.kind === 'run') {
    return last;
  }
  return path[at] ?? null;
};

const isGuided = (session: Session): boolean => session.path.length > 0;

const upcomingText = ({ at, path }: Session): string =>
  path.slice(at).find((expected) => expected.kind === 'text')?.key ?? '';

const freeVerdict = (refused: boolean): Verdict => {
  if (refused) {
    return 'refused';
  }
  return 'moved';
};

const free = (session: Session, key: string, rules: Rules): Pressed => {
  const told = { at: 0, cause: '', expected: null, key } as const;
  if (key === 'Enter' && session.buffer.mode === 'normal') {
    return { ...told, runs: true, session, verdict: 'moved' };
  }
  const { buffer, refused } = step(session.buffer, key, rules);
  return { ...told, runs: false, session: { ...session, buffer }, verdict: freeVerdict(refused) };
};

const slipped = (session: Session, key: string, rules: Rules): Cause => {
  const expected = expectedNow(session);
  if (expected === null) {
    return 'other';
  }
  return causeOf({
    expected,
    inserting: session.buffer.mode === 'insert',
    key,
    taught: rules.keys.has(key),
    upcoming: upcomingText(session),
  });
};

const forward = (session: Session, buffer: Buffer): Session => ({
  ...session,
  at: Math.min(session.at + 1, session.path.length),
  buffer,
});

const follow = (session: Session, key: string, rules: Rules): Pressed => {
  const expected = expectedNow(session);
  const told = { at: session.at, expected, key };
  if (expected?.key !== key) {
    const cause = slipped(session, key, rules);
    return { ...told, cause, runs: false, session, verdict: 'wrong' };
  }
  const done = { ...told, cause: '', verdict: 'right' } as const;
  if (expected.kind === 'run') {
    return { ...done, runs: true, session: forward(session, session.buffer) };
  }
  const { buffer } = step(session.buffer, key, { keys: knownKeys, pairs: rules.pairs });
  return { ...done, runs: false, session: forward(session, buffer) };
};

const press = (session: Session, key: string, rules: Rules): Pressed => {
  if (isGuided(session)) {
    return follow(session, key, rules);
  }
  return free(session, key, rules);
};

export { expectedNow, isGuided, press, type Pressed, type Session, type Verdict };
