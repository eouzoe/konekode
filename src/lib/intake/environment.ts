import { type Data } from '@/lib/record/event';

const versionPattern = /^[0-9a-z.-]{1,40}$/u;
const unknownVersion = 'dev';

const siteVersion = (): string => {
  const declared: unknown = import.meta.env.PUBLIC_SITE_VERSION;
  if (typeof declared === 'string' && versionPattern.test(declared)) {
    return declared;
  }
  return unknownVersion;
};

const colourScheme = (): string => {
  if (globalThis.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

const environment = (site: string): Data => ({
  agent: navigator.userAgent,
  colourScheme: colourScheme(),
  cores: navigator.hardwareConcurrency,
  language: navigator.language,
  languages: navigator.languages.join(','),
  path: globalThis.location.pathname,
  pixelRatio: globalThis.devicePixelRatio,
  referrer: document.referrer,
  screenHeight: globalThis.screen.height,
  screenWidth: globalThis.screen.width,
  site,
  timezone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
  touchPoints: navigator.maxTouchPoints,
  viewportHeight: globalThis.innerHeight,
  viewportWidth: globalThis.innerWidth,
});

export { environment, siteVersion };
