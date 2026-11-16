import { explain } from './explain';
import { type Outcome } from './protocol';

interface View {
  readonly state: string;
  readonly status: string;
  readonly text: string;
}

type Finished = Extract<Outcome, { kind: 'finished' }>;

const retry = '編譯器沒有準備好，再執行一次試試看。';

const failures: {
  readonly [Kind in Exclude<Outcome['kind'], 'finished'>]: (
    outcome: Extract<Outcome, { kind: Kind }>,
  ) => View;
} = {
  'compile-error': (outcome) => ({
    state: 'error',
    status: '編譯沒有過',
    text: explain(outcome.message),
  }),
  crashed: (outcome) => ({ state: 'error', status: '執行時出錯', text: outcome.message }),
  timeout: () => ({ state: 'error', status: '跑太久，已經停下來', text: '' }),
  unavailable: () => ({ state: 'error', status: '執行不了', text: retry }),
};

const describeFinished = (outcome: Finished): View => {
  if (outcome.exitCode !== 0) {
    return { state: 'error', status: '程式中途結束', text: outcome.output };
  }
  return { state: 'ok', status: '執行完成', text: outcome.output };
};

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

export { describe, type View };
