import { expect, test } from 'bun:test';

import { saveSentence } from '../../../text.config';

const scratch = async (): Promise<{ log: string; text: string }> => {
  const base = `${Bun.env.TMPDIR ?? '/tmp'}/text-${crypto.randomUUID()}`;
  const files = { log: `${base}.jsonl`, text: `${base}.json` };
  await Bun.write(files.text, `${JSON.stringify({ first: 'one', second: 'two' }, null, 2)}\n`);
  return files;
};

test('saving a sentence rewrites only that sentence and keeps the order', async () => {
  const files = await scratch();
  await saveSentence(files, { id: 'first', locale: 'zh-TW', text: 'uno', unit: 'start' });
  expect(await Bun.file(files.text).text()).toBe('{\n  "first": "uno",\n  "second": "two"\n}\n');
});

test('every change is appended to the log with what it was before', async () => {
  const files = await scratch();
  await saveSentence(files, { id: 'second', locale: 'zh-TW', text: 'dos', unit: 'start' });
  await saveSentence(files, { id: 'second', locale: 'zh-TW', text: 'dos', unit: 'start' });
  const logged = await Bun.file(files.log).text();
  const lines = logged.trim().split('\n');
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0] ?? '')).toMatchObject({
    after: 'dos',
    before: 'two',
    id: 'second',
    unit: 'start',
  });
});

test('a sentence that does not exist is refused and nothing is written', async () => {
  const files = await scratch();
  const before = await Bun.file(files.text).text();
  expect(
    saveSentence(files, { id: 'third', locale: 'zh-TW', text: 'tres', unit: 'start' }),
  ).rejects.toThrow('no sentence called third');
  expect(await Bun.file(files.text).text()).toBe(before);
  expect(await Bun.file(files.log).exists()).toBe(false);
});
