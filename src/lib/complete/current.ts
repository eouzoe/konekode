import { unlockedNow } from '@/lib/progress/store';

import { catalog } from './catalog';
import { createEngine } from './engine';

const engine = createEngine(catalog, unlockedNow);

export { engine };
