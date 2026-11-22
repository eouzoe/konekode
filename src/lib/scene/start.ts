import { beginSession } from '@/lib/intake/session';
import { shown } from '@/lib/site/moment';

import { listenEarly } from './early';
import { mountScene } from './mount';
import { openSession } from './session';

const never = (): boolean => false;

const mountScenes = async (): Promise<void> => {
  const roots = [...document.querySelectorAll<HTMLElement>('[data-scene]')];
  const early = roots.map((root) => listenEarly(root));
  await shown();
  beginSession();
  const read = await openSession();
  await Promise.all(roots.map((root, at) => mountScene(root, read, early[at] ?? never)));
  performance.mark('scene-ready');
};

export { mountScenes };
