import { guard } from '@/lib/fault/fault';

import { siteVersion } from './version';

const key = 'reloaded-for-stale-code';
const gone = 404;
const scriptAddress = /https?:\/\/[^\s'"]+\.js/u;

const alreadyTried = (): boolean => {
  try {
    if (sessionStorage.getItem(key) === siteVersion()) {
      return true;
    }
    sessionStorage.setItem(key, siteVersion());
    return false;
  } catch {
    return true;
  }
};

const isGone = async (address: string): Promise<boolean> => {
  try {
    const answer = await fetch(address, { cache: 'no-store', method: 'HEAD' });
    return answer.status === gone;
  } catch {
    return false;
  }
};

const reloadIfGone = async (failure: unknown): Promise<void> => {
  const address = scriptAddress.exec(String(failure))?.[0];
  if (address === undefined || !(await isGone(address))) {
    return;
  }
  if (document.visibilityState === 'visible' && !alreadyTried()) {
    globalThis.location.reload();
  }
};

const reloadOnStaleCode = (): void => {
  globalThis.addEventListener('vite:preloadError', (event) => {
    guard('stale', reloadIfGone(Reflect.get(event, 'payload')));
  });
};

export { reloadOnStaleCode };
