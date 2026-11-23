import { type Keyboard } from './keyboard';

type Handler = (key: string) => Promise<boolean> | boolean;

const ignored = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab']);

const isChord = (event: KeyboardEvent): boolean => event.ctrlKey || event.metaKey || event.altKey;

const listen = async (keyboard: Keyboard, live: () => boolean, handle: Handler): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<null>();
  const controller = new AbortController();
  const finish = (): void => {
    controller.abort();
    resolve(null);
  };
  const onKey = async (event: KeyboardEvent): Promise<void> => {
    if (event.key === 'Shift') {
      keyboard.down('Shift');
    }
    if (isChord(event) || ignored.has(event.key)) {
      return;
    }
    event.preventDefault();
    if ((await handle(event.key)) && live()) {
      finish();
    }
  };
  const { signal } = controller;
  document.addEventListener(
    'keydown',
    (event) => {
      if (!live()) {
        finish();
        return;
      }
      void onKey(event);
    },
    { signal },
  );
  document.addEventListener(
    'keyup',
    (event) => {
      if (event.key === 'Shift') {
        keyboard.up('Shift');
      }
    },
    { signal },
  );
  await promise;
};

const waitForNext = async (skip: string): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<null>();
  const controller = new AbortController();
  const go = (event: Event): void => {
    if (event.target instanceof Element && event.target.closest(skip) !== null) {
      return;
    }
    controller.abort();
    resolve(null);
  };
  document.addEventListener('keydown', go, { signal: controller.signal });
  document.addEventListener('pointerdown', go, { signal: controller.signal });
  await promise;
};

export { listen, waitForNext };
