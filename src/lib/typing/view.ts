import { ui } from '@konekode/course/ui';

import { engine } from '@/lib/complete/current';
import { autoClosed } from '@/lib/complete/pairs';

import { expectedChar, hasStarted, insertKey, isDone, isTyped, type Drill } from './drill';
import { describeNext } from './hint';
import {
  enterKey,
  escapeKey,
  findKey,
  rows,
  shiftKey,
  spaceKey,
  type KeyCap,
  type KeyPress,
} from './keyboard';
import { messages } from './messages';

interface Parts {
  readonly current: HTMLElement;
  readonly done: HTMLElement;
  readonly hint: HTMLElement;
  readonly input: HTMLElement;
  readonly keyboard: HTMLElement;
  readonly mode: HTMLElement;
  readonly rest: HTMLElement;
  readonly root: HTMLElement;
}

const findPart = (root: Element, role: string): HTMLElement => {
  const found = root.querySelector(`[data-role="${role}"]`);
  if (!(found instanceof HTMLElement)) {
    throw new TypeError(`找不到 ${role}`);
  }
  return found;
};

const makeKey = (key: string, label: string, wide: boolean): HTMLElement => {
  const element = document.createElement('span');
  element.className = 'key';
  element.dataset.key = key;
  element.dataset.wide = String(wide);
  element.textContent = label;
  return element;
};

const capLabel = (cap: KeyCap): string => {
  if (cap.base.toUpperCase() === cap.shift) {
    return cap.shift;
  }
  return `${cap.shift} ${cap.base}`;
};

const makeRow = (keys: ReadonlyArray<HTMLElement>): HTMLElement => {
  const row = document.createElement('div');
  row.className = 'key-row';
  row.append(...keys);
  return row;
};

const buildKeyboard = (keyboard: HTMLElement): void => {
  const [digits = [], upper = [], home = [], lower = []] = rows.map((row) =>
    row.map((cap) => makeKey(cap.base, capLabel(cap), false)),
  );
  keyboard.replaceChildren(
    makeRow([makeKey(escapeKey, 'Esc', false), ...digits]),
    makeRow(upper),
    makeRow([...home, makeKey(enterKey, 'Enter', true)]),
    makeRow([makeKey(shiftKey, 'Shift', true), ...lower, makeKey(shiftKey, 'Shift', true)]),
    makeRow([makeKey(spaceKey, ui['keyboard.space'], true)]),
  );
};

const describeNormal = (drill: Drill): string => {
  if (drill.feedback === 'need-insert') {
    return messages.needInsert;
  }
  if (hasStarted(drill)) {
    return messages.resume;
  }
  return messages.begin;
};

const describeTyped = (drill: Drill): string => {
  if (drill.feedback === 'none') {
    return messages.pressEscape;
  }
  return messages.extraKey;
};

const describeInsert = (drill: Drill): string => {
  const next = describeNext(expectedChar(drill));
  if (drill.feedback === 'no-delete') {
    return `${messages.noDelete}${next}`;
  }
  if (drill.feedback === 'wrong-key') {
    return `${messages.wrong}${next}`;
  }
  return next;
};

const describe = (drill: Drill): string => {
  if (isDone(drill)) {
    return messages.done;
  }
  if (drill.mode === 'normal') {
    return describeNormal(drill);
  }
  if (isTyped(drill)) {
    return describeTyped(drill);
  }
  return describeInsert(drill);
};

const nextKey = (drill: Drill): KeyPress | null => {
  if (isDone(drill)) {
    return null;
  }
  if (drill.mode === 'normal') {
    return findKey(insertKey);
  }
  if (isTyped(drill)) {
    return { key: escapeKey, shift: false };
  }
  return findKey(expectedChar(drill));
};

const highlight = (keyboard: HTMLElement, drill: Drill): void => {
  const found = nextKey(drill);
  for (const key of keyboard.querySelectorAll<HTMLElement>('.key')) {
    const name = key.dataset.key;
    const isTarget = found !== null && name === found.key;
    const isShift = found !== null && found.shift && name === shiftKey;
    key.dataset.next = String(isTarget || isShift);
  }
};

const autoSpan = (text: string): HTMLElement => {
  const span = document.createElement('span');
  span.className = 'is-auto';
  span.textContent = text;
  return span;
};

const renderRest = (parts: Parts, drill: Drill, from: number): void => {
  const closed = autoClosed(drill.target, drill.position, engine.pairs());
  const pieces: Array<HTMLElement | string> = [];
  let plain = '';
  for (let index = from; index < drill.target.length; index += 1) {
    const char = drill.target.charAt(index);
    if (closed.has(index)) {
      pieces.push(plain, autoSpan(char));
      plain = '';
    } else {
      plain += char;
    }
  }
  parts.rest.replaceChildren(...pieces, plain);
};

const renderCode = (parts: Parts, drill: Drill): void => {
  const { position, target } = drill;
  const char = target.charAt(position);
  parts.done.textContent = target.slice(0, position);
  if (char === '\n') {
    parts.current.textContent = '⏎';
    renderRest(parts, drill, position);
    return;
  }
  parts.current.textContent = char;
  renderRest(parts, drill, position + 1);
};

const modeLabel = (drill: Drill): string => {
  if (drill.mode === 'insert') {
    return messages.modeInsert;
  }
  return messages.modeNormal;
};

const quiet = (parts: Parts): void => {
  parts.hint.textContent = '';
  for (const key of parts.keyboard.querySelectorAll<HTMLElement>('.key')) {
    key.dataset.next = 'false';
  }
};

const render = (parts: Parts, drill: Drill): void => {
  renderCode(parts, drill);
  parts.hint.textContent = describe(drill);
  parts.mode.textContent = modeLabel(drill);
  Object.assign(parts.root.dataset, {
    done: String(isDone(drill)),
    mode: drill.mode,
    started: String(hasStarted(drill)),
    wrong: String(drill.feedback === 'wrong-key'),
  });
  highlight(parts.keyboard, drill);
};

export { buildKeyboard, findPart, quiet, render, type Parts };
