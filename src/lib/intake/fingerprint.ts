import { track } from '@/lib/record/current';

const noteFingerprint = async (): Promise<void> => {
  try {
    const { load } = await import('@fingerprintjs/fingerprintjs');
    const agent = await load({ monitoring: false });
    const result = await agent.get();
    track('device.fingerprint', {
      data: { confidence: result.confidence.score, visitor: result.visitorId },
    });
  } catch (error) {
    track('device.fingerprint', { data: { failed: String(error) } });
  }
};

export { noteFingerprint };
