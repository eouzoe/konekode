import { deleteCharBackward, insertNewlineAndIndent } from '@codemirror/commands';
import { type EditorView } from '@codemirror/view';
import { Vim, getCM } from '@replit/codemirror-vim';

import { typeChar } from './pairs';

interface Snapshot {
  readonly cursor: number;
  readonly text: string;
}

const textPrefix = 'text:';
const escapeKey = '<Esc>';
const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' });

const pressVim = (view: EditorView, keys: readonly string[]): void => {
  const adapter = getCM(view);
  if (adapter === null) {
    return;
  }
  for (const key of keys) {
    Vim.handleKey(adapter, key, 'user');
  }
};

const typeText = (view: EditorView, text: string): void => {
  for (const part of segmenter.segment(text)) {
    typeChar(view, part.segment);
  }
};

const pressNamed = (view: EditorView, token: string): boolean => {
  if (token === 'Esc') {
    pressVim(view, [escapeKey]);
    return true;
  }
  if (token === 'Enter') {
    insertNewlineAndIndent(view);
    return true;
  }
  if (token === 'BS') {
    deleteCharBackward(view);
    return true;
  }
  return false;
};

const press = (view: EditorView, token: string): void => {
  if (token.startsWith(textPrefix)) {
    typeText(view, token.slice(textPrefix.length));
    return;
  }
  if (!pressNamed(view, token)) {
    pressVim(view, token.split(''));
  }
};

const snapshot = (view: EditorView): Snapshot => ({
  cursor: view.state.selection.main.head,
  text: view.state.doc.toString(),
});

const restore = (view: EditorView, saved: Snapshot): void => {
  pressVim(view, [escapeKey]);
  view.dispatch({
    changes: { from: 0, insert: saved.text, to: view.state.doc.length },
    selection: { anchor: Math.min(saved.cursor, saved.text.length) },
  });
};

export { press, restore, snapshot, textPrefix, type Snapshot };
