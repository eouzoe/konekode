import { Container, DisplacementFilter, Rectangle, Sprite, Texture } from 'pixi.js';

import { type SceneLook } from './protocol';

interface Splashes {
  readonly frames: readonly Texture[];
  readonly sprites: readonly Sprite[];
  clock: number;
}

interface Wet {
  readonly drops: Container;
  readonly filter: DisplacementFilter;
  readonly holder: Container;
  readonly map: Sprite;
  readonly splashes: Splashes;
}

const field = { height: 128, width: 512 };
const pixel = { channels: 4, neutral: 128, opaque: 255 };
const swing = { across: 70, down: 26 };
const surface = { calm: 0.18, deepen: 1.5 };
const waves = [
  { cycles: 3, lean: 1.7, weight: 0.5 },
  { cycles: 7, lean: 4.1, weight: 0.32 },
  { cycles: 13, lean: 9.3, weight: 0.18 },
];
const turn = Math.PI + Math.PI;
const strength = { across: 20, down: 6 };
const tiles = 2;
const drift = 0.6;
const sheet = { columns: 6, count: 60, height: 110, width: 550 };
const splashLook = {
  alpha: 0.5,
  copies: [{ mirrored: false }, { mirrored: true }],
  fps: 30,
  tint: '#ffe6cc',
};
const ticksPerSecond = 60;

const envelope = (row: number): number => {
  const depth = (row / field.height - surface.calm) / (1 - surface.calm);
  return Math.max(0, Math.min(1, depth)) ** surface.deepen;
};

const wave = (column: number, row: number): number =>
  waves.reduce(
    (sum, { cycles, lean, weight }) =>
      sum +
      weight * Math.sin(turn * ((cycles * column) / field.width) + (lean * row) / field.height),
    0,
  );

const rippleImage = (): ImageData => {
  const image = new ImageData(field.width, field.height);
  for (let row = 0; row < field.height; row += 1) {
    const reach = envelope(row);
    for (let column = 0; column < field.width; column += 1) {
      const across = pixel.neutral + swing.across * wave(column, row) * reach;
      const down = pixel.neutral + swing.down * wave(column + field.height, row) * reach;
      image.data.set(
        [across, down, pixel.neutral, pixel.opaque],
        (row * field.width + column) * pixel.channels,
      );
    }
  }
  return image;
};

const rippleTexture = (): Texture => {
  const canvas = new OffscreenCanvas(field.width, field.height);
  canvas.getContext('2d')?.putImageData(rippleImage(), 0, 0);
  const texture = Texture.from(canvas);
  texture.source.addressMode = 'repeat';
  return texture;
};

const puddleOf = (scene: Sprite, look: SceneLook, top: number): Sprite => {
  const { height, source, width } = scene.texture;
  const frame = new Rectangle(0, top, width, height - top);
  const puddle = new Sprite({ texture: new Texture({ frame, source }) });
  puddle.position.set(-look.focusX * width, top - look.focusY * height);
  return puddle;
};

const mapOver = (puddle: Sprite): Sprite => {
  const map = new Sprite({ texture: rippleTexture() });
  map.position.copyFrom(puddle.position);
  map.setSize(puddle.width / tiles, puddle.height);
  return map;
};

const framesOf = (atlas: Texture): Texture[] =>
  Array.from(Array.from({ length: sheet.count }).keys(), (index) => {
    const across = (index % sheet.columns) * sheet.width;
    const down = Math.floor(index / sheet.columns) * sheet.height;
    const frame = new Rectangle(across, down, sheet.width, sheet.height);
    return new Texture({ frame, source: atlas.source });
  });

const offsetOf = (copy: number): number =>
  Math.floor((copy * sheet.count) / splashLook.copies.length) % sheet.count;

const splashesOver = (puddle: Sprite, atlas: Texture): Splashes => {
  const frames = framesOf(atlas);
  const width = puddle.width / splashLook.copies.length;
  const height = (width * sheet.height) / sheet.width;
  const sprites = splashLook.copies.map(({ mirrored }, copy) => {
    const sprite = new Sprite({
      alpha: splashLook.alpha,
      blendMode: 'add',
      texture: frames[offsetOf(copy)] ?? Texture.EMPTY,
      tint: splashLook.tint,
    });
    sprite.setSize(width, height);
    sprite.position.set(puddle.x + copy * width, puddle.y + puddle.height - height);
    if (mirrored) {
      sprite.position.set(sprite.position.x + width, sprite.position.y);
      sprite.scale.set(-sprite.scale.x, sprite.scale.y);
    }
    return sprite;
  });
  return { clock: 0, frames, sprites };
};

const wetStreet = (scene: Sprite, look: SceneLook, atlas: Texture): Wet | null => {
  if (look.wet === null) {
    return null;
  }
  const puddle = puddleOf(scene, look, look.wet * scene.texture.height);
  const map = mapOver(puddle);
  const filter = new DisplacementFilter({ sprite: map });
  filter.scale.set(strength.across, strength.down);
  const holder = new Container({ children: [map, puddle], filters: [filter] });
  const splashes = splashesOver(puddle, atlas);
  const drops = new Container({ children: [...splashes.sprites] });
  return { drops, filter, holder, map, splashes };
};

const align = (wet: Wet, scene: Sprite): void => {
  for (const layer of [wet.holder, wet.drops]) {
    layer.position.copyFrom(scene.position);
    layer.scale.copyFrom(scene.scale);
  }
};

const splash = (splashes: Splashes, step: number): void => {
  splashes.clock += step / ticksPerSecond;
  const frame = Math.floor(splashes.clock * splashLook.fps);
  for (const [copy, sprite] of splashes.sprites.entries()) {
    sprite.texture = splashes.frames[(frame + offsetOf(copy)) % sheet.count] ?? sprite.texture;
  }
};

const ripple = (wet: Wet, step: number): void => {
  wet.map.position.set(wet.map.position.x + drift * step, wet.map.position.y);
  splash(wet.splashes, step);
};

export { align, ripple, wetStreet, type Wet };
