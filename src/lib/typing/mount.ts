import {
  createDrill,
  erase,
  expectedChar,
  hasError,
  indentAt,
  isDone,
  press,
  type Drill,
} from './drill';
import {
  backspaceKey,
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

const visible = new Map([
  ['\n', '⏎'],
  [' ', '␣'],
]);

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
    makeRow([...digits, makeKey(backspaceKey, 'Backspace', true)]),
    makeRow(upper),
    makeRow([...home, makeKey(enterKey, 'Enter', true)]),
    makeRow([makeKey(shiftKey, 'Shift', true), ...lower, makeKey(shiftKey, 'Shift', true)]),
    makeRow([makeKey(spaceKey, '空白鍵', true)]),
  );
};

const describeNext = (char: string): string => {
  if (char === '\n') {
    return '按 Enter';
  }
  if (char === ' ') {
    return '按空白鍵';
  }
  return `輸入 ${char}`;
};

const describe = (drill: Drill): string => {
  if (isDone(drill)) {
    return '打完了！';
  }
  if (hasError(drill)) {
    return '有打錯的字，按 Backspace 刪掉紅色的部分';
  }
  return describeNext(expectedChar(drill));
};

const nextKey = (drill: Drill): KeyPress | null => {
  if (isDone(drill)) {
    return null;
  }
  if (hasError(drill)) {
    return { key: backspaceKey, shift: false };
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

const paintChar = (char: string, expected: string): HTMLElement => {
  const span = document.createElement('span');
  if (char === expected) {
    span.textContent = char;
    return span;
  }
  span.className = 'is-bad';
  span.textContent = visible.get(char) ?? char;
  return span;
};

const renderCode = (parts: Parts, drill: Drill): void => {
  const { target, typed } = drill;
  parts.done.replaceChildren(
    ...Array.from({ length: typed.length }, (_unused, index) =>
      paintChar(typed.charAt(index), target.charAt(index)),
    ),
  );
  const char = target.charAt(typed.length);
  if (char === '\n') {
    parts.current.textContent = '⏎';
    parts.rest.textContent = target.slice(typed.length);
    return;
  }
  parts.current.textContent = char;
  parts.rest.textContent = target.slice(typed.length + 1);
};

const render = (parts: Parts, drill: Drill): void => {
  renderCode(parts, drill);
  parts.hint.textContent = describe(drill);
  Object.assign(parts.root.dataset, {
    done: String(isDone(drill)),
    started: String(drill.typed.length > indentAt(drill.target, 0).length),
    wrong: String(hasError(drill)),
  });
  highlight(parts.keyboard, drill);
};

const readInput = (event: InputEvent): string => {
  if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') {
    return '\n';
  }
  if (event.inputType === 'insertText') {
    return event.data ?? '';
  }
  return '';
};

const typeInto = (drill: Drill, text: string): Drill => {
  let next = drill;
  for (const char of text) {
    next = press(next, char);
  }
  return next;
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
  const update = (next: Drill): void => {
    const wasDone = isDone(drill);
    drill = next;
    render(parts, drill);
    if (!wasDone && isDone(drill)) {
      root.dispatchEvent(new CustomEvent('drill:done', { bubbles: true }));
    }
  };
  buildKeyboard(parts.keyboard);
  render(parts, drill);
  parts.input.addEventListener('beforeinput', (event) => {
    event.preventDefault();
    if (event.isComposing || event.inputType === 'insertCompositionText') {
      parts.hint.textContent = '現在是中文輸入，先切換成英文輸入法再打喔！';
      return;
    }
    update(typeInto(drill, readInput(event)));
  });
  parts.input.addEventListener('keydown', (event) => {
    if (event.key === backspaceKey && !event.isComposing) {
      event.preventDefault();
      update(erase(drill));
    }
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
