const times = ['day', 'dusk', 'overcast', 'night'] as const;
type Time = (typeof times)[number];

interface SceneLook {
  readonly flicker: boolean;
  readonly focusY: number;
  readonly overscan: number;
  readonly scenes: Readonly<Record<Time, string>>;
}

interface Size {
  readonly height: number;
  readonly width: number;
}

interface Screen extends Size {
  readonly resolution: number;
}

type SceneRequest =
  | {
      readonly canvas: OffscreenCanvas;
      readonly kind: 'start';
      readonly look: SceneLook;
      readonly refs: string;
      readonly screen: Screen;
    }
  | { readonly kind: 'resize'; readonly screen: Screen }
  | { readonly id: number; readonly kind: 'time'; readonly time: Time }
  | { readonly away: boolean; readonly id: number; readonly kind: 'recede' }
  | { readonly kind: 'pulse' };

type SceneReply = { readonly id: number; readonly kind: 'done' } | { readonly kind: 'ready' };

export {
  times,
  type SceneLook,
  type SceneReply,
  type SceneRequest,
  type Screen,
  type Size,
  type Time,
};
