import { gsap } from 'gsap';
import {
  Application,
  Assets,
  BlurFilter,
  Container,
  DOMAdapter,
  NoiseFilter,
  Sprite,
  Texture,
  TilingSprite,
  WebWorkerAdapter,
} from 'pixi.js';

import {
  type SceneLook,
  type SceneReply,
  type SceneRequest,
  type Size,
  type Time,
  times,
} from './protocol';

DOMAdapter.set(WebWorkerAdapter);

type Start = Extract<SceneRequest, { kind: 'start' }>;
type Lookup = (path: string) => Texture;

interface Frame {
  readonly focusY: number;
  readonly overscan: number;
}

interface Levels {
  readonly blur: number;
  readonly rain: number;
  readonly shade: number;
}

interface Overlays {
  readonly edge: Sprite;
  readonly glow: Sprite;
  readonly rain: TilingSprite;
  readonly shade: Sprite;
}

interface World extends Overlays {
  readonly app: Application;
  readonly blur: BlurFilter;
  readonly camera: Container;
  readonly layers: ReadonlyMap<Time, Sprite>;
  readonly look: SceneLook;
  readonly sway: { pan: number; zoom: number };
  current: Time;
}

const half = 0.5;
const ground = '#0b0a09';
const files = {
  glow: '1999/extracted/singlebg__common__bg_2.png',
  scratches: '1999/extracted/singlebg__common__bg_heibianzhuangshi.png',
  vignette: '1999/extracted/singlebg__dialogue__dialogue_fullbg.png',
};
const atRest: Levels = { blur: 0, rain: 0.55, shade: 0.2 };
const pushedAway: Levels = { blur: 14, rain: 0.2, shade: 0.62 };
const drift = { across: -0.18, down: 0.55 };
const glowLevel = { peak: 0.75, rest: 0.35 };
const flickerTiming = { first: 3, least: 2, spread: 5 };
const centred: Frame = { focusY: half, overscan: 1 };

const post = (reply: SceneReply): void => {
  globalThis.postMessage(reply);
};

const cover = (sprite: Sprite, screen: Size, frame: Frame): void => {
  const fit = Math.max(screen.width / sprite.texture.width, screen.height / sprite.texture.height);
  sprite.scale.set(fit * frame.overscan);
  sprite.anchor.set(half, frame.focusY);
  sprite.position.set(screen.width * half, screen.height * frame.focusY);
};

const loadTextures = async (refs: string, look: SceneLook): Promise<Lookup> => {
  const paths = [...new Set([...Object.values(look.scenes), ...Object.values(files)])];
  const urlOf = (path: string): string => new URL(path, refs).href;
  const loaded = await Assets.load<Texture>(paths.map((path) => urlOf(path)));
  return (path) => loaded[urlOf(path)] ?? Texture.EMPTY;
};

const flickerOn = (glow: Sprite): void => {
  const flick = (): void => {
    gsap
      .timeline({
        onComplete: () => {
          gsap.delayedCall(flickerTiming.least + Math.random() * flickerTiming.spread, flick);
        },
      })
      .to(glow, { alpha: 0.12, duration: 0.06 })
      .to(glow, { alpha: 0.42, duration: 0.08 })
      .to(glow, { alpha: 0.2, duration: 0.05 })
      .to(glow, { alpha: glowLevel.rest, duration: 0.5, ease: 'sine.out' });
  };
  gsap.delayedCall(flickerTiming.first, flick);
};

const buildLayers = (camera: Container, look: SceneLook, texture: Lookup): Map<Time, Sprite> =>
  new Map(
    times.map((time) => {
      const sprite = new Sprite({
        alpha: Number(time === 'day'),
        texture: texture(look.scenes[time]),
      });
      camera.addChild(sprite);
      return [time, sprite] as const;
    }),
  );

const buildOverlays = (stage: Container, texture: Lookup): Overlays => {
  const shade = new Sprite({ alpha: atRest.shade, texture: Texture.WHITE, tint: ground });
  const rain = new TilingSprite({
    alpha: atRest.rain,
    blendMode: 'screen',
    texture: texture(files.scratches),
  });
  const glow = new Sprite({
    alpha: glowLevel.rest,
    blendMode: 'add',
    texture: texture(files.glow),
  });
  const edge = new Sprite({ texture: texture(files.vignette) });
  stage.addChild(shade, rain, glow, edge);
  return { edge, glow, rain, shade };
};

const layout = (world: World): void => {
  const { screen } = world.app;
  for (const sprite of world.layers.values()) {
    cover(sprite, screen, world.look);
  }
  world.shade.setSize(screen.width, screen.height);
  world.rain.setSize(screen.width, screen.height);
  world.rain.tileScale.set(screen.height / world.rain.texture.height);
  cover(world.glow, screen, centred);
  cover(world.edge, screen, centred);
  world.camera.pivot.set(screen.width * half, screen.height * half);
};

const follow = (world: World, grain: NoiseFilter, step: number): void => {
  const { camera, rain, sway } = world;
  const { screen } = world.app;
  camera.scale.set(sway.zoom);
  camera.position.set(screen.width * half + sway.pan, screen.height * half);
  rain.tilePosition.set(
    rain.tilePosition.x + drift.across * step,
    rain.tilePosition.y + drift.down * step,
  );
  grain.seed = Math.random();
};

const animate = (world: World): void => {
  const grain = new NoiseFilter({ noise: 0.07, seed: Math.random() });
  world.app.stage.filters = [grain];
  const forever = { ease: 'sine.inOut', repeat: -1, yoyo: true };
  gsap.to(world.sway, { ...forever, duration: 38, zoom: 1.05 });
  gsap.to(world.sway, { ...forever, duration: 46, pan: -26 });
  world.app.ticker.add((ticker) => {
    follow(world, grain, ticker.deltaTime);
  });
  if (world.look.flicker) {
    flickerOn(world.glow);
  }
};

const build = async ({ canvas, look, refs, screen }: Start): Promise<World> => {
  const app = new Application();
  await app.init({ antialias: true, background: ground, canvas, preference: 'webgpu', ...screen });
  const texture = await loadTextures(refs, look);
  const camera = new Container();
  app.stage.addChild(camera);
  const layers = buildLayers(camera, look, texture);
  const blur = new BlurFilter({ quality: 3, strength: atRest.blur });
  camera.filters = [blur];
  const overlays = buildOverlays(app.stage, texture);
  return {
    ...overlays,
    app,
    blur,
    camera,
    current: 'day',
    layers,
    look,
    sway: { pan: 0, zoom: 1 },
  };
};

const setTime = async (world: World, time: Time): Promise<void> => {
  const from = world.layers.get(world.current);
  const to = world.layers.get(time);
  if (time === world.current || from === undefined || to === undefined) {
    return;
  }
  world.current = time;
  world.camera.setChildIndex(to, world.camera.children.length - 1);
  await gsap.fromTo(to, { alpha: 0 }, { alpha: 1, duration: 2.4, ease: 'sine.inOut' });
  from.alpha = 0;
};

const levelsFor = (away: boolean): Levels => {
  if (away) {
    return pushedAway;
  }
  return atRest;
};

const recede = async (world: World, away: boolean): Promise<void> => {
  const target = levelsFor(away);
  const motion = { duration: 1.2, ease: 'power2.inOut' };
  await Promise.all([
    gsap.to(world.blur, { ...motion, strength: target.blur }),
    gsap.to(world.shade, { ...motion, alpha: target.shade }),
    gsap.to(world.rain, { ...motion, alpha: target.rain }),
  ]);
};

const pulse = (world: World): void => {
  gsap.fromTo(
    world.glow,
    { alpha: glowLevel.rest },
    { alpha: glowLevel.peak, duration: 0.9, ease: 'sine.out', repeat: 1, yoyo: true },
  );
};

const start = async (request: Start): Promise<World> => {
  const world = await build(request);
  layout(world);
  animate(world);
  post({ kind: 'ready' });
  return world;
};

const act = async (world: World, request: Exclude<SceneRequest, Start>): Promise<void> => {
  if (request.kind === 'resize') {
    const { height, resolution, width } = request.screen;
    world.app.renderer.resize(width, height, resolution);
    layout(world);
  } else if (request.kind === 'pulse') {
    pulse(world);
  } else if (request.kind === 'time') {
    await setTime(world, request.time);
    post({ id: request.id, kind: 'done' });
  } else {
    await recede(world, request.away);
    post({ id: request.id, kind: 'done' });
  }
};

let ready: Promise<World> | null = null;

const relay = async (request: Exclude<SceneRequest, Start>): Promise<void> => {
  if (ready !== null) {
    await act(await ready, request);
  }
};

globalThis.addEventListener('message', (event: MessageEvent<SceneRequest>) => {
  const request = event.data;
  if (request.kind === 'start') {
    ready = start(request);
    return;
  }
  void relay(request);
});
