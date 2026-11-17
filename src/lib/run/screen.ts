import { cpp } from '@codemirror/lang-cpp';
import { bracketMatching } from '@codemirror/language';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
  type DecorationSet,
} from '@codemirror/view';

import { type Buffer, type Mode } from '@/lib/edit/buffer';
import { messages } from '@/lib/typing/messages';

import { tokyoNight } from './theme';

interface Mark {
  readonly at: number;
  readonly mode: Mode;
}

interface Screen {
  readonly show: (buffer: Buffer) => void;
}

const labels: Readonly<Record<Mode, string>> = {
  insert: messages.modeInsert,
  normal: messages.modeNormal,
};

const setMark = StateEffect.define<Mark>();

const markField = StateField.define<Mark>({
  create: () => ({ at: 0, mode: 'normal' }),
  update: (mark, transaction) =>
    transaction.effects.find((item) => item.is(setMark))?.value ?? mark,
});

const marks = EditorView.decorations.compute([markField], (state): DecorationSet => {
  const { at, mode } = state.field(markField);
  const line = state.doc.lineAt(Math.min(at, state.doc.length));
  const attributes = {
    class: `cm-own-line cm-own-${mode}`,
    style: `--column: ${String(at - line.from)}`,
  };
  return Decoration.set([Decoration.line({ attributes }).range(line.from)]);
});

const sharedStart = (old: string, next: string): number => {
  let at = 0;
  while (at < old.length && at < next.length && old.charAt(at) === next.charAt(at)) {
    at += 1;
  }
  return at;
};

const sharedEnd = (old: string, next: string, from: number): number => {
  let count = 0;
  const limit = Math.min(old.length, next.length) - from;
  while (count < limit && old.at(-count - 1) === next.at(-count - 1)) {
    count += 1;
  }
  return count;
};

const changeTo = (old: string, next: string): { from: number; insert: string; to: number } => {
  const from = sharedStart(old, next);
  const end = sharedEnd(old, next, from);
  return { from, insert: next.slice(from, next.length - end), to: old.length - end };
};

const createView = (parent: HTMLElement, text: string): EditorView =>
  new EditorView({
    doc: text,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      bracketMatching(),
      cpp(),
      tokyoNight,
      markField,
      marks,
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ],
    parent,
  });

const createScreen = (parent: HTMLElement, buffer: Buffer): Screen => {
  const view = createView(parent, buffer.text);
  const mode = document.createElement('p');
  mode.className = 'mode';
  mode.dataset.role = 'mode';
  parent.append(mode);
  const show = (next: Buffer): void => {
    view.dispatch({
      changes: changeTo(view.state.doc.toString(), next.text),
      effects: setMark.of({ at: next.cursor, mode: next.mode }),
      scrollIntoView: true,
      selection: { anchor: next.cursor },
    });
    mode.textContent = labels[next.mode];
  };
  show(buffer);
  return { show };
};

export { createScreen, type Screen };
