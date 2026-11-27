import { paced } from '@konekode/views/motion';
import { gsap } from 'gsap';

import {
  enterKey,
  escapeKey,
  findKey,
  rows,
  shiftKey,
  spaceKey,
  type KeyCap,
} from '@/lib/typing/keyboard';

interface Cap {
  readonly id: string;
  readonly label: string;
  readonly size?: string;
}

interface Keyboard {
  readonly down: (key: string) => void;
  readonly flash: (key: string) => void;
  readonly next: (key?: string) => void;
  readonly up: (key: string) => void;
}

const rightShift = 'ShiftRight';
const flashSeconds = 0.14;
const pressSeconds = { down: 0.08, up: 0.18 };

const labelOf = (cap: KeyCap): string => {
  if (cap.base.toUpperCase() === cap.shift) {
    return cap.shift;
  }
  return `${cap.shift} ${cap.base}`;
};

const capsOf = (row: ReadonlyArray<KeyCap>): Array<Cap> =>
  row.map((cap) => ({ id: cap.base, label: labelOf(cap) }));

const [numbers = [], upper = [], home = [], lower = []] = rows;

const layout: ReadonlyArray<ReadonlyArray<Cap>> = [
  [{ id: escapeKey, label: 'Esc', size: 'wide' }, ...capsOf(numbers)],
  capsOf(upper),
  [...capsOf(home), { id: enterKey, label: 'Enter', size: 'wider' }],
  [
    { id: shiftKey, label: 'Shift', size: 'wider' },
    ...capsOf(lower),
    { id: rightShift, label: 'Shift', size: 'wider' },
  ],
  [{ id: spaceKey, label: '空白鍵', size: 'space' }],
];

const makeCap = (cap: Cap): HTMLElement => {
  const element = document.createElement('span');
  element.classList.add('kb-key');
  if (cap.size !== undefined) {
    element.classList.add(cap.size);
  }
  element.textContent = cap.label;
  return element;
};

const build = (host: HTMLElement): Map<string, HTMLElement> => {
  const caps = new Map<string, HTMLElement>();
  for (const row of layout) {
    const line = document.createElement('div');
    line.className = 'kb-row';
    for (const cap of row) {
      const element = makeCap(cap);
      line.append(element);
      caps.set(cap.id, element);
    }
    host.append(line);
  }
  return caps;
};

const withShift = (key: string): Array<string> => {
  if (findKey(key)?.shift === true) {
    return [key, shiftKey];
  }
  return [key];
};

const idsOf = (key: string): Array<string> => {
  if (key === shiftKey) {
    return [shiftKey, rightShift];
  }
  return [findKey(key)?.key ?? key];
};

const createKeyboard = (host: HTMLElement): Keyboard => {
  const caps = build(host);
  const capsFor = (key: string): Array<HTMLElement> =>
    idsOf(key)
      .map((id) => caps.get(id))
      .filter((cap) => cap !== undefined);
  const down = (key: string): void => {
    for (const cap of capsFor(key)) {
      cap.classList.add('down');
      gsap.fromTo(cap, { translateY: 0 }, { duration: paced(pressSeconds.down), translateY: 2 });
    }
  };
  const up = (key: string): void => {
    for (const cap of capsFor(key)) {
      cap.classList.remove('down');
      gsap.to(cap, { duration: paced(pressSeconds.up), ease: 'back.out(3)', translateY: 0 });
    }
  };
  const flash = (key: string): void => {
    const held = withShift(key);
    for (const each of held) {
      down(each);
    }
    gsap.delayedCall(flashSeconds, () => {
      for (const each of held) {
        up(each);
      }
    });
  };
  const next = (key?: string): void => {
    for (const cap of caps.values()) {
      cap.classList.remove('next');
    }
    if (key === undefined) {
      return;
    }
    for (const cap of withShift(key).flatMap((each) => capsFor(each))) {
      cap.classList.add('next');
    }
  };
  return { down, flash, next, up };
};

export { createKeyboard, type Keyboard };
