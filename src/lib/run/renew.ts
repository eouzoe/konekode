import { type EditorView } from '@codemirror/view';
import { Vim } from '@replit/codemirror-vim';

import { type Expected } from './guide';
import { press, restore, textPrefix, type Snapshot } from './puppet';

const names: Readonly<Record<string, string>> = { Backspace: 'BS', Enter: 'Enter', Escape: 'Esc' };

const tokenOf = (step: Expected): string => {
  if (step.kind === 'text') {
    return `${textPrefix}${step.key}`;
  }
  return names[step.key] ?? step.key;
};

const renew = (view: EditorView, start: Snapshot, done: readonly Expected[]): void => {
  Vim.resetVimGlobalState_();
  restore(view, start);
  for (const step of done) {
    press(view, tokenOf(step));
  }
};

export { renew, tokenOf };
