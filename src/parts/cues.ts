import { Component } from '@effect/ui';
import { Effect } from 'effect';

import { PlayCue } from '@/eui/contract';

const cues = PlayCue.toLayer(() => Effect.succeed(Component.noop));

export { cues };
