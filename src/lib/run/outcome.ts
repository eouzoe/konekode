import { explain } from './explain';
import { type Outcome } from './protocol';

interface View {
  readonly state: string;
  readonly status: string;
  readonly text: string;
}

const describe = (outcome: Outcome): View => {
  if (outcome.kind === 'compile-error') {
    return { state: 'error', status: '編譯沒有過', text: explain(outcome.message) };
  }
  if (outcome.kind === 'timeout') {
    return { state: 'error', status: '跑太久，已經停下來', text: '' };
  }
  if (outcome.kind === 'crashed') {
    return { state: 'error', status: '執行時出錯', text: outcome.message };
  }
  if (outcome.exitCode !== 0) {
    return { state: 'error', status: '程式中途結束', text: outcome.output };
  }
  return { state: 'ok', status: '執行完成', text: outcome.output };
};

export { describe, type View };
