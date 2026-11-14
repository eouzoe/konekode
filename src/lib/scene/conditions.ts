const screenSlack = 8;

const isFullScreen = (): boolean =>
  document.fullscreenElement !== null ||
  globalThis.innerHeight >= globalThis.screen.height - screenSlack;

export { isFullScreen };
