const idleTimeout = 2000;
const noIdleDelay = 300;
const sceneLimit = 15_000;

const waitFor = async (target: EventTarget, name: string): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<null>();
  target.addEventListener(
    name,
    () => {
      resolve(null);
    },
    { once: true },
  );
  await promise;
};

const shown = async (): Promise<void> => {
  if ('prerendering' in document && document.prerendering === true) {
    await waitFor(document, 'prerenderingchange');
  }
};

const loaded = async (): Promise<void> => {
  if (document.readyState !== 'complete') {
    await waitFor(globalThis, 'load');
  }
};

const pendingScene = '[data-scene]:not([data-ready="true"])';

const scenesReady = async (): Promise<void> => {
  if (document.querySelector(pendingScene) === null) {
    return;
  }
  const { promise, resolve } = Promise.withResolvers<null>();
  const observer = new MutationObserver(() => {
    if (document.querySelector(pendingScene) === null) {
      resolve(null);
    }
  });
  observer.observe(document.body, {
    attributeFilter: ['data-ready'],
    attributes: true,
    subtree: true,
  });
  const timer = setTimeout(() => {
    resolve(null);
  }, sceneLimit);
  await promise;
  observer.disconnect();
  clearTimeout(timer);
};

const quiet = async (): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<null>();
  if ('requestIdleCallback' in globalThis) {
    requestIdleCallback(
      () => {
        resolve(null);
      },
      { timeout: idleTimeout },
    );
  } else {
    setTimeout(() => {
      resolve(null);
    }, noIdleDelay);
  }
  await promise;
};

const idle = async (): Promise<void> => {
  await shown();
  await loaded();
  await scenesReady();
  await quiet();
};

export { idle, shown };
