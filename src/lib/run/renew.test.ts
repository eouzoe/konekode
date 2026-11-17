import { expect, test } from 'bun:test';

import { expand } from './guide';
import { tokenOf } from './renew';

test('each step maps back to the token the sprite would press', () => {
  const tokens = expand(['G', 'dj', 'type:a b', 'Enter', 'Esc']).map((step) => tokenOf(step));
  expect(tokens).toEqual(['G', 'd', 'j', 'text:a', 'text: ', 'text:b', 'Enter', 'Esc']);
});
