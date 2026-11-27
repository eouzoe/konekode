import { D1, Telemetry, Worker } from '@alchemy.run/cloudflare';
import { ALCHEMY_DEV } from 'alchemy';
import { layerOtlp } from 'alchemy/Telemetry';
import { Config, Effect, Layer, Option } from 'effect';
import { HttpRouter } from 'effect/http';

import { D1Store } from './d1';
import { intakeApp } from './intake';
import { apiObservability, apiTelemetry, build, compatibility } from './stage';

const localCollector = Config.option(Config.URL('KONEKODE_OTLP'));

const telemetry = Layer.unwrap(
  Effect.gen(function* choosing() {
    if (!(yield* ALCHEMY_DEV)) {
      return Telemetry(apiTelemetry);
    }
    return Option.match(yield* localCollector, {
      onNone: () => Telemetry(apiTelemetry),
      onSome: (url) => layerOtlp({ url: url.href }),
    });
  }).pipe(Effect.orDie),
);

const bindings = Layer.mergeAll(D1.QueryDatabaseBinding, telemetry);

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
