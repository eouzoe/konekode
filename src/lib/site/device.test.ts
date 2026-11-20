import { expect, test } from 'bun:test';

import { platformOf, type Clues } from './device';

const desktop: Clues = { agent: '', finePointer: true, hint: '', touchPoints: 0 };

const agents = {
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/142.0 Mobile Safari/537.36',
  chromebook:
    'Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) AppleWebKit/537.36 Chrome/142.0 Safari/537.36',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 Version/26.1 Mobile Safari/604.1',
  linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:146.0) Gecko/20100101 Firefox/146.0',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.1 Safari/605.1.15',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36',
};

test('computers are told apart by their system, so each is told its own full-screen key', () => {
  expect(platformOf({ ...desktop, agent: agents.windows })).toBe('pc');
  expect(platformOf({ ...desktop, agent: agents.linux })).toBe('pc');
  expect(platformOf({ ...desktop, agent: agents.mac })).toBe('mac');
  expect(platformOf({ ...desktop, agent: agents.chromebook })).toBe('chromeos');
});

test('the platform a Chromium browser reports wins over its user agent string', () => {
  expect(platformOf({ ...desktop, agent: agents.windows, hint: 'macOS' })).toBe('mac');
  expect(platformOf({ ...desktop, agent: agents.linux, hint: 'Chrome OS' })).toBe('chromeos');
  expect(platformOf({ ...desktop, agent: agents.mac, hint: 'Windows' })).toBe('pc');
});

test('phones and tablets have no full-screen key, including an iPad that calls itself a Mac', () => {
  expect(platformOf({ ...desktop, agent: agents.iphone })).toBe('touch');
  expect(platformOf({ ...desktop, agent: agents.android, hint: 'Android' })).toBe('touch');
  expect(platformOf({ ...desktop, agent: agents.mac, touchPoints: 5 })).toBe('touch');
});

test('a device with no mouse or trackpad is treated as having no keyboard either', () => {
  expect(platformOf({ ...desktop, agent: agents.windows, finePointer: false })).toBe('touch');
});
