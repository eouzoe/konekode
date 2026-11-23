import type { Keyboard } from './keyboard';

type Handler = (key: string) => Promise<boolean> | boolean;

const ignored = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab']);

const isChord = (event: KeyboardEvent): boolean => event.ctrlKey || event.metaKey || event.altKey;

const attach = (
  keyboard: Keyboard,
  onKey: (event: KeyboardEvent) => Promise<void>,
  options: AddEventListenerOptions,
): void => {
  document.addEventListener(
    'keydown',
    (event) => {
      void onKey(event);
    },
    options,
  );
  document.addEventListener(
    'keyup',
    (event) => {
      if (event.key === 'Shift') {
        keyboard.up('Shift');
      }
    },
    options,
  );
};

const listen = async (keyboard: Keyboard, signal: AbortSignal, handle: Handler): Promise<void> => {
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
    if (await handle(event.key)) {
      finish();
    }
  };
  const listening = { signal: controller.signal };
  signal.addEventListener('abort', finish, listening);
  attach(keyboard, onKey, listening);
  if (signal.aborted) {
    finish();
  }
  await promise;
};

export { listen };
