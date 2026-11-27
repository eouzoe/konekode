import { gsap } from 'gsap';
import { Container, type RenderLayer, Sprite, type Texture } from 'pixi.js';

import { half } from './frame';

import type { Mark, SceneLook, Spot } from './protocol';

interface Lamp {
  readonly bulb: Sprite;
  readonly dusk: Sprite;
  readonly pool: Sprite;
}

interface Props {
  readonly lamps: ReadonlyArray<Lamp>;
  readonly spirits: ReadonlyArray<Container>;
}

interface Lighting {
  readonly mark: (name: Mark) => void;
  readonly rest: number;
}

interface Placing {
  readonly look: SceneLook;
  readonly scene: Sprite;
  readonly width: number;
}

interface Dressing extends Placing {
  readonly ambient: Array<gsap.core.Animation>;
  readonly layer: RenderLayer;
  readonly orb: Texture;
}

const level = { lit: 1, unlit: 0 };
const orbLook = { bob: 0.12, halo: 3.2, size: 0.032 };
const lampLook = { bulb: 0.035, drop: 0.07, pool: 0.15, poolLit: 0.16, tall: 1.35 };
const breath = { least: 2.6, size: 1.08, spread: 0.45, stagger: 0.7 };
const lampInk = { dark: '#000000', warm: '#ffb36b' };
const fit = { margin: 0.14 };
const cue = { first: 0.15, flash: 0.06, gap: 0.16, settle: 0.12 };
const reveal = { at: 0.35, length: 1.1 };
const flutterSteps = [
  { at: 0, bulb: 0.12, dusk: 0.42, pool: 0.04, span: 0.04 },
  { at: 0.08, bulb: 0.85, dusk: 0.08, pool: 0.25, span: 0.07 },
  { at: 0.2, bulb: 0.2, dusk: 0.35, pool: 0.06, span: 0.05 },
  { at: 0.32, bulb: level.lit, dusk: level.unlit, pool: lampLook.poolLit, span: 0.5 },
];

const place = (placing: Placing, spot: Spot): Spot => ({
  across: (spot.across - placing.look.focusX) * placing.scene.texture.width,
  down: (spot.down - placing.look.focusY) * placing.scene.texture.height,
});

const seen = (placing: Placing): number =>
  placing.width / (placing.scene.scale.x * placing.scene.texture.width);

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

const placeLamp = (placing: Placing, lamp: Lamp, spot: Spot): void => {
  const at = place(placing, spot);
  const below = at.down + lampLook.drop * placing.scene.texture.height;
  lamp.bulb.position.set(at.across, at.down);
  lamp.pool.position.set(at.across, below);
  lamp.dusk.position.set(at.across, below);
};

const arrangeLamps = (placing: Placing, lamps: ReadonlyArray<Lamp>): void => {
  for (const [index, spot] of placing.look.lamps.entries()) {
    const lamp = lamps[index];
    if (lamp !== undefined) {
      placeLamp(placing, lamp, spot);
    }
  }
};

const arrangeSpirits = (placing: Placing, spirits: ReadonlyArray<Container>): void => {
  const { focusX, spirit } = placing.look;
  if (spirit === null) {
    return;
  }
  const reach = seen(placing) * half * (1 - fit.margin);
  const across = clamp(spirit.across, focusX - reach, focusX + reach);
  const spot = place(placing, { across, down: spirit.down });
  for (const item of spirits) {
    item.position.set(spot.across, spot.down);
  }
};

const arrange = (props: Props, placing: Placing): void => {
  arrangeLamps(placing, props.lamps);
  arrangeSpirits(placing, props.spirits);
};

const disc = (texture: Texture, size: number): Sprite => {
  const sprite = new Sprite({ anchor: half, blendMode: 'add', texture });
  sprite.setSize(size, size);
  return sprite;
};

const poolOf = (texture: Texture, width: number): Sprite => {
  const pool = disc(texture, lampLook.pool * width);
  pool.tint = lampInk.warm;
  pool.height *= lampLook.tall;
  return pool;
};

const buildLamp = (dressing: Dressing): Lamp => {
  const { width } = dressing.scene.texture;
  const bulb = disc(dressing.orb, lampLook.bulb * width);
  const pool = poolOf(dressing.orb, width);
  const dusk = new Sprite({ anchor: half, texture: dressing.orb, tint: lampInk.dark });
  dusk.setSize(pool.width, pool.height);
  for (const sprite of [bulb, pool, dusk]) {
    sprite.alpha = level.unlit;
  }
  dressing.scene.addChild(dusk, pool, bulb);
  return { bulb, dusk, pool };
};

const bob = (item: Container, height: number): gsap.core.Tween => {
  const float = { lift: 0 };
  return gsap.to(float, {
    duration: 2.6,
    ease: 'sine.inOut',
    lift: height,
    onUpdate: () => {
      item.position.set(0, -float.lift);
    },
    repeat: -1,
    yoyo: true,
  });
};

const buildOrb = (dressing: Dressing): Container => {
  const size = orbLook.size * dressing.scene.texture.width;
  const halo = new Container({
    children: [disc(dressing.orb, size * orbLook.halo), disc(dressing.orb, size)],
  });
  dressing.ambient.push(bob(halo, size * orbLook.bob));
  const orb = new Container({ alpha: 0, children: [halo] });
  dressing.scene.addChild(orb);
  return orb;
};

const spiritsOf = (dressing: Dressing): Array<Container> => {
  if (dressing.look.spirit === null) {
    return [];
  }
  return [buildOrb(dressing)];
};

const breathe = (pool: Sprite, index: number): gsap.core.Tween => {
  const base = pool.scale.clone();
  const swell = { size: 1 };
  return gsap.to(swell, {
    delay: index * breath.stagger,
    duration: breath.least + index * breath.spread,
    ease: 'sine.inOut',
    onUpdate: () => {
      pool.scale.set(base.x * swell.size, base.y * swell.size);
    },
    repeat: -1,
    size: breath.size,
    yoyo: true,
  });
};

const dress = (dressing: Dressing): Props => {
  const lamps = dressing.look.lamps.map(() => buildLamp(dressing));
  for (const [index, lamp] of lamps.entries()) {
    dressing.ambient.push(breathe(lamp.pool, index));
  }
  const spirits = spiritsOf(dressing);
  dressing.layer.attach(...lamps.flatMap((lamp) => [lamp.dusk, lamp.pool, lamp.bulb]), ...spirits);
  return { lamps, spirits };
};

const lampOn = (timeline: gsap.core.Timeline, lamp: Lamp, start: number): void => {
  timeline
    .to(lamp.bulb, { alpha: 0.75, duration: 0.05 }, start)
    .to(lamp.bulb, { alpha: 0.2, duration: 0.06 }, start + cue.flash)
    .to(lamp.bulb, { alpha: level.lit, duration: 0.3, ease: 'power2.out' }, start + cue.settle)
    .to(
      lamp.pool,
      { alpha: lampLook.poolLit, duration: 0.6, ease: 'power2.out' },
      start + cue.settle,
    );
};

const lightUp = (props: Props, shade: Sprite, { mark, rest }: Lighting): gsap.core.Timeline => {
  const timeline = gsap.timeline();
  for (const [at, lamp] of props.lamps.entries()) {
    lampOn(timeline, lamp, cue.first + at * cue.gap);
  }
  timeline.call(
    () => {
      mark('revealing');
    },
    [],
    reveal.at,
  );
  timeline.to(shade, { alpha: rest, duration: reveal.length, ease: 'power2.inOut' }, reveal.at);
  if (props.spirits.length > 0) {
    timeline.to(props.spirits, { alpha: 1, duration: 0.8, ease: 'sine.out' }, '>-0.6');
  }
  return timeline;
};

const lightNow = (props: Props, shade: Sprite, rest: number): void => {
  shade.alpha = rest;
  for (const lamp of props.lamps) {
    lamp.bulb.alpha = level.lit;
    lamp.pool.alpha = lampLook.poolLit;
  }
  for (const spirit of props.spirits) {
    spirit.alpha = level.lit;
  }
};

const flutter = (lamp: Lamp): gsap.core.Timeline => {
  const timeline = gsap.timeline();
  for (const step of flutterSteps) {
    timeline
      .to(lamp.bulb, { alpha: step.bulb, duration: step.span }, step.at)
      .to(lamp.pool, { alpha: step.pool, duration: step.span }, step.at)
      .to(lamp.dusk, { alpha: step.dusk, duration: step.span }, step.at);
  }
  return timeline;
};

export { arrange, dress, flutter, lightNow, lightUp, type Lamp, type Props };
