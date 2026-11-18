import { cpp } from '@codemirror/lang-cpp';
import { bracketMatching } from '@codemirror/language';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';

import { type Buffer, type Mode } from '@/lib/edit/buffer';
import { type Hint } from '@/lib/edit/goal';
import { messages } from '@/lib/typing/messages';

import { tokyoNight } from './theme';

interface Mark {
  readonly at: number;
  readonly hints: readonly Hint[];
  readonly mode: Mode;
}

interface Screen {
  readonly show: (buffer: Buffer, hints?: readonly Hint[]) => void;
}

type Placed = ReturnType<Decoration['range']>;

const farBefore = 1000;

const tagOf = (block: boolean): 'div' | 'span' => {
  if (block) {
    return 'div';
  }
  return 'span';
};

const classOf = (block: boolean): string => {
  if (block) {
    return 'cm-ghost cm-ghost-line';
  }
  return 'cm-ghost';
};

class Ghost extends WidgetType {
  readonly block: boolean;
  readonly text: string;

  constructor(text: string, block: boolean) {
    super();
    this.block = block;
    this.text = text;
  }

  override eq(other: Ghost): boolean {
    return other.text === this.text && other.block === this.block;
  }

  override toDOM(): HTMLElement {
    const element = document.createElement(tagOf(this.block));
    element.className = classOf(this.block);
    element.textContent = this.text;
    return element;
  }
}

const labels: Readonly<Record<Mode, string>> = {
  insert: messages.modeInsert,
  normal: messages.modeNormal,
};

const setMark = StateEffect.define<Mark>();

const markField = StateField.define<Mark>({
  create: () => ({ at: 0, hints: [], mode: 'normal' }),
  update: (mark, transaction) =>
    transaction.effects.find((item) => item.is(setMark))?.value ?? mark,
});

const startOf = (state: EditorState, line: number): number => state.doc.line(line + 1).from;

const ghostLine = (
  state: EditorState,
  hint: Extract<Hint, { kind: 'line' }>,
  order: number,
): Placed => {
  const widget = new Ghost(hint.text, true);
  if (hint.before < state.doc.lines) {
    const side = order - farBefore;
    return Decoration.widget({ block: true, side, widget }).range(startOf(state, hint.before));
  }
  return Decoration.widget({ block: true, side: order + 1, widget }).range(state.doc.length);
};

const place = (state: EditorState, hint: Hint, order: number): Placed => {
  if (hint.kind === 'line') {
    return ghostLine(state, hint, order);
  }
  const from = startOf(state, hint.line);
  if (hint.kind === 'drop') {
    return Decoration.line({ class: 'cm-ghost-drop' }).range(from);
  }
  if (hint.kind === 'insert') {
    const widget = new Ghost(hint.text, false);
    return Decoration.widget({ side: 1, widget }).range(from + hint.column);
  }
  return Decoration.mark({ class: 'cm-ghost-remove' }).range(from + hint.from, from + hint.to);
};

const pushed = ({ hints, mode }: Mark, line: number, column: number): number => {
  let width = 0;
  for (const hint of hints) {
    if (hint.kind === 'insert' && hint.line === line) {
      const ahead = hint.column < column || (hint.column === column && mode === 'normal');
      width += Number(ahead) * hint.text.length;
    }
  }
  return width;
};

const marks = EditorView.decorations.compute([markField], (state): DecorationSet => {
  const mark = state.field(markField);
  const line = state.doc.lineAt(Math.min(mark.at, state.doc.length));
  const column = mark.at - line.from;
  const attributes = {
    class: `cm-own-line cm-own-${mark.mode}`,
    style: `--column: ${String(column + pushed(mark, line.number - 1, column))}`,
  };
  const usable = mark.hints.filter((hint) => hint.kind === 'line' || hint.line < state.doc.lines);
  return Decoration.set(
    [
      Decoration.line({ attributes }).range(line.from),
      ...usable.map((hint, order) => place(state, hint, order)),
    ],
    true,
  );
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
  const show = (next: Buffer, hints: readonly Hint[] = []): void => {
    view.dispatch({
      changes: changeTo(view.state.doc.toString(), next.text),
      effects: setMark.of({ at: next.cursor, hints, mode: next.mode }),
      scrollIntoView: true,
      selection: { anchor: next.cursor },
    });
    mode.textContent = labels[next.mode];
  };
  show(buffer);
  return { show };
};

export { createScreen, type Screen };
