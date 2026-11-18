import { expect, test } from './test';

const stored = 204;
const refusedMethod = 405;
const refusedTicket = 400;

test('events recorded in the browser reach the server with their session', async ({ page }) => {
  const uploaded = page.waitForResponse(
    (response) => response.url().includes('kind=events') && response.request().method() === 'POST',
  );
  await page.goto('/learn/start/');
  const response = await uploaded;
  expect(response.status()).toBe(stored);
  const query = new URL(response.url()).searchParams;
  expect(query.get('kind')).toBe('events');
  expect(query.get('encoding')).toBe('gzip');
  expect(query.get('seq')).toBe('1');
  expect(query.get('session')).toMatch(/^[0-9a-f-]{36}$/u);
  expect(query.get('actor')).toMatch(/^[0-9a-f-]{36}$/u);
});

test('the intake refuses reads and malformed tickets', async ({ request }) => {
  const read = await request.get('/api/intake');
  const malformed = await request.post('/api/intake?kind=events', { data: 'x' });
  expect(read.status()).toBe(refusedMethod);
  expect(malformed.status()).toBe(refusedTicket);
});

test('uploaded events nobody reads locally are dropped from the browser', async ({ page }) => {
  const uploaded = page.waitForResponse(
    (response) => response.url().includes('kind=events') && response.status() === stored,
  );
  await page.goto('/learn/start/');
  await page.locator('[data-scene][data-ready="true"]').waitFor();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await uploaded;
  const kinds = async (): Promise<string[]> =>
    await page.evaluate(
      async () =>
        await new Promise<string[]>((resolve) => {
          const opening = indexedDB.open('konekode');
          opening.addEventListener('success', () => {
            const all = opening.result.transaction('events').objectStore('events').getAll();
            all.addEventListener('success', () => {
              resolve(all.result.map((event: { kind: string }) => event.kind));
            });
          });
        }),
    );
  await expect.poll(kinds).not.toContain('session.started');
  await expect.poll(kinds).toContain('beat.reached');
});
