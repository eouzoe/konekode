import { ui } from '@/lib/text/ui';
import { expectedChar, hasStarted, insertKey, isTyped, type Drill } from '@/lib/typing/drill';
import {
  enterKey,
  escapeKey,
  findKey,
  rows,
  shiftKey,
  spaceKey,
  type KeyCap,
} from '@/lib/typing/keyboard';
import { messages } from '@/lib/typing/messages';

import { type KeyCapView, type KeyState } from './contract';

interface LastKey {
  readonly key: string;
  readonly right: boolean;
}

interface Wanted {
  readonly key: string;
  readonly shift: boolean;
}

const wantedOf = (drill: Drill): Wanted | null => {
  if (isTyped(drill)) {
    return drill.mode === 'insert' ? { key: escapeKey, shift: false } : null;
  }
  if (drill.mode === 'normal') {
    return { key: insertKey, shift: false };
  }
  return findKey(expectedChar(drill));
};

const keyOf = (input: string): string => {
  if (input === '\n') {
    return enterKey;
  }
  return findKey(input)?.key ?? input;
};

const capLabel = (cap: KeyCap): string =>
  cap.base.toUpperCase() === cap.shift ? cap.shift : `${cap.shift} ${cap.base}`;

const stateOf = (key: string, wanted: Wanted | null, last: LastKey | null): KeyState => {
  if (last?.key === key) {
    return last.right ? 'right' : 'wrong';
  }
  if (wanted?.key === key || (wanted?.shift === true && key === shiftKey)) {
    return 'wanted';
  }
  return 'idle';
};

const capOf = (
  key: string,
  label: string,
  wide: boolean,
  marks: { readonly last: LastKey | null; readonly wanted: Wanted | null },
): KeyCapView => ({ key, label, state: stateOf(key, marks.wanted, marks.last), wide });

const keyboardOf = (drill: Drill, last: LastKey | null): readonly (readonly KeyCapView[])[] => {
  const marks = { last, wanted: wantedOf(drill) };
  const [digits = [], upper = [], home = [], lower = []] = rows.map((row) =>
    row.map((cap) => capOf(cap.base, capLabel(cap), false, marks)),
  );
  return [
    [capOf(escapeKey, 'Esc', false, marks), ...digits],
    upper,
    [...home, capOf(enterKey, 'Enter', true, marks)],
    [capOf(shiftKey, 'Shift', true, marks), ...lower, capOf(shiftKey, 'Shift', true, marks)],
    [capOf(spaceKey, ui['keyboard.space'], true, marks)],
  ];
};

const feedbackText: Readonly<Record<Drill['feedback'], string>> = {
  'need-insert': messages.needInsert,
  'no-delete': messages.noDelete,
  none: '',
  'wrong-key': messages.wrong,
};

const drillHint = (drill: Drill): string => {
  const told = feedbackText[drill.feedback];
  if (told !== '') {
    return told;
  }
  if (isTyped(drill)) {
    return drill.mode === 'insert' ? messages.pressEscape : messages.done;
  }
  if (drill.mode === 'normal') {
    return hasStarted(drill) ? messages.resume : messages.begin;
  }
  return '';
};

const modeLabel = (mode: 'insert' | 'normal'): string =>
  mode === 'insert' ? messages.modeInsert : messages.modeNormal;

export { drillHint, keyboardOf, keyOf, modeLabel, type LastKey };
