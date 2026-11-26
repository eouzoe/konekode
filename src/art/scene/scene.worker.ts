import { createBirpc, type BirpcReturn } from 'birpc';
import { gsap } from 'gsap';
import { DOMAdapter, NoiseFilter, WebWorkerAdapter, type Sprite } from 'pixi.js';

import { half } from './frame';
import { flutter, lightNow, lightUp, type Lamp } from './props';
import {
  timed,
  type Mark,
  type Motion,
  type PageCalls,
  type SceneCalls,
  type Screen,
  type Start,
  type Time,
} from './protocol';
import { ripple } from './wet';
import {
  atRest,
  build,
  fill,
  glowLevel,
  layout,
  pushedAway,
  type Levels,
  type Setup,
  type World,
} from './world';

DOMAdapter.set(WebWorkerAdapter);

type Page = BirpcReturn<PageCalls, SceneCalls>;

const seconds = { crossfade: 2.4, leave: 2.3, pulse: 0.9, recede: 1.2 };
const push = { zoom: 1.6 };

const drift = { across: -0.18, down: 0.55 };
const flickerTiming = { first: 3, least: 2, spread: 5 };
const lampTiming = { first: 6, least: 5, spread: 12 };

const flutterOn = (world: World, lamp: Lamp): void => {
  const play = (): void => {
    const wait = lampTiming.least + Math.random() * lampTiming.spread;
    if (world.motion === 'full') {
      flutter(lamp).eventCallback('onComplete', () => {
        gsap.delayedCall(wait, play);
      });
      return;
    }
    gsap.delayedCall(wait, play);
  };
  gsap.delayedCall(lampTiming.first + Math.random() * lampTiming.spread, play);
};

const flickerOn = (world: World): void => {
  const flick = (): void => {
    const timeline = gsap.timeline({
      onComplete: () => {
        gsap.delayedCall(flickerTiming.least + Math.random() * flickerTiming.spread, flick);
      },
    });
    if (world.motion === 'full') {
      timeline
        .to(world.glow, { alpha: 0.12, duration: 0.06 })
        .to(world.glow, { alpha: 0.42, duration: 0.08 })
        .to(world.glow, { alpha: 0.2, duration: 0.05 })
        .to(world.glow, { alpha: glowLevel.rest, duration: 0.5, ease: 'sine.out' });
    }
  };
  gsap.delayedCall(flickerTiming.first, flick);
};

const follow = (world: World, grain: NoiseFilter, step: number): void => {
  const { camera, rain, sway } = world;
  const { screen } = world.app;
  camera.scale.set(sway.zoom);
  camera.position.set(screen.width * half + sway.pan, screen.height * half);
  if (world.motion === 'full') {
    rain.tilePosition.set(
      rain.tilePosition.x + drift.across * step,
      rain.tilePosition.y + drift.down * step,
    );
    grain.seed = Math.random();
    if (world.wet !== null) {
      ripple(world.wet, step);
    }
  }
};

const setMotion = (world: World, motion: Motion): void => {
  world.motion = motion;
  for (const animation of world.ambient) {
    animation.paused(motion === 'reduced');
  }
  if (world.wet !== null) {
    world.wet.filter.enabled = motion === 'full';
  }
};

const animate = (world: World): void => {
  const grain = new NoiseFilter({ noise: 0.07, seed: Math.random() });
  world.app.stage.filters = [grain];
  const forever = { ease: 'sine.inOut', repeat: -1, yoyo: true };
  world.ambient.push(
    gsap.to(world.sway, { ...forever, duration: 38, zoom: 1.05 }),
    gsap.to(world.sway, { ...forever, duration: 46, pan: -26 }),
  );
  world.app.ticker.add((ticker) => {
    follow(world, grain, ticker.deltaTime);
  });
  if (world.look.flicker) {
    flickerOn(world);
  }
  for (const lamp of world.props.lamps) {
    flutterOn(world, lamp);
  }
};

const light = async (world: World, instant: boolean, page: Page): Promise<void> => {
  const mark = (name: Mark): void => {
    void page.mark.asEvent(name);
  };
  if (instant || world.motion === 'reduced') {
    lightNow(world.props, world.shade, atRest.shade);
  } else {
    world.cue = lightUp(world.props, world.shade, { mark, rest: atRest.shade });
    await world.cue;
    world.cue = null;
  }
  mark('revealing');
};

const showing = (world: World, time: Time): boolean => world.current === time;

const crossfade = async (world: World, from: Sprite, to: Sprite): Promise<void> => {
  world.camera.setChildIndex(to, world.camera.children.length - 1);
  const duration = timed(world.motion, seconds.crossfade);
  await gsap.fromTo(to, { alpha: 0 }, { alpha: 1, duration, ease: 'sine.inOut' });
  from.alpha = 0;
};

const setTime = async (world: World, time: Time): Promise<void> => {
  const from = world.layers.get(world.current);
  const to = world.layers.get(time);
  if (time === world.current || from === undefined || to === undefined) {
    return;
  }
  world.current = time;
  await fill(world, time, to);
  if (showing(world, time)) {
    await crossfade(world, from, to);
  }
};

const levelsFor = (away: boolean): Levels => {
  if (away) {
    return pushedAway;
  }
  return atRest;
};

const recede = async (world: World, away: boolean): Promise<void> => {
  const target = levelsFor(away);
  const motion = { duration: timed(world.motion, seconds.recede), ease: 'power2.inOut' };
  await Promise.all([
    gsap.to(world.blur, { ...motion, strength: target.blur }),
    gsap.to(world.shade, { ...motion, alpha: target.shade }),
    gsap.to(world.rain, { ...motion, alpha: target.rain }),
  ]);
};

const pulse = (world: World): void => {
  const duration = timed(world.motion, seconds.pulse);
  gsap.fromTo(
    world.glow,
    { alpha: glowLevel.rest },
    { alpha: glowLevel.peak, duration, ease: 'sine.out', repeat: 1, yoyo: true },
  );
};

const leave = async (world: World): Promise<void> => {
  world.cue?.progress(1);
  for (const animation of world.ambient) {
    animation.kill();
  }
  const duration = timed(world.motion, seconds.leave);
  await Promise.all([
    gsap.to(world.sway, { duration, ease: 'power2.in', pan: 0, zoom: push.zoom }),
    gsap.to(world.shade, { alpha: 1, duration, ease: 'power2.in' }),
  ]);
  world.shade.alpha = 1;
};

const resize = (world: World, screen: Screen): void => {
  world.app.renderer.resize(screen.width, screen.height, screen.resolution);
  layout(world);
};

const start = async (setup: Setup): Promise<World> => {
  const world = await build(setup);
  animate(world);
  return world;
};

const callsFor = (ready: Promise<World>, page: () => Page): SceneCalls => ({
  finish: async () => {
    const world = await ready;
    world.cue?.progress(1);
  },
  leave: async () => {
    await leave(await ready);
  },
  light: async (instant) => {
    await light(await ready, instant, page());
  },
  motion: async (motion) => {
    setMotion(await ready, motion);
  },
  pulse: async () => {
    pulse(await ready);
  },
  recede: async (away) => {
    await recede(await ready, away);
  },
  resize: async (screen) => {
    resize(await ready, screen);
  },
  setTime: async (time) => {
    await setTime(await ready, time);
  },
});

const serve = ({ port, ...setup }: Start): void => {
  const ready = start(setup);
  const page: Page = createBirpc<PageCalls, SceneCalls>(
    callsFor(ready, () => page),
    {
      on: (receive) => {
        port.addEventListener('message', (message) => {
          receive(message.data);
        });
        port.start();
      },
      post: (data) => {
        port.postMessage(data);
      },
    },
  );
};

globalThis.addEventListener(
  'message',
  (event: MessageEvent<Start>) => {
    serve(event.data);
  },
  { once: true },
);
