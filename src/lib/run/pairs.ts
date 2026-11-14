import { insertBracket } from '@codemirror/autocomplete';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { engine } from '@/lib/complete/current';
import { isIncludeLine } from '@/lib/complete/pairs';

const onIncludeLine = (view: EditorView): boolean => {
  const { head } = view.state.selection.main;
  return isIncludeLine(view.state.doc.lineAt(head).text);
};

const openPair = (view: EditorView, open: string, close: string): boolean => {
  const { head } = view.state.selection.main;
  view.dispatch({
    changes: { from: head, insert: `${open}${close}` },
    selection: { anchor: head + open.length },
  });
  return true;
};

const skipCloser = (view: EditorView, text: string): boolean => {
  const { head } = view.state.selection.main;
  const end = head + text.length;
  const closes = engine
    .pairs()
    .some((pair) => pair.where === 'include-line' && pair.close === text);
  if (!closes || view.state.sliceDoc(head, end) !== text) {
    return false;
  }
  view.dispatch({ selection: { anchor: end } });
  return true;
};

const typeLinePair = (view: EditorView, text: string): boolean => {
  if (!onIncludeLine(view)) {
    return false;
  }
  const pair = engine.linePair(text);
  if (pair !== null) {
    return openPair(view, pair.open, pair.close);
  }
  return skipCloser(view, text);
};

const typeChar = (view: EditorView, text: string): void => {
  if (typeLinePair(view, text)) {
    return;
  }
  const paired = insertBracket(view.state, text);
  if (paired === null) {
    view.dispatch(view.state.replaceSelection(text));
    return;
  }
  view.dispatch(paired);
};

const textAt = 3;

const unlockedPairs = [
  EditorView.inputHandler.of((...args) => typeLinePair(args[0], args[textAt])),
  Prec.highest(
    EditorState.languageData.of(() => [{ closeBrackets: { brackets: engine.brackets() } }]),
  ),
];

export { typeChar, unlockedPairs };
