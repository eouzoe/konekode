import { expectedChar, insertKey, isDone, isTyped, type Drill, type Feedback } from './drill';
import { escapeKey } from './keyboard';

import type { Attempt } from '@/lib/run/note';

const causes: Readonly<Record<Feedback, string>> = {
  'need-insert': 'need-insert',
  'no-delete': 'no-delete',
  none: 'other',
  'wrong-key': 'mistyped',
};

const verdicts: Readonly<Record<Feedback, string>> = {
  'need-insert': 'wrong',
  'no-delete': 'wrong',
  none: 'wrong',
  'wrong-key': 'wrong',
};

const stepAt = (drill: Drill): number => {
  if (isTyped(drill)) {
    return drill.target.length + 1;
  }
  if (drill.mode === 'normal') {
    return 0;
  }
  return drill.position + 1;
};

const expectedOf = (drill: Drill): string => {
  if (isTyped(drill)) {
    return escapeKey;
  }
  if (drill.mode === 'normal') {
    return insertKey;
  }
  return expectedChar(drill);
};

const kindOf = (drill: Drill): string => {
  if (drill.mode === 'insert' && !isTyped(drill)) {
    return 'text';
  }
  return 'command';
};

const leftEarly = (before: Drill, after: Drill): boolean =>
  before.mode === 'insert' && after.mode === 'normal' && !isTyped(before);

const moved = (before: Drill, after: Drill): boolean =>
  stepAt(after) !== stepAt(before) || (isTyped(before) && isDone(after));

const judged = (before: Drill, after: Drill): Pick<Attempt, 'cause' | 'verdict'> => {
  if (leftEarly(before, after)) {
    return { cause: 'early-leave', verdict: 'wrong' };
  }
  if (moved(before, after)) {
    return { cause: '', verdict: 'right' };
  }
  return { cause: causes[after.feedback], verdict: verdicts[after.feedback] };
};

const attemptOf = (before: Drill, after: Drill, key: string): Attempt | null => {
  if (after === before || isDone(before)) {
    return null;
  }
  return {
    at: stepAt(before),
    expected: expectedOf(before),
    key,
    kind: kindOf(before),
    ...judged(before, after),
  };
};

export { attemptOf };
