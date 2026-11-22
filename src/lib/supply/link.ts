import { number, object } from '@/lib/zod';

import { type Link } from './plan';

const connectionSchema = object({ downlink: number().optional(), rtt: number().optional() });

const kilobit = 1000;
const bitsPerByte = 8;
const kibi = 1024;
const enoughKibi = 16;
const enoughBytes = enoughKibi * kibi;
const carefulLatencyMs = 300;
const careful: Link = { bitsPerMs: kilobit, latencyMs: carefulLatencyMs };

const reported = (): Link | null => {
  const parsed = connectionSchema.safeParse(Reflect.get(navigator, 'connection'));
  if (!parsed.success || parsed.data.downlink === undefined || parsed.data.downlink <= 0) {
    return null;
  }
  return {
    bitsPerMs: parsed.data.downlink * kilobit,
    latencyMs: parsed.data.rtt ?? careful.latencyMs,
  };
};

const observed = (): Link | null => {
  const samples = performance
    .getEntriesByType('resource')
    .filter(
      (entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming,
    )
    .filter((entry) => entry.transferSize >= enoughBytes && entry.responseEnd > entry.responseStart)
    .map((entry) => ({
      bitsPerMs: (entry.transferSize * bitsPerByte) / (entry.responseEnd - entry.responseStart),
      latencyMs: entry.responseStart - entry.requestStart,
    }));
  if (samples.length === 0) {
    return null;
  }
  return {
    bitsPerMs: Math.min(...samples.map((sample) => sample.bitsPerMs)),
    latencyMs: Math.max(...samples.map((sample) => sample.latencyMs)),
  };
};

const currentLink = (): Link => reported() ?? observed() ?? careful;

export { currentLink };
