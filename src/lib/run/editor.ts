import { indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { indentUnit } from '@codemirror/language';
import { EditorState, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { Vim, getCM, vim } from '@replit/codemirror-vim';
import { basicSetup } from 'codemirror';

interface Editor {
  readonly getText: () => string;
}

interface Options {
  readonly onChange: (text: string) => void;
  readonly onRun: () => void;
  readonly parent: HTMLElement;
  readonly text: string;
}

const tabWidth = 4;
const runEvent = 'editor:run';
const stepEvent = 'scene:step';
const forward = 1;
const backward = -forward;

const look = EditorView.theme({
  '&': {
    backgroundColor: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: '0.6rem',
    color: 'var(--ink)',
    fontSize: '1rem',
    maxHeight: '17rem',
  },
  '&.cm-focused': { outline: '2px solid var(--accent)' },
  '.cm-content, .cm-gutters': { fontFamily: 'var(--mono)' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--faint)' },
  '.cm-panels': { backgroundColor: 'transparent', color: 'var(--soft)' },
  '.cm-scroller': { overflow: 'auto' },
});

let vimReady = false;

const prepareVim = (): void => {
  if (vimReady) {
    return;
  }
  vimReady = true;
  Vim.defineAction('runProgram', (adapter) => {
    const view: unknown = adapter.cm6;
    if (view instanceof EditorView) {
      view.dom.dispatchEvent(new CustomEvent(runEvent, { bubbles: true }));
    }
  });
  Vim.mapCommand('<CR>', 'action', 'runProgram', {}, { context: 'normal' });
};

const vimLayer = (): Extension[] => {
  if (globalThis.matchMedia('(pointer: coarse)').matches) {
    return [];
  }
  prepareVim();
  return [vim({ status: true })];
};

const isInserting = (view: EditorView): boolean => {
  const state: unknown = getCM(view)?.state.vim;
  if (typeof state !== 'object' || state === null || !('insertMode' in state)) {
    return true;
  }
  return state.insertMode === true || ('visualMode' in state && state.visualMode === true);
};

const stepBy =
  (step: number) =>
  (view: EditorView): boolean => {
    if (isInserting(view)) {
      return false;
    }
    view.dom.dispatchEvent(new CustomEvent(stepEvent, { bubbles: true, detail: step }));
    return true;
  };

const arrows = Prec.highest(
  keymap.of([
    { key: 'ArrowLeft', run: stepBy(backward) },
    { key: 'ArrowUp', run: stepBy(backward) },
    { key: 'ArrowRight', run: stepBy(forward) },
    { key: 'ArrowDown', run: stepBy(forward) },
  ]),
);

const createEditor = (options: Options): Editor => {
  const run = (): boolean => {
    options.onRun();
    return true;
  };
  const view = new EditorView({
    doc: options.text,
    extensions: [
      arrows,
      ...vimLayer(),
      Prec.highest(keymap.of([{ key: 'Mod-Enter', run }])),
      basicSetup,
      keymap.of([indentWithTab]),
      cpp(),
      indentUnit.of(' '.repeat(tabWidth)),
      EditorState.tabSize.of(tabWidth),
      look,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          options.onChange(update.state.doc.toString());
        }
      }),
    ],
    parent: options.parent,
  });
  options.parent.addEventListener(runEvent, () => {
    options.onRun();
  });
  return { getText: () => view.state.doc.toString() };
};

export { createEditor, type Editor };
