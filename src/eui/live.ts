import { Layer } from 'effect';

import { services as cues } from '@/parts/cues';

import { LessonCommands } from './lesson';
import { Compiler, Learner } from './services';

const live = Layer.mergeAll(LessonCommands, cues).pipe(
  Layer.provideMerge(Layer.mergeAll(Compiler.layer, Learner.layer)),
);

export { live };
