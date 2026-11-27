import { Cues, PlayCue } from '@konekode/contracts/parts';
import { Effect, Layer } from 'effect';

const cues = Layer.succeed(Cues, { play: () => Effect.void });

const services = PlayCue.layer.pipe(Layer.provideMerge(cues));

export { services };
