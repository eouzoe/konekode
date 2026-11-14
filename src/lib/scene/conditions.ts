const fullScreenQuery = '(display-mode: fullscreen)';

const isFullScreen = (): boolean =>
  document.fullscreenElement !== null || globalThis.matchMedia(fullScreenQuery).matches;

const watchFullScreen = (listener: () => void): void => {
  globalThis.matchMedia(fullScreenQuery).addEventListener('change', listener);
  document.addEventListener('fullscreenchange', listener);
};

export { isFullScreen, watchFullScreen };
