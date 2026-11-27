import { afterEach, expect, test } from 'bun:test';

import { currentLink } from './link';

class Connection {
  get downlink(): number {
    return 2;
  }

  get rtt(): number {
    return 50;
  }
}

const reportConnection = (connection: unknown): void => {
  Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
};

afterEach(() => {
  Reflect.deleteProperty(navigator, 'connection');
});

test('reads the speed the browser reports through getters on the prototype', () => {
  reportConnection(new Connection());
  expect(currentLink()).toEqual({ bitsPerMs: 2000, latencyMs: 50 });
});

test('falls back to a careful link when the reported speed is not finite', () => {
  reportConnection({ downlink: Number.POSITIVE_INFINITY });
  expect(currentLink()).toEqual({ bitsPerMs: 1000, latencyMs: 300 });
});
