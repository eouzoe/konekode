import { HtmlHydrate } from '@effect/ui/html';
import { Effect, Layer, Schema } from 'effect';

import { beginSession } from '@/lib/intake/session';

import { Lesson } from './lesson';
import { live } from './live';

const root = document.querySelector<HTMLElement>('#lesson');
if (root !== null) {
  beginSession();
  const props = {
    calm: globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches,
    fine: globalThis.matchMedia('(any-pointer: fine)').matches,
    full: document.fullscreenElement !== null,
    unit: root.dataset.unit ?? 'start',
  };
  const state = Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
  )(document.querySelector('#lesson-state')?.textContent ?? '{}');
  Layer.launch(HtmlHydrate.hydrate(Lesson, props, root, state).pipe(Layer.provide(live))).pipe(
    Effect.runFork,
  );
}
