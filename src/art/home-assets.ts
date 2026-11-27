import { refsRoute } from './refs';
import { files } from './scene/files';
import { storefront } from './scene/stage';
import { preloads } from './sound-tracks';

const fromRoute = (href: string): string => href.slice(refsRoute.length + 1);

const homeAssets: ReadonlyArray<string> = [
  storefront,
  files.scratches,
  files.orb,
  files.splash,
  ...preloads('home').map(fromRoute),
];

export { homeAssets };
