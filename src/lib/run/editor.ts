import { Compartment, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { Vim, getCM, vim } from '@replit/codemirror-vim';
import { basicSetup } from 'codemirror';

import { engine } from '@/lib/complete/current';

import { createGuide, expectedNow, type Expected } from './guide';
import { guidedLayer, type Holder, type Step } from './guided';
import { language } from './language';
import { unlockedPairs } from './pairs';
import { press, restore, snapshot, type Snapshot } from './puppet';

interface Editor {
  readonly blur: () => void;
  readonly focus: () => void;
  readonly getText: () => string;
  readonly guide: (path: readonly string[] | null) => void;
  readonly nextStep: () => Expected | null;
  readonly onMode: (listener: (mode: string) => void) => void;
  readonly press: (token: string) => void;
  readonly restore: (saved: Snapshot) => void;
  readonly setArmed: (armed: boolean) => void;
  readonly snapshot: () => Snapshot;
}

interface Options {
  readonly cursor: number;
  readonly onChange?: (draft: { cursor: number; text: string }) => void;
  readonly onCommand?: (refused: boolean, key: string) => void;
  readonly onRun?: () => void;
  readonly onStep?: (step: Step) => void;
  readonly parent: HTMLElement;
  readonly text: string;
}

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

const isPending = (view: EditorView): boolean => {
  const state: unknown = getCM(view)?.state.vim;
  return typeof state === 'object' && state !== null && 'status' in state && state.status !== '';
};

const deleteKey = 'Delete';
const deleteCommand = 'x';

const commandOf = (event: KeyboardEvent): string | null => {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  if (event.key === deleteKey) {
    return deleteCommand;
  }
  if (event.key.length === 1) {
    return event.key;
  }
  return null;
};

const taughtOnly = (report: (refused: boolean, key: string) => void): Extension =>
  Prec.highest(
    EditorView.domEventHandlers({
      keydown: (event, view) => {
        const command = commandOf(event);
        if (command === null || isInserting(view) || isPending(view)) {
          return false;
        }
        const refused = !engine.keys().has(command);
        report(refused, command);
        if (refused) {
          event.preventDefault();
        }
        return refused;
      },
    }),
  );

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

const follow = (holder: Holder, path: readonly string[] | null): void => {
  if (path === null) {
    holder.guide = null;
    return;
  }
  holder.guide = createGuide(path);
};

const nextOf = (holder: Holder): Expected | null => {
  if (holder.guide === null) {
    return null;
  }
  return expectedNow(holder.guide);
};

interface Inner {
  readonly editable: Compartment;
  readonly holder: Holder;
  readonly view: EditorView;
}

const handle = ({ editable, holder, view }: Inner): Editor => ({
  blur: () => {
    view.contentDOM.blur();
  },
  focus: () => {
    view.focus();
  },
  getText: () => view.state.doc.toString(),
  guide: (path) => {
    follow(holder, path);
  },
  nextStep: () => nextOf(holder),
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
    options.onRun?.();
    return true;
  };
  const runInNormal = (target: EditorView): boolean => !isInserting(target) && run();
  const editable = new Compartment();
  const holder: Holder = {
    guide: null,
    isTaught: (key) => engine.keys().has(key),
    report: (step) => {
      options.onStep?.(step);
    },
  };
  const view = new EditorView({
    doc: options.text,
    extensions: [
      guidedLayer(holder, isInserting),
      taughtOnly((refused, key) => {
        options.onCommand?.(refused, key);
      }),
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
      ...language,
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          options.onChange?.({
            cursor: update.state.selection.main.head,
            text: update.state.doc.toString(),
          });
        }
      }),
    ],
    parent: options.parent,
    selection: { anchor: Math.min(options.cursor, options.text.length) },
  });
  return handle({ editable, holder, view });
};

const forgetVimMemory = (): void => {
  Vim.resetVimGlobalState_();
};

export { createEditor, forgetVimMemory, type Editor };
