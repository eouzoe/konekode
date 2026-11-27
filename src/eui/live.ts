import { services as cues } from '@konekode/views/cues';
import { Layer } from 'effect';

import { LessonCommands } from './lesson';
import { Compiler, Learner } from './services';

const live = Layer.mergeAll(LessonCommands, cues).pipe(
  Layer.provideMerge(Layer.mergeAll(Compiler.layer, Learner.layer)),
);

export { live };
