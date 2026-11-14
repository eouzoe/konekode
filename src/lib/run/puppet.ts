import { deleteCharBackward, insertNewlineAndIndent } from '@codemirror/commands';
import { type EditorView } from '@codemirror/view';
import { Vim, getCM } from '@replit/codemirror-vim';

interface Snapshot {
  readonly cursor: number;
  readonly text: string;
}

const findPrefix = 'find:';
const charPrefix = 'char:';
const vimKeys = new Map<string, readonly string[]>([
  ['A', ['A']],
  ['Esc', ['<Esc>']],
  ['dd', ['d', 'd']],
  ['i', ['i']],
  ['j', ['j']],
  ['k', ['k']],
  ['o', ['o']],
]);

const pressVim = (view: EditorView, keys: readonly string[]): void => {
  const adapter = getCM(view);
  if (adapter === null) {
    return;
  }
  for (const key of keys) {
    Vim.handleKey(adapter, key, 'user');
  }
};

const findLine = (view: EditorView, text: string): void => {
  const { doc } = view.state;
  for (let number = 1; number <= doc.lines; number += 1) {
    const line = doc.line(number);
    if (line.text.includes(text)) {
      view.dispatch({ selection: { anchor: line.from } });
      return;
    }
  }
};

const pressKey = (view: EditorView, token: string): void => {
  if (token === 'Enter') {
    insertNewlineAndIndent(view);
    return;
  }
  if (token === 'BS') {
    deleteCharBackward(view);
    return;
  }
  pressVim(view, vimKeys.get(token) ?? []);
};

const press = (view: EditorView, token: string): void => {
  if (token.startsWith(findPrefix)) {
    findLine(view, token.slice(findPrefix.length));
    return;
  }
  if (token.startsWith(charPrefix)) {
    view.dispatch(view.state.replaceSelection(token.slice(charPrefix.length)));
    return;
  }
  pressKey(view, token);
};

const snapshot = (view: EditorView): Snapshot => ({
  cursor: view.state.selection.main.head,
  text: view.state.doc.toString(),
});

const restore = (view: EditorView, saved: Snapshot): void => {
  pressVim(view, ['<Esc>']);
  view.dispatch({
    changes: { from: 0, insert: saved.text, to: view.state.doc.length },
    selection: { anchor: Math.min(saved.cursor, saved.text.length) },
  });
};

export { charPrefix, findPrefix, press, restore, snapshot, type Snapshot };
