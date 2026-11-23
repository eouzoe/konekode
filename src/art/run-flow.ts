import { gsap } from 'gsap';

import { element } from './dom';
import { paced } from './motion';
import { outputOf, type Beat } from './unit';

import type { Paper } from './paper';
import type { Stage } from './scene/stage';

interface RunParts {
  readonly paper: Paper;
  readonly stage: Stage;
}

interface RunFlow {
  readonly celebrate: () => Promise<void>;
  readonly clear: () => void;
  readonly execute: (beat: Beat, signal: AbortSignal) => Promise<string | undefined>;
  readonly note: (text: string) => void;
  readonly shown: () => string | null;
}

const words = {
  cannotRun: '這個寫法原型裡跑不了，網站上會真的編譯。',
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

const showCell = (box: HTMLElement, text: string | undefined): void => {
  box.parentElement?.toggleAttribute('hidden', text === undefined);
  box.textContent = text ?? '';
};

interface Boxes {
  readonly done: HTMLElement;
  readonly io: HTMLElement;
  readonly output: HTMLElement;
  readonly verdict: HTMLElement;
}

const boxesOf = (): Boxes => ({
  done: element('done'),
  io: element('io'),
  output: element('output'),
  verdict: element('verdict'),
});

const prepare = (boxes: Boxes, beat: Beat, source: string): string | undefined => {
  gsap.set(boxes.io, { autoAlpha: 1 });
  showCell(element('input'), beat.input);
  showCell(element('expect'), expectedOf(beat));
  boxes.output.textContent = '';
  boxes.verdict.textContent = '';
  return outputOf(source, beat.input ?? '');
};

const reveal = async (boxes: Boxes, output: string): Promise<void> => {
  boxes.output.textContent = output;
  await gsap.fromTo(
    boxes.output,
    { autoAlpha: 0, filter: 'blur(4px)' },
    { ...appear, duration: paced(appear.duration) },
  );
};

const createRunFlow = ({ paper, stage }: RunParts): RunFlow => {
  const boxes = boxesOf();
  const held: { shown: string | null } = { shown: null };
  const execute = async (beat: Beat, signal: AbortSignal): Promise<string | undefined> => {
    const output = prepare(boxes, beat, paper.state.buffer.text);
    await gsap.fromTo('.run-hint', { scale: 1 }, { ...press, duration: paced(press.duration) });
    if (signal.aborted) {
      return undefined;
    }
    if (output === undefined) {
      boxes.verdict.textContent = words.cannotRun;
      return undefined;
    }
    held.shown = beat.id;
    await reveal(boxes, output);
    return output;
  };
  const celebrate = async (): Promise<void> => {
    void stage.pulse();
    await gsap
      .timeline()
      .fromTo(boxes.done, stampStart, { ...stamp, duration: paced(stamp.duration) })
      .add(paper.shake(), paced(stampShake));
  };
  const clear = (): void => {
    gsap.set([boxes.done, boxes.io], { autoAlpha: 0 });
    boxes.output.textContent = '';
    boxes.verdict.textContent = '';
    held.shown = null;
  };
  const note = (text: string): void => {
    boxes.verdict.textContent = text;
  };
  return { celebrate, clear, execute, note, shown: () => held.shown };
};

export { createRunFlow, type RunFlow };
