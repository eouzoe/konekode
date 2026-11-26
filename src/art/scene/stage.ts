import { refsRoute } from '../refs';

import type { SceneLook, SceneReply, SceneRequest, Screen, Time } from './protocol';

interface Stage {
  readonly pulse: () => void;
  readonly recede: (away: boolean) => Promise<void>;
  readonly setTime: (time: Time) => Promise<void>;
}

interface StageOptions {
  readonly flicker?: boolean;
  readonly focusY?: number;
  readonly overscan?: number;
  readonly scene?: string;
}

type Ask = (make: (id: number) => SceneRequest) => Promise<void>;

const base = '1999/extracted/singlebg__';
const roomScenes: Readonly<Record<Time, string>> = {
  day: `${base}storybg__bg__0xiangzinei.png`,
  dusk: `${base}storybg__bg__0xiangzineihuanghun.png`,
  night: `${base}storybg__bg__0xiangzineiwanshang.png`,
  overcast: `${base}storybg__bg__0xiangzineiyintian.png`,
};
const loginScene = `${base}loginbg__bg_denglubeijing.png`;
const defaults = { focusY: 0.5, overscan: 1.08 };

const scenesOf = (scene: string | undefined): Readonly<Record<Time, string>> => {
  if (scene === undefined) {
    return roomScenes;
  }
  return { day: scene, dusk: scene, night: scene, overcast: scene };
};

const lookOf = (options: StageOptions): SceneLook => ({
  flicker: options.flicker ?? false,
  focusY: options.focusY ?? defaults.focusY,
  overscan: options.overscan ?? defaults.overscan,
  scenes: scenesOf(options.scene),
});

const screenOf = (host: HTMLElement): Screen => ({
  height: host.clientHeight,
  resolution: globalThis.devicePixelRatio,
  width: host.clientWidth,
});

const connect = (worker: Worker): Ask => {
  const waiting = new Map<number, () => void>();
  let next = 0;
  worker.addEventListener('message', (event: MessageEvent<SceneReply>) => {
    if (event.data.kind === 'done') {
      waiting.get(event.data.id)?.();
      waiting.delete(event.data.id);
    }
  });
  return async (make) => {
    next += 1;
    const { promise, resolve } = Promise.withResolvers<null>();
    waiting.set(next, () => {
      resolve(null);
    });
    worker.postMessage(make(next));
    await promise;
  };
};

const launch = (host: HTMLElement, options: StageOptions): Worker => {
  const canvas = document.createElement('canvas');
  host.append(canvas);
  const worker = new Worker(new URL('scene.worker.ts', import.meta.url), { type: 'module' });
  const offscreen = canvas.transferControlToOffscreen();
  const refs = new URL(`${refsRoute}/`, location.href).href;
  const start: SceneRequest = {
    canvas: offscreen,
    kind: 'start',
    look: lookOf(options),
    refs,
    screen: screenOf(host),
  };
  worker.postMessage(start, [offscreen]);
  new ResizeObserver(() => {
    worker.postMessage({ kind: 'resize', screen: screenOf(host) } satisfies SceneRequest);
  }).observe(host);
  return worker;
};

const createStage = (host: HTMLElement, options: StageOptions = {}): Stage => {
  const worker = launch(host, options);
  const ask = connect(worker);
  return {
    pulse: () => {
      worker.postMessage({ kind: 'pulse' } satisfies SceneRequest);
    },
    recede: async (away) => {
      await ask((id) => ({ away, id, kind: 'recede' }));
    },
    setTime: async (time) => {
      await ask((id) => ({ id, kind: 'time', time }));
    },
  };
};

export { createStage, loginScene, type Stage, type StageOptions };
