interface Reveal {
  readonly finish: () => void;
  readonly start: (element: HTMLElement, done: () => void) => void;
}

interface State {
  full: string;
  target: HTMLElement | null;
  timer: ReturnType<typeof setInterval> | null;
}

const pace = 30;
const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' });

const isCalm = (): boolean => globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

const stop = (state: State): void => {
  if (state.timer !== null) {
    clearInterval(state.timer);
    state.timer = null;
  }
  if (state.target !== null) {
    state.target.textContent = state.full;
    state.target = null;
  }
};

const split = (element: HTMLElement): { rest: HTMLElement; shown: HTMLElement } => {
  const shown = document.createElement('span');
  const rest = document.createElement('span');
  rest.style.visibility = 'hidden';
  element.replaceChildren(shown, rest);
  return { rest, shown };
};

const run = (state: State, element: HTMLElement, done: () => void): void => {
  const chars = Array.from(segmenter.segment(state.full), (part) => part.segment);
  const { rest, shown } = split(element);
  let count = 0;
  rest.textContent = state.full;
  state.target = element;
  state.timer = setInterval(() => {
    count += 1;
    shown.textContent = chars.slice(0, count).join('');
    rest.textContent = chars.slice(count).join('');
    if (count >= chars.length) {
      stop(state);
      done();
    }
  }, pace);
};

const createReveal = (): Reveal => {
  const state: State = { full: '', target: null, timer: null };
  return {
    finish: () => {
      stop(state);
    },
    start: (element, done) => {
      stop(state);
      state.full = element.textContent.trim();
      if (isCalm() || state.full === '') {
        element.textContent = state.full;
        queueMicrotask(done);
        return;
      }
      run(state, element, done);
    },
  };
};

export { createReveal, type Reveal };
