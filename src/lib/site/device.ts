type Platform = 'chromeos' | 'mac' | 'pc' | 'touch';

interface Clues {
  readonly agent: string;
  readonly finePointer: boolean;
  readonly hint: string;
  readonly touchPoints: number;
}

const platformOf = ({ agent, finePointer, hint, touchPoints }: Clues): Platform => {
  const named = hint || agent;
  const mac = /mac/iu.test(named);
  if (/android|iphone|ipad|ipod/iu.test(named) || !finePointer || (mac && touchPoints > 1)) {
    return 'touch';
  }
  if (mac) {
    return 'mac';
  }
  if (/cros|chrome os|chromium os/iu.test(named)) {
    return 'chromeos';
  }
  return 'pc';
};

const cluesOf = (): Clues => {
  const data: unknown = Reflect.get(navigator, 'userAgentData');
  let hint = '';
  if (typeof data === 'object' && data !== null && 'platform' in data) {
    hint = String(data.platform);
  }
  return {
    agent: navigator.userAgent,
    finePointer: globalThis.matchMedia('(any-pointer: fine)').matches,
    hint,
    touchPoints: navigator.maxTouchPoints,
  };
};

const thisPlatform = (): Platform => platformOf(cluesOf());

const fullscreenKeys = {
  chromeos: 'key.fullscreen.chromeos',
  mac: 'key.fullscreen.mac',
  pc: 'key.fullscreen.pc',
} as const satisfies Readonly<Record<Exclude<Platform, 'touch'>, string>>;

export { fullscreenKeys, platformOf, thisPlatform, type Clues, type Platform };
