import { unlockedNow } from '@/lib/learner/engine';

import { catalog } from './catalog';
import { createEngine } from './engine';

const engine = createEngine(catalog, unlockedNow);

export { engine };
