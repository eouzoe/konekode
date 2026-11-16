import { Prec, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { describeCommand, describeNext } from '@/lib/typing/hint';
import { messages } from '@/lib/typing/messages';

import {
  advance,
  expectedNow,
  judge,
  takeText,
  type Expected,
  type Guide,
  type Verdict,
} from './guide';

interface Step {
  readonly at: number;
  readonly expected: Expected | null;
  readonly key: string;
  readonly verdict: Verdict;
}

interface Holder {
  guide: Guide | null;
  report: (step: Step) => void;
}

const modifiers = new Set(['Alt', 'CapsLock', 'Control', 'Meta', 'NumLock', 'OS', 'Shift']);
const arrows = new Set(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp']);
const functionKey = /^F\d+$/u;
const textAt = 3;
const named: Record<string, string> = {
  Backspace: `${messages.press}Backspace`,
  Enter: messages.pressEnter,
  Escape: messages.pressEsc,
};

const describeExpected = (expected: Expected | null): string => {
  if (expected === null) {
    return '';
  }
  if (expected.kind === 'run') {
    return messages.runNow;
  }
  if (expected.kind === 'text') {
    return describeNext(expected.key);
  }
  return named[expected.key] ?? describeCommand(expected.key);
};

const describeStep = (verdict: Verdict, expected: Expected | null): string => {
  if (verdict === 'ime') {
    return messages.ime;
  }
  if (verdict === 'full-width') {
    return messages.fullWidth;
  }
  const hint = describeExpected(expected);
  if (verdict === 'wrong') {
    return `${messages.wrong}${hint}`;
  }
  return hint;
};

const passes = (event: KeyboardEvent, inserting: boolean): boolean =>
  modifiers.has(event.key) || functionKey.test(event.key) || (arrows.has(event.key) && !inserting);

const press = (holder: Holder, guide: Guide, event: KeyboardEvent): boolean => {
  const step: Step = {
    at: guide.at,
    expected: expectedNow(guide),
    key: event.key,
    verdict: judge(guide, { composing: event.isComposing, key: event.key }),
  };
  if (step.verdict === 'right') {
    advance(guide);
    holder.report(step);
    return false;
  }
  holder.report(step);
  event.preventDefault();
  return true;
};

const block = (holder: Holder, event: Event): boolean => {
  if (holder.guide === null) {
    return false;
  }
  event.preventDefault();
  return true;
};

const guidedLayer = (holder: Holder, isInserting: (view: EditorView) => boolean): Extension =>
  Prec.highest([
    EditorView.domEventHandlers({
      cut: (event) => block(holder, event),
      drop: (event) => block(holder, event),
      keydown: (event, view) => {
        const { guide } = holder;
        if (guide === null || passes(event, isInserting(view))) {
          return false;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) {
          return true;
        }
        return press(holder, guide, event);
      },
      mousedown: (event, view) => {
        if (!block(holder, event)) {
          return false;
        }
        view.focus();
        return true;
      },
      paste: (event) => block(holder, event),
    }),
    EditorView.inputHandler.of(
      (...args) => holder.guide !== null && !takeText(holder.guide, args[textAt]),
    ),
  ]);

export { describeExpected, describeStep, guidedLayer, type Holder, type Step };
