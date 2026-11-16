import { track } from '@/lib/record/current';

const plainText = /^[ -~]*$/u;
const resizeGap = 1000;

const place = (target: EventTarget | null): string => {
  if (!(target instanceof Element)) {
    return 'page';
  }
  if (target.closest('[data-role="stdin"]') !== null) {
    return 'stdin';
  }
  if (target.closest('[data-code-runner]') !== null) {
    return 'editor';
  }
  if (target.closest('[data-typing-drill]') !== null) {
    return 'drill';
  }
  return 'page';
};

const noteKey = (event: KeyboardEvent): void => {
  track('key.down', {
    data: {
      alt: event.altKey,
      code: event.code,
      composing: event.isComposing,
      ctrl: event.ctrlKey,
      key: event.key,
      meta: event.metaKey,
      place: place(event.target),
      repeat: event.repeat,
      shift: event.shiftKey,
    },
  });
};

const noteInput = (event: InputEvent): void => {
  const data = event.data ?? '';
  if (event.isComposing || !plainText.test(data)) {
    track('input.unusual', {
      data: {
        composing: event.isComposing,
        place: place(event.target),
        text: data,
        type: event.inputType,
      },
    });
  }
};

const noteComposition = (event: CompositionEvent): void => {
  track('input.composition', {
    data: { phase: event.type, place: place(event.target), text: event.data },
  });
};

const notePointer = (event: PointerEvent): void => {
  track('pointer.down', {
    data: {
      button: event.button,
      kind: event.pointerType,
      left: Math.round(event.clientX),
      place: place(event.target),
      top: Math.round(event.clientY),
    },
  });
};

const noteSize = (): void => {
  track('page.resized', {
    data: {
      fullscreen: globalThis.matchMedia('(display-mode: fullscreen)').matches,
      height: globalThis.innerHeight,
      width: globalThis.innerWidth,
    },
  });
};

const watchInput = (): void => {
  const options = { capture: true, passive: true };
  document.addEventListener('keydown', noteKey, options);
  document.addEventListener('beforeinput', noteInput, options);
  document.addEventListener('compositionstart', noteComposition, options);
  document.addEventListener('compositionend', noteComposition, options);
  document.addEventListener('pointerdown', notePointer, options);
};

const watchWindow = (): void => {
  let resized = 0;
  document.addEventListener('visibilitychange', () => {
    track('page.visibility', { data: { state: document.visibilityState } });
  });
  globalThis.addEventListener('blur', () => {
    track('page.focus', { data: { focused: false } });
  });
  globalThis.addEventListener('focus', () => {
    track('page.focus', { data: { focused: true } });
  });
  globalThis.addEventListener('resize', (event) => {
    if (event.timeStamp - resized >= resizeGap) {
      resized = event.timeStamp;
      noteSize();
    }
  });
};

const watchPage = (): void => {
  watchInput();
  watchWindow();
};

export { watchPage };
