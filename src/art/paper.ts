import { gsap } from 'gsap';

import { createCode } from './code';
import { paced } from './motion';
import { createBuffer, template, type Buffer } from './unit';

type Mode = Buffer['mode'];

interface PaperParts {
  readonly editor: HTMLElement;
  readonly keycap: HTMLElement;
  readonly modeLine: HTMLElement;
  readonly sheet: HTMLElement;
}

interface PaperState {
  buffer: Buffer;
  ghostOn: boolean;
  lit: ReadonlySet<number>;
  modeOverride: Mode | null;
  showCursor: boolean;
}

interface Paper {
  readonly draw: () => void;
  readonly shake: () => gsap.core.Tween;
  readonly showKey: (key: string) => void;
  readonly state: PaperState;
}

const wobble = 0.09;
const keycapSeconds = { fade: 0.3, pop: 0.35 };
const keyNames: Readonly<Record<string, string>> = { ' ': '空白', Escape: 'Esc' };
const modeNames: Readonly<Record<Mode, string>> = {
  insert: '-- INSERT --',
  normal: '-- NORMAL --',
};

const ghostOf = (state: PaperState): string => {
  if (!state.ghostOn || !template.startsWith(state.buffer.text)) {
    return '';
  }
  return template.slice(state.buffer.text.length);
};

const createPaper = (parts: PaperParts): Paper => {
  const code = createCode(parts.editor);
  const state: PaperState = {
    buffer: createBuffer(''),
    ghostOn: false,
    lit: new Set(),
    modeOverride: null,
    showCursor: false,
  };
  const draw = (): void => {
    const { buffer, lit, showCursor } = state;
    code.show({ buffer, ghost: ghostOf(state), lines: lit, showCursor });
    const mode = state.modeOverride ?? buffer.mode;
    parts.modeLine.textContent = modeNames[mode];
    parts.modeLine.classList.toggle('insert', mode === 'insert');
    parts.modeLine.hidden = !showCursor;
  };
  const shake = (): gsap.core.Tween => {
    const duration = paced(wobble);
    return gsap.to(parts.sheet, {
      clearProps: 'transform',
      keyframes: [
        { duration, translateX: -4 },
        { duration, translateX: 3 },
        { duration, translateX: -2 },
        { duration, translateX: 0 },
      ],
      snap: { translateX: 1 },
    });
  };
  const showKey = (key: string): void => {
    parts.keycap.textContent = keyNames[key] ?? key;
    gsap.fromTo(
      parts.keycap,
      { autoAlpha: 1, scale: 1.35, translateY: 0 },
      { duration: paced(keycapSeconds.pop), ease: 'back.out(2)', scale: 1 },
    );
    gsap.to(parts.keycap, {
      autoAlpha: 0,
      delay: 0.5,
      duration: paced(keycapSeconds.fade),
      translateY: -10,
    });
  };
  return { draw, shake, showKey, state };
};

export { createPaper, type Paper, type PaperState };
