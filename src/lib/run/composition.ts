import { type EditorView } from '@codemirror/view';

const imeKey = 'Process';

const endComposition = (view: EditorView): void => {
  view.contentDOM.dispatchEvent(new CompositionEvent('compositionend'));
};

const isLeftOver = (view: EditorView, event: KeyboardEvent): boolean =>
  view.compositionStarted && !event.isComposing && event.key !== imeKey;

const watchComposition = (view: EditorView): void => {
  view.dom.addEventListener(
    'keydown',
    (event) => {
      if (isLeftOver(view, event)) {
        endComposition(view);
      }
    },
    { capture: true },
  );
};

export { endComposition, watchComposition };
