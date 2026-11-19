import { siteMode } from '@/lib/mode';
import { type Data } from '@/lib/record/event';
import { isFullScreen } from '@/lib/scene/conditions';

const versionPattern = /^[0-9a-z.-]{1,40}$/u;
const unknownVersion = 'dev';

const siteVersion = (): string => {
  const declared: unknown = import.meta.env.PUBLIC_SITE_VERSION;
  if (typeof declared === 'string' && versionPattern.test(declared)) {
    return declared;
  }
  return unknownVersion;
};

const compilerVersion = (): string => {
  const declared: unknown = import.meta.env.PUBLIC_COMPILER;
  if (typeof declared === 'string') {
    return declared;
  }
  return unknownVersion;
};

const replayWanted = (): boolean => import.meta.env.PUBLIC_REPLAY === 'on';

const matches = (query: string): boolean => globalThis.matchMedia(query).matches;

const colourScheme = (): string => {
  if (globalThis.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

const environment = (site: string): Data => ({
  agent: navigator.userAgent,
  coarsePointer: matches('(pointer: coarse)'),
  colourScheme: colourScheme(),
  compiler: compilerVersion(),
  cores: navigator.hardwareConcurrency,
  fullscreen: isFullScreen(),
  language: navigator.language,
  languages: navigator.languages.join(','),
  mode: siteMode(),
  path: globalThis.location.pathname,
  pixelRatio: globalThis.devicePixelRatio,
  reducedMotion: matches('(prefers-reduced-motion: reduce)'),
  referrer: document.referrer,
  replay: replayWanted(),
  screenHeight: globalThis.screen.height,
  screenWidth: globalThis.screen.width,
  site,
  timezone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
  touchPoints: navigator.maxTouchPoints,
  viewportHeight: globalThis.innerHeight,
  viewportWidth: globalThis.innerWidth,
});

export { environment, replayWanted, siteVersion };
