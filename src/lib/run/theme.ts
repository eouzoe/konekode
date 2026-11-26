import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

import type { Extension } from '@codemirror/state';

const night = {
  blue: '#7aa2f7',
  comment: '#565f89',
  current: '#292e42',
  cursor: '#3d59a1',
  cyan: '#7dcfff',
  green: '#9ece6a',
  ink: '#c0caf5',
  number: '#737aa2',
  orange: '#ff9e64',
  purple: '#bb9af7',
  selection: '#33467c',
  sky: '#89ddff',
  teal: '#2ac3de',
};

const look = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--panel)',
      border: '1px solid var(--line)',
      borderRadius: '0.6rem',
      color: night.ink,
      fontSize: '1.1875rem',
      height: '100%',
    },
    '&.cm-focused': { outline: 'none' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: night.selection,
    },
    '.cm-activeLine': { backgroundColor: night.current },
    '.cm-activeLineGutter': { backgroundColor: night.current, color: night.ink },
    '.cm-content, .cm-gutters': { fontFamily: 'var(--mono)' },
    '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: night.number },
    '.cm-matchingBracket': { backgroundColor: night.selection, outline: 'none' },
    '.cm-panels': { backgroundColor: 'transparent', color: 'var(--soft)' },
    '.cm-scroller': { overflow: 'auto' },
  },
  { dark: true },
);

const colors = HighlightStyle.define([
  { color: night.purple, tag: [tags.keyword, tags.modifier, tags.controlKeyword] },
  { color: night.teal, tag: [tags.typeName, tags.namespace, tags.className] },
  { color: night.green, tag: [tags.string, tags.character] },
  { color: night.orange, tag: [tags.number, tags.bool, tags.null, tags.escape] },
  { color: night.comment, fontStyle: 'italic', tag: tags.comment },
  { color: night.cyan, tag: [tags.processingInstruction, tags.meta, tags.propertyName] },
  {
    color: night.blue,
    tag: [tags.function(tags.variableName), tags.definition(tags.variableName)],
  },
  { color: night.sky, tag: [tags.operator, tags.punctuation, tags.bracket] },
  { color: night.ink, tag: tags.variableName },
]);

const tokyoNight: Array<Extension> = [look, syntaxHighlighting(colors)];

export { tokyoNight };
