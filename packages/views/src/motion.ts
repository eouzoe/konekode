import { gsap } from 'gsap';

import { timed, type Motion } from './scene/protocol';

type Listener = (motion: Motion) => void;

const listeners = new Set<Listener>();
const state: { motion: Motion } = { motion: 'full' };

const set = (motion: Motion): void => {
  state.motion = motion;
  for (const listener of listeners) {
    listener(motion);
  }
};

gsap.matchMedia().add('(prefers-reduced-motion: reduce)', () => {
  set('reduced');
  return () => {
    set('full');
  };
});

const onMotion = (listener: Listener): void => {
  listeners.add(listener);
  listener(state.motion);
};

const calm = (): boolean => state.motion === 'reduced';

const paced = (seconds: number): number => timed(state.motion, seconds);

export { calm, onMotion, paced };
