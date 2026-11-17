import { type Pressed } from '@/lib/edit/session';
import { track } from '@/lib/record/current';

import { type Outcome } from './protocol';

interface Place {
  readonly beat: string;
  readonly unit: string;
}

interface Run {
  readonly forced: boolean;
  readonly input: string;
  readonly outcome: Outcome;
  readonly place: Place;
  readonly source: string;
  readonly took: number;
}

const clipLength = 4000;

const clip = (text: string): string => text.slice(0, clipLength);

const resultOf = (outcome: Outcome): string => {
  if (outcome.kind === 'finished') {
    return outcome.output;
  }
  if (outcome.kind === 'timeout') {
    return '';
  }
  return outcome.message;
};

const exitOf = (outcome: Outcome): number => {
  if (outcome.kind === 'finished') {
    return outcome.exitCode;
  }
  return 0;
};

const operator = (forced: boolean): string => {
  if (forced) {
    return 'sprite';
  }
  return 'student';
};

const noteRun = ({ forced, input, outcome, place, source, took }: Run): void => {
  track('run.finished', {
    data: {
      by: operator(forced),
      exit: exitOf(outcome),
      input: clip(input),
      kind: outcome.kind,
      result: clip(resultOf(outcome)),
      source: clip(source),
      took: Math.round(took),
    },
    ref: place.beat,
    unit: place.unit,
  });
};

interface Attempt {
  readonly at: number;
  readonly cause: string;
  readonly expected: string;
  readonly key: string;
  readonly kind: string;
  readonly verdict: string;
}

const noteAttempt = (place: Place, attempt: Attempt): void => {
  track('step.tried', { data: { ...attempt }, ref: place.beat, unit: place.unit });
};

const noteStep = (place: Place, step: Pressed): void => {
  noteAttempt(place, {
    at: step.at,
    cause: step.cause,
    expected: step.expected?.key ?? '',
    key: step.key,
    kind: step.expected?.kind ?? '',
    verdict: step.verdict,
  });
};

const noteEntry = (place: Place, mode: string, source: string): void => {
  track('task.entered', {
    data: { mode, source: clip(source) },
    ref: place.beat,
    unit: place.unit,
  });
};

const noteRefusal = (place: Place, key: string): void => {
  track('key.refused', { data: { key }, ref: place.beat, unit: place.unit });
};

export { noteAttempt, noteEntry, noteRefusal, noteRun, noteStep, type Attempt, type Place };
