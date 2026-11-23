const times = ['day', 'dusk', 'overcast', 'night'] as const;
type Time = (typeof times)[number];

type Motion = 'full' | 'reduced';
type Mark = 'revealing';

const timed = (motion: Motion, seconds: number): number => {
  if (motion === 'reduced') {
    return 0;
  }
  return seconds;
};

interface Spot {
  readonly across: number;
  readonly down: number;
}

interface SceneLook {
  readonly dark: boolean;
  readonly edge: boolean;
  readonly flicker: boolean;
  readonly focusX: number;
  readonly focusY: number;
  readonly glow: boolean;
  readonly lamps: readonly Spot[];
  readonly overscan: number;
  readonly scenes: Readonly<Record<Time, string>>;
  readonly spirit: Spot | null;
  readonly wet: number | null;
}

interface Size {
  readonly height: number;
  readonly width: number;
}

interface Screen extends Size {
  readonly resolution: number;
}

interface Start {
  readonly canvas: OffscreenCanvas;
  readonly look: SceneLook;
  readonly port: MessagePort;
  readonly refs: string;
  readonly screen: Screen;
}

interface SceneCalls {
  readonly finish: () => Promise<void>;
  readonly leave: () => Promise<void>;
  readonly light: (instant: boolean) => Promise<void>;
  readonly motion: (motion: Motion) => Promise<void>;
  readonly pulse: () => Promise<void>;
  readonly recede: (away: boolean) => Promise<void>;
  readonly resize: (screen: Screen) => Promise<void>;
  readonly setTime: (time: Time) => Promise<void>;
}

interface PageCalls {
  readonly mark: (name: Mark) => void;
}

export {
  timed,
  times,
  type Mark,
  type Motion,
  type PageCalls,
  type SceneCalls,
  type SceneLook,
  type Screen,
  type Size,
  type Spot,
  type Start,
  type Time,
};
