import { createDrill, expectedChar, isDone, press, type Drill } from './drill';
import {
  enterKey,
  findKey,
  rows,
  shiftKey,
  spaceKey,
  type KeyCap,
  type KeyPress,
} from './keyboard';

interface Parts {
  readonly current: HTMLElement;
  readonly done: HTMLElement;
  readonly hint: HTMLElement;
  readonly input: HTMLTextAreaElement;
  readonly keyboard: HTMLElement;
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

const makeRow = (keys: readonly HTMLElement[]): HTMLElement => {
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
    makeRow(digits),
    makeRow(upper),
    makeRow([...home, makeKey(enterKey, 'Enter', true)]),
    makeRow([makeKey(shiftKey, 'Shift', true), ...lower, makeKey(shiftKey, 'Shift', true)]),
    makeRow([makeKey(spaceKey, '空白鍵', true)]),
  );
};

const describeNext = (char: string): string => {
  const found = findKey(char);
  if (found === null) {
    return '';
  }
  if (found.key === enterKey) {
    return '下一個：Enter';
  }
  if (found.key === spaceKey) {
    return '下一個：空白鍵';
  }
  if (found.shift) {
    return `下一個：按住 Shift，再按 ${found.key}`;
  }
  return `下一個：${found.key}`;
};

const describe = (drill: Drill): string => {
  if (isDone(drill)) {
    return `打完了。打錯 ${String(drill.mistakes)} 次。`;
  }
  const next = describeNext(expectedChar(drill));
  if (drill.wrong) {
    return `不是這個鍵。${next}`;
  }
  return next;
};

const nextKey = (drill: Drill): KeyPress | null => {
  if (isDone(drill)) {
    return null;
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

const renderCode = (parts: Parts, drill: Drill): void => {
  const { position, target } = drill;
  const char = target.charAt(position);
  parts.done.textContent = target.slice(0, position);
  if (char === '\n') {
    parts.current.textContent = '⏎';
    parts.rest.textContent = target.slice(position);
    return;
  }
  parts.current.textContent = char;
  parts.rest.textContent = target.slice(position + 1);
};

const render = (parts: Parts, drill: Drill): void => {
  renderCode(parts, drill);
  parts.hint.textContent = describe(drill);
  parts.root.dataset.wrong = String(drill.wrong);
  parts.root.dataset.done = String(isDone(drill));
  highlight(parts.keyboard, drill);
};

const readInput = (event: InputEvent): string | null => {
  if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') {
    return '\n';
  }
  if (event.inputType === 'insertText') {
    return event.data;
  }
  return null;
};

const collectParts = (root: HTMLElement): Parts => {
  const input = findPart(root, 'input');
  if (!(input instanceof HTMLTextAreaElement)) {
    throw new TypeError('輸入框必須是 textarea');
  }
  return {
    current: findPart(root, 'current'),
    done: findPart(root, 'done'),
    hint: findPart(root, 'hint'),
    input,
    keyboard: findPart(root, 'keyboard'),
    rest: findPart(root, 'rest'),
    root,
  };
};

const mountDrill = (root: HTMLElement): void => {
  const parts = collectParts(root);
  let drill = createDrill(root.dataset.target ?? '');
  buildKeyboard(parts.keyboard);
  render(parts, drill);
  parts.input.addEventListener('beforeinput', (event) => {
    event.preventDefault();
    if (event.isComposing || event.inputType === 'insertCompositionText') {
      parts.hint.textContent = '現在是中文輸入。先切到英文輸入再打。';
      return;
    }
    for (const char of readInput(event) ?? '') {
      drill = press(drill, char);
    }
    render(parts, drill);
  });
  parts.input.addEventListener('compositionend', () => {
    parts.input.value = '';
  });
  root.addEventListener('click', () => {
    parts.input.focus();
  });
};

const mountAll = (): void => {
  for (const root of document.querySelectorAll<HTMLElement>('[data-typing-drill]')) {
    mountDrill(root);
  }
};

export { mountAll };
