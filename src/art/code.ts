import { cpp } from '@codemirror/lang-cpp';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState, StateEffect, StateField, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  lineNumbers,
  type DecorationSet,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

import type { Buffer } from './unit';

interface Look {
  readonly buffer: Buffer;
  readonly ghost: string;
  readonly lines: ReadonlySet<number>;
  readonly showCursor: boolean;
}

interface CodeView {
  readonly show: (look: Look, follow?: boolean) => void;
  readonly view: EditorView;
}

const ink = HighlightStyle.define([
  {
    color: '#f0a066',
    tag: [
      tags.keyword,
      tags.processingInstruction,
      tags.typeName,
      tags.definitionKeyword,
      tags.modifier,
      tags.bool,
    ],
  },
  { color: '#e8cf94', tag: [tags.string, tags.character, tags.number] },
  { color: '#a3957f', tag: [tags.comment] },
]);

const theme = EditorView.theme({
  '&': {
    background: 'transparent',
    color: 'var(--light)',
    fontSize: 'var(--code-size)',
    height: '100%',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { fontFamily: 'var(--mono)', padding: '0.3em 0' },
  '.cm-gutters': {
    background: 'transparent',
    border: 'none',
    color: 'rgb(241 230 207 / 0.32)',
    fontFamily: 'var(--mono)',
  },
  '.cm-line': { lineHeight: '1.85', padding: '0 0.8em' },
  '.cm-scroller': { overflow: 'auto' },
});

class Inline extends WidgetType {
  readonly className: string;
  readonly text: string;

  constructor(className: string, text = '') {
    super();
    this.className = className;
    this.text = text;
  }

  override eq(other: Inline): boolean {
    return other.className === this.className && other.text === this.text;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = this.className;
    span.textContent = this.text;
    return span;
  }
}

const setLook = StateEffect.define<Look>();

const litLines = (look: Look, state: EditorState): Array<Range<Decoration>> =>
  [...look.lines]
    .filter((number) => number >= 1 && number <= state.doc.lines)
    .map((number) => Decoration.line({ class: 'cm-lit' }).range(state.doc.line(number).from));

const caretClass = (look: Look): string => {
  if (look.buffer.mode === 'normal') {
    return 'cm-bar normal';
  }
  return 'cm-bar';
};

const cursorMark = (look: Look, state: EditorState): Array<Range<Decoration>> => {
  if (!look.showCursor) {
    return [];
  }
  const at = Math.min(look.buffer.cursor, state.doc.length);
  const onChar = at < state.doc.length && state.doc.sliceString(at, at + 1) !== '\n';
  if (look.buffer.mode === 'insert' || !onChar) {
    return [Decoration.widget({ side: 1, widget: new Inline(caretClass(look)) }).range(at)];
  }
  return [Decoration.mark({ class: 'cm-block' }).range(at, at + 1)];
};

const ghostMark = (look: Look, state: EditorState): Array<Range<Decoration>> => {
  if (look.ghost === '') {
    return [];
  }
  const widget = new Inline('cm-ghost', look.ghost);
  return [Decoration.widget({ side: 2, widget }).range(state.doc.length)];
};

const lookField = StateField.define<Look | null>({
  create: () => null,
  update: (look, transaction) =>
    transaction.effects.find((item) => item.is(setLook))?.value ?? look,
});

const decorate = (state: EditorState): DecorationSet => {
  const look = state.field(lookField);
  if (look === null) {
    return Decoration.none;
  }
  return Decoration.set(
    [...litLines(look, state), ...cursorMark(look, state), ...ghostMark(look, state)],
    true,
  );
};

const field = [lookField, EditorView.decorations.compute([lookField, 'doc'], decorate)];

const createView = (host: HTMLElement, numbered: boolean): EditorView =>
  new EditorView({
    parent: host,
    state: EditorState.create({
      extensions: [
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
        numbered && lineNumbers(),
        cpp(),
        syntaxHighlighting(ink),
        theme,
        field,
      ].filter((extension) => extension !== false),
    }),
  });

const createCode = (host: HTMLElement, numbered = true): CodeView => {
  const view = createView(host, numbered);
  const show = (look: Look, follow = true): void => {
    const { doc } = view.state;
    const { cursor, text } = look.buffer;
    const changes = [{ from: 0, insert: text, to: doc.length }].filter(
      () => doc.toString() !== text,
    );
    view.dispatch({ changes, effects: setLook.of(look) });
    if (follow) {
      const at = Math.min(cursor, view.state.doc.length);
      view.dispatch({ effects: EditorView.scrollIntoView(at) });
    }
  };
  return { show, view };
};

export { createCode, type CodeView, type Look };
