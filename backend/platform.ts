import { Effect, FileSystem, Layer, Path } from 'effect';
import { Etag, HttpPlatform } from 'effect/http';

const noFiles = Layer.succeed(HttpPlatform.HttpPlatform, {
  compression: {
    algorithms: new Set<HttpPlatform.CompressionAlgorithm>(),
    compressResponse: (response) => Effect.succeed(response),
  },
  fileResponse: () => Effect.die('the Worker serves no files'),
  fileWebResponse: () => Effect.die('the Worker serves no files'),
  platform: 'web',
});

const platform = Layer.mergeAll(Etag.layer, noFiles, Path.layer, FileSystem.layerNoop({}));

export { platform };
