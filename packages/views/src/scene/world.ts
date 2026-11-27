import {
  Application,
  Assets,
  BlurFilter,
  Container,
  RenderLayer,
  Sprite,
  Texture,
  TilingSprite,
} from 'pixi.js';

import { files } from './files';
import { cover, half, type Frame } from './frame';
import { arrange, dress, type Props } from './props';
import { type Motion, type SceneLook, type Start, type Time, times } from './protocol';
import { align, wetStreet, type Wet } from './wet';

type Setup = Omit<Start, 'port'>;
type Lookup = (path: string) => Texture;

interface Levels {
  readonly blur: number;
  readonly rain: number;
  readonly shade: number;
}

interface Overlays {
  readonly edge: Sprite;
  readonly glow: Sprite;
  readonly lit: RenderLayer;
  readonly rain: TilingSprite;
  readonly shade: Sprite;
}

interface World extends Overlays {
  readonly ambient: Array<gsap.core.Animation>;
  readonly app: Application;
  readonly blur: BlurFilter;
  readonly camera: Container;
  readonly layers: ReadonlyMap<Time, Sprite>;
  readonly look: SceneLook;
  readonly refs: string;
  readonly sway: { pan: number; zoom: number };
  cue: gsap.core.Timeline | null;
  current: Time;
  motion: Motion;
  props: Props;
  wet: Wet | null;
}

const ground = '#0b0a09';
const atRest: Levels = { blur: 0, rain: 0.55, shade: 0.2 };
const pushedAway: Levels = { blur: 14, rain: 0.2, shade: 0.62 };
const glowLevel = { peak: 0.75, rest: 0.35 };
const centred: Frame = { focusY: half, overscan: 1 };

const wanted = (look: SceneLook): Array<string> => {
  const optional: ReadonlyArray<readonly [boolean, string]> = [
    [look.glow, files.glow],
    [look.edge, files.vignette],
    [look.spirit !== null || look.lamps.length > 0, files.orb],
    [look.wet !== null, files.splash],
  ];
  return [files.scratches, ...optional.filter(([shown]) => shown).map(([, path]) => path)];
};

const loadTextures = async (refs: string, look: SceneLook): Promise<Lookup> => {
  const paths = [...new Set([look.scenes.day, ...wanted(look)])];
  const urlOf = (path: string): string => new URL(path, refs).href;
  const loaded = await Assets.load<Texture>(paths.map((path) => urlOf(path)));
  return (path) => loaded[urlOf(path)] ?? Texture.EMPTY;
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
  const lit = new RenderLayer();
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
  stage.addChild(shade, lit, rain, glow, edge);
  return { edge, glow, lit, rain, shade };
};

const fill = async (world: World, time: Time, sprite: Sprite): Promise<void> => {
  if (sprite.texture !== Texture.EMPTY) {
    return;
  }
  sprite.texture = await Assets.load<Texture>(new URL(world.look.scenes[time], world.refs).href);
  cover(sprite, world.app.screen, world.look);
};

const rearrange = (world: World): void => {
  const scene = world.layers.get('day');
  if (scene !== undefined) {
    arrange(world.props, { look: world.look, scene, width: world.app.screen.width });
    if (world.wet !== null) {
      align(world.wet, scene);
    }
  }
};

const layout = (world: World): void => {
  const { screen } = world.app;
  for (const sprite of world.layers.values()) {
    cover(sprite, screen, world.look);
  }
  rearrange(world);
  world.shade.setSize(screen.width, screen.height);
  world.rain.setSize(screen.width, screen.height);
  world.rain.tileScale.set(screen.height / world.rain.texture.height);
  cover(world.glow, screen, centred);
  cover(world.edge, screen, centred);
  world.camera.pivot.set(screen.width * half, screen.height * half);
};

const dressScene = (world: World, scene: Sprite, texture: Lookup): void => {
  const { ambient, lit: layer, look } = world;
  const { width } = world.app.screen;
  world.wet = wetStreet(scene, look, texture(files.splash));
  if (world.wet !== null) {
    world.camera.addChild(world.wet.holder, world.wet.drops);
  }
  world.props = dress({ ambient, layer, look, orb: texture(files.orb), scene, width });
  rearrange(world);
};

const furnish = (world: World, texture: Lookup): void => {
  const scene = world.layers.get('day');
  world.glow.visible = world.look.glow;
  world.edge.visible = world.look.edge;
  if (world.look.dark) {
    world.shade.alpha = 1;
  }
  if (scene !== undefined) {
    dressScene(world, scene, texture);
  }
};

const build = async ({ canvas, look, refs, screen }: Setup): Promise<World> => {
  const app = new Application();
  const [texture] = await Promise.all([
    loadTextures(refs, look),
    app.init({ antialias: true, background: ground, canvas, preference: 'webgpu', ...screen }),
  ]);
  const blur = new BlurFilter({ quality: 3, strength: atRest.blur });
  const camera = new Container({ filters: [blur] });
  app.stage.addChild(camera);
  const world: World = {
    ...buildOverlays(app.stage, texture),
    ambient: [],
    app,
    blur,
    camera,
    cue: null,
    current: 'day',
    layers: buildLayers(camera, look, texture),
    look,
    motion: 'full',
    props: { lamps: [], spirits: [] },
    refs,
    sway: { pan: 0, zoom: 1 },
    wet: null,
  };
  layout(world);
  furnish(world, texture);
  return world;
};

export { atRest, build, fill, glowLevel, layout, pushedAway, type Levels, type Setup, type World };
