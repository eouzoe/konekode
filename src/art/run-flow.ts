import { gsap } from 'gsap';

import { element } from './dom';
import { type Paper } from './paper';
import { type Stage } from './scene/stage';
import { outputOf, type Beat } from './unit';

interface RunParts {
  readonly paper: Paper;
  readonly stage: Stage;
}

interface RunFlow {
  readonly celebrate: () => Promise<void>;
  readonly clear: () => void;
  readonly execute: (beat: Beat, live: () => boolean) => Promise<boolean>;
}

const words = {
  cannotRun: '這個寫法原型裡跑不了，網站上會真的編譯。',
  different: '和題目要的不一樣，再看看程式？',
};

const press = { duration: 0.08, repeat: 1, scale: 0.95, yoyo: true };
const appear = { autoAlpha: 1, duration: 0.6, filter: 'blur(0px)' };
const stamp = { autoAlpha: 1, duration: 0.45, ease: 'back.out(2.2)', rotate: -8, scale: 1 };
const stampStart = { autoAlpha: 0, rotate: -24, scale: 2.4 };
const stampShake = 0.3;

const expectedOf = (beat: Beat): string | undefined => {
  if (beat.id !== 'task') {
    return undefined;
  }
  return beat.expect;
};

const verdictOf = (right: boolean): string => {
  if (right) {
    return '';
  }
  return words.different;
};

const showCell = (box: HTMLElement, text: string | undefined): void => {
  box.parentElement?.toggleAttribute('hidden', text === undefined);
  box.textContent = text ?? '';
};

const createRunFlow = ({ paper, stage }: RunParts): RunFlow => {
  const io = element('io');
  const outputBox = element('output');
  const verdict = element('verdict');
  const done = element('done');
  const prepare = (beat: Beat): void => {
    gsap.set(io, { autoAlpha: 1 });
    showCell(element('input'), beat.input);
    showCell(element('expect'), expectedOf(beat));
  };
  const show = async (output: string, beat: Beat): Promise<boolean> => {
    outputBox.textContent = output;
    await gsap.fromTo(outputBox, { autoAlpha: 0, filter: 'blur(4px)' }, appear);
    const right = beat.expect === undefined || output.trim() === beat.expect.trim();
    verdict.textContent = verdictOf(right);
    return right;
  };
  const execute = async (beat: Beat, live: () => boolean): Promise<boolean> => {
    prepare(beat);
    const output = outputOf(paper.state.buffer.text, beat.input ?? '');
    await gsap.fromTo('.run-hint', { scale: 1 }, press);
    if (!live()) {
      return false;
    }
    if (output === undefined) {
      outputBox.textContent = '';
      verdict.textContent = words.cannotRun;
      return false;
    }
    return show(output, beat);
  };
  const celebrate = async (): Promise<void> => {
    stage.pulse();
    await gsap.timeline().fromTo(done, stampStart, stamp).add(paper.shake(), stampShake);
  };
  const clear = (): void => {
    gsap.set([done, io], { autoAlpha: 0 });
    outputBox.textContent = '';
    verdict.textContent = '';
  };
  return { celebrate, clear, execute };
};

export { createRunFlow, type RunFlow };
