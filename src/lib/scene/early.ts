import { readIntent } from './keys';

type Early = () => boolean;

const listenEarly = (root: HTMLElement): Early => {
  const controller = new AbortController();
  const { signal } = controller;
  let pressed = false;
  document.addEventListener(
    'keydown',
    (event) => {
      if (readIntent(event) === 'forward') {
        pressed = true;
      }
    },
    { signal },
  );
  root.querySelector('[data-role="dialogue"]')?.addEventListener(
    'click',
    () => {
      pressed = true;
    },
    { signal },
  );
  return () => {
    controller.abort();
    return pressed;
  };
};

export { listenEarly, type Early };
