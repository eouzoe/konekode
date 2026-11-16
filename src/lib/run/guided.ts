import { Prec, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { describeCommand, describeNext } from '@/lib/typing/hint';
import { messages } from '@/lib/typing/messages';

import {
  advance,
  causeOf,
  expectedNow,
  judge,
  takeText,
  type Cause,
  type Expected,
  type Guide,
  type Verdict,
} from './guide';

interface Step {
  readonly at: number;
  readonly cause: Cause;
  readonly expected: Expected | null;
  readonly key: string;
  readonly verdict: Verdict;
}

interface Holder {
  guide: Guide | null;
  isTaught: (key: string) => boolean;
  report: (step: Step) => void;
}

interface Moment {
  readonly event: KeyboardEvent;
  readonly inserting: boolean;
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

const reason = (holder: Holder, guide: Guide, { event, inserting }: Moment): Cause =>
  causeOf(guide, { inserting, key: event.key, taught: holder.isTaught(event.key) });

const reasons: Record<Verdict, (holder: Holder, guide: Guide, moment: Moment) => Cause> = {
  'full-width': () => '',
  ime: () => '',
  right: () => '',
  wrong: reason,
};

const accept = (holder: Holder, guide: Guide, step: Step): boolean => {
  advance(guide);
  holder.report(step);
  return false;
};

const press = (holder: Holder, guide: Guide, moment: Moment): boolean => {
  const { event } = moment;
  const seen = { at: guide.at, expected: expectedNow(guide), key: event.key };
  const verdict = judge(guide, { composing: event.isComposing, key: event.key });
  if (verdict === 'right') {
    return accept(holder, guide, { ...seen, cause: '', verdict });
  }
  holder.report({ ...seen, cause: reasons[verdict](holder, guide, moment), verdict });
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
        const inserting = isInserting(view);
        if (guide === null || passes(event, inserting)) {
          return false;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) {
          return true;
        }
        return press(holder, guide, { event, inserting });
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
