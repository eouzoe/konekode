import { fullscreenKeys, thisPlatform, type Platform } from '@/lib/site/device';
import { say } from '@/lib/text/ui';

const fullScreenQuery = '(display-mode: fullscreen)';
const fullscreenMark = '{fullscreen}';

const isFullScreen = (): boolean =>
  document.fullscreenElement !== null || globalThis.matchMedia(fullScreenQuery).matches;

const watchFullScreen = (listener: () => void): void => {
  globalThis.matchMedia(fullScreenQuery).addEventListener('change', listener);
  document.addEventListener('fullscreenchange', listener);
};

const fitToDevice = (root: HTMLElement, platform: Platform = thisPlatform()): void => {
  if (platform === 'touch') {
    for (const beat of root.querySelectorAll('[data-needs="fullscreen-key"]')) {
      beat.remove();
    }
    return;
  }
  const name = say(fullscreenKeys[platform]);
  for (const key of root.querySelectorAll('[data-fullscreen-key]')) {
    key.replaceWith(name);
  }
  root.normalize();
};

export { fitToDevice, fullscreenMark, isFullScreen, watchFullScreen };
