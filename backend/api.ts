import { D1, Telemetry, Worker } from '@alchemy.run/cloudflare';
import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/http';

import { D1Store } from './d1';
import { intakeApp } from './intake';
import { apiObservability, apiTelemetry, build, compatibility } from './stage';

const bindings = Layer.mergeAll(D1.QueryDatabaseBinding, Telemetry(apiTelemetry));

const api = Worker(
  'Api',
  {
    build,
    compatibility,
    main: import.meta.url,
    observability: apiObservability,
    placement: { mode: 'smart' },
    workersDev: { enabled: false, previewsEnabled: false },
  },
  Effect.gen(function* serving() {
    const fetch = yield* HttpRouter.toHttpEffect(intakeApp.pipe(Layer.provide(D1Store)));
    return { fetch };
  }).pipe(Effect.provide(bindings)),
);

export default api;
