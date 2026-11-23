import { gsap } from 'gsap';

import { createCode } from './code';
import { element, inSequence, wait } from './dom';
import { createBuffer, outputOf, press, starter, type Buffer } from './unit';

const keys = ['G', 'O', ...'cout << 11;'.split(''), 'Escape'];
const pace = { before: 1.2, key: 0.5, letter: 0.09, rest: 3.2 };
const appear = { autoAlpha: 1, duration: 0.6, filter: 'blur(0px)' };
const hidden = { autoAlpha: 0, filter: 'blur(4px)' };
const always = (): boolean => true;

const pauseAfter = (key: string, buffer: Buffer): number => {
  if (key.length === 1 && buffer.mode === 'insert') {
    return pace.letter;
  }
  return pace.key;
};

interface Demo {
  readonly measure: () => void;
  readonly play: () => void;
}

const createDemo = (): Demo => {
  const code = createCode(element('demo-code'), false);
  const output = element('demo-output');
  const view = { buffer: createBuffer(starter) };
  const draw = (): void => {
    code.show({ buffer: view.buffer, ghost: '', lines: new Set(), showCursor: true }, false);
  };
  const type = async (key: string): Promise<void> => {
    view.buffer = press(view.buffer, key).buffer;
    draw();
    await wait(pauseAfter(key, view.buffer));
  };
  const round = async (): Promise<void> => {
    view.buffer = createBuffer(starter);
    output.textContent = '';
    draw();
    await wait(pace.before);
    await inSequence(keys, type, always);
    output.textContent = outputOf(view.buffer.text, '') ?? '';
    gsap.fromTo(output, hidden, appear);
    await wait(pace.rest);
    await round();
  };
  return {
    measure: () => {
      code.view.requestMeasure();
    },
    play: () => {
      void round();
    },
  };
};

export { createDemo, type Demo };
