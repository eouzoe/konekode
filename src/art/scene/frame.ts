import type { Size } from './protocol';
import type { Sprite } from 'pixi.js';

interface Frame {
  readonly focusX?: number;
  readonly focusY: number;
  readonly overscan: number;
}

const half = 0.5;

const cover = (sprite: Sprite, screen: Size, frame: Frame): void => {
  const fit = Math.max(screen.width / sprite.texture.width, screen.height / sprite.texture.height);
  const focusX = frame.focusX ?? half;
  sprite.scale.set(fit * frame.overscan);
  sprite.anchor.set(focusX, frame.focusY);
  sprite.position.set(screen.width * focusX, screen.height * frame.focusY);
};

export { cover, half, type Frame };
