import { isbot } from 'isbot';

import { guard } from '@/lib/fault/fault';

import { idle } from './moment';

type Supply = () => Promise<void>;

const supplies: Readonly<Record<string, Supply>> = {
  compiler: async () => {
    const { prefetchCompiler } = await import('@/lib/run/prefetch');
    await prefetchCompiler();
  },
};

const touches = ['focusin', 'keydown', 'pointerdown'] as const;

const online = async (): Promise<void> => {
  if (navigator.onLine) {
    return;
  }
  const { promise, resolve } = Promise.withResolvers<null>();
  globalThis.addEventListener(
    'online',
    () => {
      resolve(null);
    },
    { once: true },
  );
  await promise;
};

const supplyOnline = async (supply: Supply): Promise<void> => {
  await online();
  await supply();
};

const supplyAll = (names: string): void => {
  for (const name of names.split(' ')) {
    const supply = supplies[name];
    if (supply !== undefined) {
      guard(`prefetch.${name}`, supplyOnline(supply));
    }
  }
};

const whenTouched = (element: HTMLElement, names: string): void => {
  const controller = new AbortController();
  const start = (): void => {
    controller.abort();
    supplyAll(names);
  };
  for (const type of touches) {
    element.addEventListener(type, start, {
      passive: true,
      signal: controller.signal,
    });
  }
};

const whenSettled = async (names: string): Promise<void> => {
  await idle();
  supplyAll(names);
};

const watch = (element: HTMLElement): void => {
  const names = element.dataset.prefetch ?? '';
  if (element.dataset.prefetchOn === 'touch') {
    whenTouched(element, names);
    return;
  }
  guard('prefetch', whenSettled(names));
};

const watchIntents = (agent: string): void => {
  if (isbot(agent)) {
    return;
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-prefetch]')) {
    watch(element);
  }
};

export { watchIntents };
