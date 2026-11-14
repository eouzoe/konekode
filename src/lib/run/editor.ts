import { indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { indentUnit } from '@codemirror/language';
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { getCM, vim } from '@replit/codemirror-vim';
import { basicSetup } from 'codemirror';

import { unlockedPairs } from './pairs';
import { press, restore, snapshot, type Snapshot } from './puppet';
import { tokyoNight } from './theme';

interface Editor {
  readonly blur: () => void;
  readonly focus: () => void;
  readonly getText: () => string;
  readonly onMode: (listener: (mode: string) => void) => void;
  readonly press: (token: string) => void;
  readonly restore: (saved: Snapshot) => void;
  readonly setArmed: (armed: boolean) => void;
  readonly snapshot: () => Snapshot;
}

interface Options {
  readonly onChange: (text: string) => void;
  readonly onRun: () => void;
  readonly parent: HTMLElement;
  readonly text: string;
}

const tabWidth = 4;
const stepEvent = 'scene:step';
const forward = 1;
const backward = -forward;

const vimLayer = (): Extension[] => {
  if (globalThis.matchMedia('(pointer: coarse)').matches) {
    return [];
  }
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

const handle = (view: EditorView, editable: Compartment): Editor => ({
  blur: () => {
    view.contentDOM.blur();
  },
  focus: () => {
    view.focus();
  },
  getText: () => view.state.doc.toString(),
  onMode: (listener) => {
    getCM(view)?.on('vim-mode-change', (change: { mode: string }) => {
      listener(change.mode);
    });
  },
  press: (token) => {
    press(view, token);
  },
  restore: (saved) => {
    restore(view, saved);
  },
  setArmed: (armed) => {
    view.dispatch({ effects: editable.reconfigure(EditorView.editable.of(armed)) });
  },
  snapshot: () => snapshot(view),
});

const createEditor = (options: Options): Editor => {
  const run = (): boolean => {
    options.onRun();
    return true;
  };
  const runInNormal = (target: EditorView): boolean => !isInserting(target) && run();
  const editable = new Compartment();
  const view = new EditorView({
    doc: options.text,
    extensions: [
      arrows,
      ...vimLayer(),
      Prec.highest(
        keymap.of([
          { key: 'Mod-Enter', run },
          { key: 'Enter', run: runInNormal },
        ]),
      ),
      unlockedPairs,
      basicSetup,
      editable.of(EditorView.editable.of(false)),
      keymap.of([indentWithTab]),
      cpp(),
      indentUnit.of(' '.repeat(tabWidth)),
      EditorState.tabSize.of(tabWidth),
      tokyoNight,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          options.onChange(update.state.doc.toString());
        }
      }),
    ],
    parent: options.parent,
  });
  return handle(view, editable);
};

export { createEditor, type Editor };
