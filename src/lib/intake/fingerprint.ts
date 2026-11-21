import { track } from '@/lib/record/current';

type Fingerprint = Readonly<Record<string, number | string>>;

const webKitSkips = ['canvas'] as const;

const fingerprintOf = async (): Promise<Fingerprint> => {
  const fingerprint = await import('@fingerprintjs/fingerprintjs');
  if (fingerprint.isWebKit()) {
    const collect = fingerprint.loadSources(
      fingerprint.sources,
      { cache: {}, debug: false },
      webKitSkips,
    );
    const components = await collect();
    return { skipped: webKitSkips.join(','), visitor: fingerprint.hashComponents(components) };
  }
  const agent = await fingerprint.load({ monitoring: false });
  const result = await agent.get();
  return { confidence: result.confidence.score, visitor: result.visitorId };
};

const noteFingerprint = async (): Promise<void> => {
  try {
    track('device.fingerprint', { data: await fingerprintOf() });
  } catch (error) {
    track('device.fingerprint', { data: { failed: String(error) } });
  }
};

export { noteFingerprint };
