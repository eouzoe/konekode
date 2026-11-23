import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';

import { element } from './dom';
import { sectionAt } from './progress';
import { createBuffer, runBufferAt, template, type Beat } from './unit';
import { parts } from './unit-parts';

gsap.registerPlugin(Flip);

type Mode = Beat['stage'];

const view: { mode: Mode | null } = { mode: null };

const motion = {
  desk: { duration: 1.1, ease: 'power2.inOut' },
  enter: { duration: 1, ease: 'power3.inOut' },
  keyboard: { at: 0.3, duration: 0.6, ease: 'expo.out' },
  move: { duration: 0.9, ease: 'power3.inOut' },
  sheet: { at: 0.25, autoAlpha: 0, duration: 1.1, ease: 'expo.out', rotate: 2.5, translateY: 110 },
  side: { at: 0.5, autoAlpha: 0, duration: 0.8, ease: 'expo.out', stagger: 0.12, translateX: -50 },
  work: { duration: 0.6 },
};

const keyboardShown = (): number => Number(view.mode === 'drill');

const showKeyboard = (timeline: gsap.core.Timeline): gsap.core.Timeline => {
  const { at, ...tween } = motion.keyboard;
  return timeline.to('#keyboard', { ...tween, autoAlpha: keyboardShown() }, at);
};

const enterWork = async (before: Flip.FlipState): Promise<void> => {
  const { at: sheetAt, ...sheetFrom } = motion.sheet;
  const { at: sideAt, ...sideFrom } = motion.side;
  const flip = Flip.from(before, { ...motion.enter, targets: parts.dialogueBox });
  const timeline = gsap
    .timeline()
    .add(flip, 0)
    .from(parts.sheet, sheetFrom, sheetAt)
    .from('.side > *', sideFrom, sideAt);
  await showKeyboard(timeline);
};

const moveWithin = async (before: Flip.FlipState): Promise<void> => {
  await showKeyboard(gsap.timeline().add(Flip.from(before, motion.move), 0));
};

const fadeWork = (working: boolean, instant: boolean): void => {
  const shown = Number(working);
  const speed = Number(!instant);
  gsap.to('#desk', { ...motion.desk, autoAlpha: shown, duration: motion.desk.duration * speed });
  gsap.to('#work', { autoAlpha: shown, duration: motion.work.duration * speed });
};

const switchTo = (mode: Mode, instant: boolean): boolean => {
  view.mode = mode;
  parts.ui.dataset.stage = mode;
  const working = mode !== 'empty';
  void parts.stage.recede(working);
  fadeWork(working, instant);
  return working;
};

const setMode = async (mode: Mode, instant: boolean): Promise<void> => {
  if (mode === view.mode) {
    return;
  }
  const wasStory = view.mode === null || view.mode === 'empty';
  const before = Flip.getState([parts.dialogueBox, parts.sheet]);
  const working = switchTo(mode, instant);
  if (instant) {
    gsap.set('#keyboard', { autoAlpha: keyboardShown() });
  } else if (wasStory && working) {
    await enterWork(before);
  } else {
    await moveWithin(before);
  }
};

const snippetOf = (beat: Beat): string | undefined => {
  if (beat.stage !== 'run') {
    return undefined;
  }
  return beat.snippet;
};

const setBuffer = (at: number, beat: Beat): void => {
  parts.paper.state.modeOverride = null;
  if (beat.stage === 'drill') {
    parts.drill.replayTo(at);
  } else if (beat.stage === 'run') {
    parts.paper.state.buffer = runBufferAt(at);
  } else {
    parts.paper.state.buffer = createBuffer(template);
  }
};

const setLabels = (at: number, beat: Beat): void => {
  const section = sectionAt(at);
  element('tape-number').textContent = section.number;
  element('tape-title').textContent = section.title;
  parts.hint.textContent = '';
  const snippet = snippetOf(beat);
  element('snippet').hidden = snippet === undefined;
  element('snippet-code').textContent = snippet ?? '';
};

const setScene = (at: number, beat: Beat): void => {
  setLabels(at, beat);
  parts.run.clear();
  const { state } = parts.paper;
  state.lit = new Set((beat.lines ?? '').split(',').filter(Boolean).map(Number));
  state.showCursor = beat.stage === 'drill' || beat.stage === 'run';
  state.ghostOn = beat.stage === 'drill';
  setBuffer(at, beat);
  parts.paper.draw();
};

const shownMode = (): Mode | null => view.mode;

export { setMode, setScene, shownMode };
