import { indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { indentUnit } from '@codemirror/language';
import { EditorState, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { getCM, vim } from '@replit/codemirror-vim';
import { basicSetup } from 'codemirror';

import { tokyoNight } from './theme';

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

const createEditor = (options: Options): Editor => {
  const run = (): boolean => {
    options.onRun();
    return true;
  };
  const runInNormal = (target: EditorView): boolean => !isInserting(target) && run();
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
      basicSetup,
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
  return { getText: () => view.state.doc.toString() };
};

export { createEditor, type Editor };
