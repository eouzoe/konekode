const screenSlack = 8;

const isFullScreen = (): boolean =>
  document.fullscreenElement !== null ||
  globalThis.innerHeight >= globalThis.screen.height - screenSlack;

const applies = (beat: HTMLElement | undefined): boolean => {
  const when = beat?.dataset.when;
  if (when === 'fullscreen') {
    return isFullScreen();
  }
  if (when === 'windowed') {
    return !isFullScreen();
  }
  return true;
};

export { applies };
