import { createBirpc, type BirpcReturn } from 'birpc';

import { refsRoute } from './refs';

import type { PageCalls, SceneCalls, SceneLook, Screen, Spot, Start, Time } from './protocol';

type Stage = BirpcReturn<SceneCalls, PageCalls>;

interface StageOptions {
  readonly dark?: boolean;
  readonly edge?: boolean;
  readonly flicker?: boolean;
  readonly focusX?: number;
  readonly focusY?: number;
  readonly glow?: boolean;
  readonly lamps?: ReadonlyArray<Spot>;
  readonly overscan?: number;
  readonly scene?: string;
  readonly spirit?: Spot;
  readonly wet?: number;
}

const base = '1999/extracted/singlebg__';
const roomScenes: Readonly<Record<Time, string>> = {
  day: `${base}storybg__bg__0xiangzinei.png`,
  dusk: `${base}storybg__bg__0xiangzineihuanghun.png`,
  night: `${base}storybg__bg__0xiangzineiwanshang.png`,
  overcast: `${base}storybg__bg__0xiangzineiyintian.png`,
};
const storefront = '1999/edited/loginbg-street-sign.webp';
const defaults = { focusX: 0.5, focusY: 0.5, overscan: 1.08 };

const scenesOf = (scene: string | undefined): Readonly<Record<Time, string>> => {
  if (scene === undefined) {
    return roomScenes;
  }
  return { day: scene, dusk: scene, night: scene, overcast: scene };
};

const lookOf = (options: StageOptions): SceneLook => ({
  dark: options.dark ?? false,
  edge: options.edge ?? true,
  flicker: options.flicker ?? false,
  focusX: options.focusX ?? defaults.focusX,
  focusY: options.focusY ?? defaults.focusY,
  glow: options.glow ?? true,
  lamps: options.lamps ?? [],
  overscan: options.overscan ?? defaults.overscan,
  scenes: scenesOf(options.scene),
  spirit: options.spirit ?? null,
  wet: options.wet ?? null,
});

const screenOf = (host: HTMLElement): Screen => ({
  height: host.clientHeight,
  resolution: globalThis.devicePixelRatio,
  width: host.clientWidth,
});

const connect = (port: MessagePort, page: PageCalls): Stage =>
  createBirpc<SceneCalls, PageCalls>(page, {
    on: (receive) => {
      port.addEventListener('message', (message) => {
        receive(message.data);
      });
      port.start();
    },
    post: (data) => {
      port.postMessage(data);
    },
  });

const launch = (host: HTMLElement, options: StageOptions): MessagePort => {
  const canvas = document.createElement('canvas');
  host.append(canvas);
  const worker = new Worker(new URL('scene.worker.ts', import.meta.url), { type: 'module' });
  const offscreen = canvas.transferControlToOffscreen();
  const channel = new MessageChannel();
  const start: Start = {
    canvas: offscreen,
    look: lookOf(options),
    port: channel.port2,
    refs: new URL(`${refsRoute}/`, location.href).href,
    screen: screenOf(host),
  };
  worker.postMessage(start, [offscreen, channel.port2]);
  return channel.port1;
};

const recordOn = (host: HTMLElement, page?: PageCalls): PageCalls => ({
  mark: (name) => {
    host.dataset.mark = name;
    page?.mark(name);
  },
});

const createStage = (host: HTMLElement, options: StageOptions = {}, page?: PageCalls): Stage => {
  const stage = connect(launch(host, options), recordOn(host, page));
  new ResizeObserver(() => {
    void stage.resize.asEvent(screenOf(host));
  }).observe(host);
  return stage;
};

export { createStage, storefront, type Stage, type StageOptions };
