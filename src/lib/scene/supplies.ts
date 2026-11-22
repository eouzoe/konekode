import { report } from '@/lib/fault/fault';
import { currentLink } from '@/lib/supply/link';
import { readDues, type Step } from '@/lib/supply/plan';
import { createSupply, type Loader, type Supply } from '@/lib/supply/supply';

const loaders: Readonly<Record<string, Loader>> = {
  compiler: async () => {
    const { warmUp } = await import('@/lib/run/runner');
    await warmUp();
  },
  drill: async () => {
    const { mountAll } = await import('@/lib/typing/mount');
    mountAll();
  },
  editor: async () => {
    const { mountRunners } = await import('@/lib/run/mount');
    mountRunners();
  },
};

const stepOf = (beat: HTMLElement): Step => {
  const step: Step = {
    auto: Number(beat.dataset.auto ?? '0'),
    say: beat.textContent,
    stage: beat.dataset.stage ?? 'empty',
  };
  if (beat.dataset.wait === undefined) {
    return step;
  }
  return { ...step, wait: beat.dataset.wait };
};

const supplyScene = (
  root: HTMLElement,
  beats: readonly HTMLElement[],
  onSettle: () => void,
): Supply => {
  const supply = createSupply({
    dues: readDues(root.dataset.needs),
    link: currentLink,
    loaders,
    onFailure: (name, error) => {
      report('supply.load', name, error);
    },
    onSettle,
    online: () => navigator.onLine,
    steps: beats.map((beat) => stepOf(beat)),
  });
  globalThis.addEventListener('online', () => {
    supply.resume();
  });
  return supply;
};

export { supplyScene };
