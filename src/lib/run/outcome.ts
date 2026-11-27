import { say, ui } from '@konekode/course/ui';

import { explain } from './explain';

import type { Outcome } from './protocol';

interface View {
  readonly state: string;
  readonly status: string;
  readonly text: string;
}

type Finished = Extract<Outcome, { kind: 'finished' }>;

const retry = ui['run.retry'];

const failures: {
  readonly [Kind in Exclude<Outcome['kind'], 'finished'>]: (
    outcome: Extract<Outcome, { kind: Kind }>,
  ) => View;
} = {
  'compile-error': (outcome) => ({
    state: 'error',
    status: ui['run.compileError'],
    text: explain(outcome.message),
  }),
  crashed: (outcome) => ({ state: 'error', status: ui['run.crashed'], text: outcome.message }),
  timeout: () => ({ state: 'error', status: ui['run.timeout'], text: '' }),
  unavailable: () => ({ state: 'error', status: ui['run.unavailable'], text: retry }),
};

const describeFinished = (outcome: Finished): View => {
  if (outcome.exitCode !== 0) {
    return { state: 'error', status: ui['run.stopped'], text: outcome.output };
  }
  return { state: 'ok', status: ui['run.finished'], text: outcome.output };
};

const complete = 100;

const busyStatus = (percent: number): string => {
  if (percent < complete) {
    return say('run.loading', { percent: String(percent) });
  }
  return ui['run.running'];
};

const failed = (error: unknown): View => ({
  state: 'error',
  status: ui['run.unavailable'],
  text: String(error),
});

const describe = (outcome: Outcome): View => {
  if (outcome.kind === 'finished') {
    return describeFinished(outcome);
  }
  if (outcome.kind === 'compile-error') {
    return failures['compile-error'](outcome);
  }
  if (outcome.kind === 'crashed') {
    return failures.crashed(outcome);
  }
  if (outcome.kind === 'timeout') {
    return failures.timeout(outcome);
  }
  return failures.unavailable(outcome);
};

export { busyStatus, describe, failed, type View };
