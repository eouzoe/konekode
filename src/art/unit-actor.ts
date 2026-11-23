import { createActor, type Actor } from 'xstate';

import { sceneMachine } from '@/lib/scene/machine';
import { metaOf } from '@/lib/scene/meta';

import { beats } from './unit';

type Scene = Actor<typeof sceneMachine>;

const sceneAt = (at: number): Scene =>
  createActor(sceneMachine, {
    input: {
      beats: beats.map((beat) => metaOf(beat)),
      passed: [],
      position: beats[at]?.id ?? null,
    },
  });

export { sceneAt, type Scene };
