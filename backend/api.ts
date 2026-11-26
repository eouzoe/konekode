import { D1, Telemetry, Worker } from '@alchemy.run/cloudflare';
import { D1 as drizzleOver } from '@alchemy.run/drizzle';
import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/http';

import { storeIn } from './d1';
import { Intake } from './db';
import { intakeFor } from './intake';
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
    const database = yield* Intake;
    const client = yield* D1.QueryDatabase(database);
    const db = yield* drizzleOver(client);
    const fetch = yield* HttpRouter.toHttpEffect(intakeFor(storeIn(db, client)));
    return { fetch };
  }).pipe(Effect.provide(bindings)),
);

export default api;
