import { Effect, Layer } from 'effect';

import { Cues, PlayCue } from '@/eui/contract';

const cues = Layer.succeed(Cues, { play: () => Effect.void });

const services = PlayCue.layer.pipe(Layer.provideMerge(cues));

export { services };
