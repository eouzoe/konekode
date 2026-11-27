import { gsap } from 'gsap';
import { createActor } from 'xstate';

import { wait } from './dom';
import { calm, onMotion, paced } from './motion';
import { createStage, storefront, type Stage } from './scene/stage';
import { cue, leave, music, open as openSound, probe } from './sound';
import { titleMachine } from './title-machine';

const around = '[data-role="around"]';
const reveal = { duration: 0.6, ease: 'sine.out', opacity: 1 };
const view: { fade: gsap.core.Tween | null } = { fade: null };
const actor = createActor(titleMachine);
const artUnit = '/art/unit';
const fadeAround = 0.4;
const guard = 3.2;

const showAround = (): void => {
  if (calm()) {
    gsap.set(around, { opacity: 1 });
    return;
  }
  view.fade ??= gsap.to(around, reveal);
};

const settle = (stage: Stage): void => {
  view.fade?.progress(1);
  gsap.set(around, { opacity: 1 });
  void stage.finish();
};

const follow = (home: HTMLElement, stage: Stage): void => {
  actor.subscribe((snapshot) => {
    home.dataset.state = snapshot.value;
    if (snapshot.matches('revealing')) {
      showAround();
    }
    if (snapshot.matches('lit')) {
      openSound('lit');
      settle(stage);
    }
  });
};

const skipOnInput = (): void => {
  for (const type of ['keydown', 'pointerdown'] as const) {
    document.addEventListener(
      type,
      () => {
        actor.send({ type: 'SKIP' });
      },
      { capture: true, once: true },
    );
  }
};

const open = (home: HTMLElement, host: HTMLElement): Stage => {
  const stage = createStage(
    host,
    {
      dark: true,
      edge: false,
      glow: false,
      lamps: [
        { across: 0.2881, down: 0.1109 },
        { across: 0.4288, down: 0.1314 },
        { across: 0.5865, down: 0.1135 },
        { across: 0.7304, down: 0.1399 },
      ],
      overscan: 1.04,
      scene: storefront,
      spirit: { across: 0.36, down: 0.489 },
      wet: 0.802,
    },
    {
      mark: (name) => {
        if (name === 'revealing') {
          actor.send({ type: 'REVEALING' });
        }
      },
    },
  );
  onMotion((motion) => {
    void stage.motion(motion);
  });
  follow(home, stage);
  return stage;
};

const plain = (event: MouseEvent): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

const lasting = async (heard: Promise<number>): Promise<void> => {
  await wait(await heard);
};

const enter = async (home: HTMLElement, stage: Stage, start: HTMLAnchorElement): Promise<void> => {
  const go = (): void => {
    location.assign(start.href);
  };
  home.dataset.leaving = 'true';
  const heard = cue('enter');
  leave();
  gsap.to(around, { duration: paced(fadeAround), opacity: 0 });
  document.addEventListener('pointerdown', go, { once: true });
  await Promise.race([Promise.all([stage.leave(), lasting(heard)]), wait(guard)]);
  go();
};

const listenStart = (home: HTMLElement, stage: Stage): void => {
  const start = home.querySelector<HTMLAnchorElement>('.start');
  if (start === null) {
    return;
  }
  if (import.meta.env.DEV) {
    start.href = artUnit;
  }
  start.addEventListener('click', (event) => {
    if (!plain(event) || home.dataset.leaving === 'true') {
      return;
    }
    event.preventDefault();
    void enter(home, stage, start);
  });
};

const listenSound = (home: HTMLElement): void => {
  music('home');
  home.querySelector('.account')?.addEventListener('click', () => {
    void cue('click');
  });
};

if (import.meta.env.DEV || import.meta.env.PUBLIC_MODE === 'dev') {
  Object.assign(globalThis, { soundProbe: probe });
}

const home = document.querySelector<HTMLElement>('.home');
const host = document.querySelector<HTMLElement>('[data-role="scene"]');
if (home !== null && host !== null) {
  home.dataset.dressed = '';
  gsap.set(around, { animation: 'none' });
  listenSound(home);
  const stage = open(home, host);
  listenStart(home, stage);
  if (!calm()) {
    gsap.set(around, { opacity: 0 });
    skipOnInput();
  }
  actor.start();
  try {
    await stage.light(calm());
  } finally {
    actor.send({ type: 'DONE' });
  }
}
