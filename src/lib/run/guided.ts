import { Prec, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';

import { describeCommand, describeNext } from '@/lib/typing/hint';
import { messages } from '@/lib/typing/messages';

import { endComposition, watchComposition } from './composition';
import {
  advance,
  causeOf,
  expectedNow,
  judge,
  type Cause,
  type Expected,
  type Guide,
  type Verdict,
} from './guide';
import { typeChar } from './pairs';
import { type Snapshot } from './puppet';
import { renew } from './renew';

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
  start: Snapshot | null;
}

interface Probes {
  readonly isInserting: (view: EditorView) => boolean;
  readonly isPending: (view: EditorView) => boolean;
}

interface Moment {
  readonly event: KeyboardEvent;
  readonly inserting: boolean;
  readonly pending: boolean;
  readonly view: EditorView;
}

const modifiers = new Set(['Alt', 'CapsLock', 'Control', 'Meta', 'NumLock', 'OS', 'Shift']);
const arrows = new Set(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp']);
const functionKey = /^F\d+$/u;
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

const startsCommand = ({ inserting, pending }: Moment, step: Step): boolean =>
  step.expected?.kind === 'command' && !inserting && !pending;

const refresh = (holder: Holder, guide: Guide, moment: Moment): void => {
  if (holder.start !== null) {
    renew(moment.view, holder.start, guide.steps.slice(0, guide.at));
  }
};

const write = ({ event, view }: Moment, step: Step): boolean => {
  if (step.expected?.kind !== 'text') {
    return false;
  }
  event.preventDefault();
  typeChar(view, event.key);
  return true;
};

interface Done {
  readonly moment: Moment;
  readonly step: Step;
}

const carry = (holder: Holder, guide: Guide, { moment, step }: Done): boolean => {
  if (startsCommand(moment, step)) {
    refresh(holder, guide, moment);
  }
  const written = write(moment, step);
  return accept(holder, guide, step) || written;
};

const press = (holder: Holder, guide: Guide, moment: Moment): boolean => {
  const { event } = moment;
  const seen = { at: guide.at, expected: expectedNow(guide), key: event.key };
  const verdict = judge(guide, { composing: event.isComposing, key: event.key });
  if (verdict === 'right') {
    return carry(holder, guide, { moment, step: { ...seen, cause: '', verdict } });
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

const refuseComposition = (holder: Holder, view: EditorView): boolean => {
  if (holder.guide === null) {
    return false;
  }
  view.contentDOM.blur();
  setTimeout(() => {
    view.focus();
    endComposition(view);
  }, 0);
  return true;
};

const settled = ViewPlugin.define((view) => {
  watchComposition(view);
  return {};
});

const guidedLayer = (holder: Holder, { isInserting, isPending }: Probes): Extension =>
  Prec.highest([
    settled,
    EditorView.domEventHandlers({
      compositionstart: (_event, view) => refuseComposition(holder, view),
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
        return press(holder, guide, { event, inserting, pending: isPending(view), view });
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
    EditorView.inputHandler.of(() => holder.guide !== null),
  ]);

export { describeExpected, describeStep, guidedLayer, type Holder, type Step };
