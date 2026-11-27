import { Schema } from 'effect';

const decodeCore = Schema.decodeUnknownSync(
  Schema.Record(Schema.String, Schema.Array(Schema.String)),
);

const sameOrigin = (address: string): boolean => {
  try {
    return new URL(address, location.href).origin === location.origin;
  } catch {
    return false;
  }
};

const nextPages = async (): Promise<Array<string>> => {
  const paths = [...document.querySelectorAll<HTMLAnchorElement>('a[data-prepare]')].map(
    (link) => new URL(link.href).pathname,
  );
  if (paths.length === 0) {
    return [];
  }
  const response = await fetch('/core.json');
  const core = decodeCore(await response.json());
  return [...paths, ...paths.flatMap((path) => core[path] ?? [])];
};

const keep = (worker: ServiceWorker | null, addresses: ReadonlyArray<string>): void => {
  const urlsToCache = addresses.filter((address) => sameOrigin(address));
  if (urlsToCache.length > 0) {
    worker?.postMessage({ payload: { urlsToCache }, type: 'CACHE_URLS' });
  }
};

const keepOffline = async (): Promise<void> => {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
    return;
  }
  await navigator.serviceWorker.register('/sw.js');
  const { active } = await navigator.serviceWorker.ready;
  new PerformanceObserver((list) => {
    keep(
      active,
      list.getEntries().map((entry) => entry.name),
    );
  }).observe({ buffered: true, type: 'resource' });
  keep(active, [`${location.origin}${location.pathname}`, ...(await nextPages())]);
};

export { keepOffline };
