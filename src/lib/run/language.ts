import { indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { indentUnit } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';

import { tokyoNight } from './theme';

const tabWidth = 4;

const language: readonly Extension[] = [
  keymap.of([indentWithTab]),
  cpp(),
  indentUnit.of(' '.repeat(tabWidth)),
  EditorState.tabSize.of(tabWidth),
  tokyoNight,
];

export { language };
