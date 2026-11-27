import { catalog } from '@konekode/contracts/catalog';

import { unlockedNow } from '@/lib/learner/engine';

import { createEngine } from './engine';

const engine = createEngine(catalog, unlockedNow);

export { engine };
