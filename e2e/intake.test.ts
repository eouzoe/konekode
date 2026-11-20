import { timing } from '../src/lib/intake/plan';
import { expect, test, type Page } from './test';

const stored = 204;
const refusedMethod = 405;
const refusedTicket = 400;
const tooMany = 429;
const waitSeconds = 3600;
const second = 1000;
const minute = 60 * second;
const tick = 15 * second;
const unusual = 400;
const chinese = '輸入法打出來的中文'.repeat(12);
const intake = /\/api\/intake\?/u;

const kindsStored = async (page: Page): Promise<string[]> =>
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

const openUnit = async (page: Page): Promise<void> => {
  await page.clock.install();
  await page.goto('/learn/start/');
  await page.locator('[data-scene][data-ready="true"]').waitFor();
};

const leave = async (page: Page, hidden: boolean): Promise<void> => {
  await page.evaluate((hide) => {
    if (hide) {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
    } else {
      Reflect.deleteProperty(document, 'visibilityState');
    }
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
};

const isIntake = (url: string): boolean => intake.test(url);

test('events wait until there is enough to send, then reach the server with their session', async ({
  page,
}) => {
  const asked: string[] = [];
  page.on('request', (request) => {
    if (isIntake(request.url())) {
      asked.push(request.url());
    }
  });
  await openUnit(page);
  await page.keyboard.press('ArrowRight');
  await page.clock.fastForward(timing.maxWait - tick);
  expect(asked).toEqual([]);
  const uploaded = page.waitForResponse((response) => isIntake(response.url()));
  await page.clock.fastForward(2 * tick);
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
  await openUnit(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const uploaded = page.waitForResponse(
    (response) => isIntake(response.url()) && response.status() === stored,
  );
  await page.clock.fastForward(timing.maxWait + tick);
  await uploaded;
  await expect.poll(async () => await kindsStored(page)).not.toContain('session.started');
  await expect.poll(async () => await kindsStored(page)).toContain('beat.reached');
});

test.describe('when the intake refuses', () => {
  test.use({ tolerated: [/the server responded with a status of 429/u] });

  test('a refused upload is waited out as told, across a reload, and nothing is lost', async ({
    page,
  }) => {
    let refusing = true;
    let asked = 0;
    await page.route(intake, async (route) => {
      asked += 1;
      if (refusing) {
        await route.fulfill({ headers: { 'retry-after': String(waitSeconds) }, status: tooMany });
        return;
      }
      await route.continue();
    });
    await openUnit(page);
    await page.keyboard.press('ArrowRight');
    await page.clock.fastForward(timing.maxWait + tick);
    await expect.poll(() => asked).toBe(1);
    await page.clock.fastForward(30 * minute);
    await page.reload();
    await page.locator('[data-scene][data-ready="true"]').waitFor();
    await page.clock.fastForward(10 * minute);
    await leave(page, true);
    expect(asked).toBe(1);
    expect(await kindsStored(page)).toContain('session.started');
    refusing = false;
    await leave(page, false);
    const accepted = page.waitForResponse(
      (response) => isIntake(response.url()) && response.status() === stored,
    );
    await page.clock.fastForward(waitSeconds * second);
    await accepted;
    await expect.poll(async () => await kindsStored(page)).not.toContain('session.started');
  });
});

test('the last batch on leaving fits its bytes even in Chinese, and the rest follows later', async ({
  page,
}) => {
  const bodies: { bytes: number; encoding: string; text: string }[] = [];
  page.on('request', (request) => {
    if (isIntake(request.url())) {
      const body = request.postDataBuffer() ?? Buffer.alloc(0);
      bodies.push({
        bytes: body.byteLength,
        encoding: new URL(request.url()).searchParams.get('encoding') ?? '',
        text: body.toString('utf8'),
      });
    }
  });
  await openUnit(page);
  await page.evaluate(
    ({ count, text }) => {
      for (let at = 0; at < count; at += 1) {
        document.dispatchEvent(new InputEvent('beforeinput', { data: `${text}${String(at)}` }));
      }
    },
    { count: unusual, text: chinese },
  );
  const last = page.waitForResponse((response) => isIntake(response.url()));
  await leave(page, true);
  expect((await last).status()).toBe(stored);
  const [first] = bodies;
  expect(first?.encoding).toBe('identity');
  expect(first?.bytes).toBeLessThanOrEqual(timing.finalBytes);
  expect(first?.text).toContain(chinese);
  await expect.poll(async () => await kindsStored(page)).toContain('input.unusual');
  await leave(page, false);
  const rest = page.waitForResponse(
    (response) => isIntake(response.url()) && response.status() === stored,
  );
  await page.clock.fastForward(timing.maxWait + tick);
  await rest;
  await expect.poll(async () => await kindsStored(page)).not.toContain('input.unusual');
});
