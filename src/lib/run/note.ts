import { track } from '@/lib/record/current';

import { type Step } from './guided';
import { type Outcome } from './protocol';

interface Run {
  readonly beat: string;
  readonly forced: boolean;
  readonly input: string;
  readonly outcome: Outcome;
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

const noteRun = ({ beat, forced, input, outcome, source, took }: Run): void => {
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
    ref: beat,
  });
};

const noteStep = (beat: string, step: Step): void => {
  track('step.tried', {
    data: {
      at: step.at,
      expected: step.expected?.key ?? '',
      key: step.key,
      kind: step.expected?.kind ?? '',
      verdict: step.verdict,
    },
    ref: beat,
  });
};

export { noteRun, noteStep };
