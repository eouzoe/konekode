import { CacheFirst, ExpirationPlugin, Serwist, StaleWhileRevalidate } from 'serwist';

const daySeconds = 86_400;
const keptDays = 60;
const keptAssets = 300;
const assets = '/_astro/';
const compiler = /\/(?:llvm[^/]*|[^/]*\.tar)$/u;

const isPage = (url: URL, request: Request): boolean =>
  request.method === 'GET' &&
  (request.mode === 'navigate' ||
    (url.pathname.endsWith('/') && !url.pathname.startsWith('/api/')));

const isAsset = (url: URL): boolean =>
  url.pathname.startsWith(assets) && !compiler.test(url.pathname);

const serwist = new Serwist({
  clientsClaim: true,
  runtimeCaching: [
    {
      handler: new StaleWhileRevalidate({ cacheName: 'pages', matchOptions: { ignoreVary: true } }),
      matcher: ({ request, sameOrigin, url }) => sameOrigin && isPage(url, request),
    },
    {
      handler: new CacheFirst({
        cacheName: 'assets',
        plugins: [
          new ExpirationPlugin({ maxAgeSeconds: keptDays * daySeconds, maxEntries: keptAssets }),
        ],
      }),
      matcher: ({ sameOrigin, url }) => sameOrigin && isAsset(url),
    },
  ],
  skipWaiting: true,
});

serwist.addEventListeners();
