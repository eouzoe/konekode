import { unlockedNow } from '@/lib/learner/live';

import { catalog } from './catalog';
import { createEngine } from './engine';

const engine = createEngine(catalog, unlockedNow);

export { engine };
