import { record, string, unknown } from 'zod';

import { listed, pages, robotsMeta, robotsText, site } from '../src/lib/site/pages';
import { expect, test, type Page } from './test';

const found = 200;
const phone = { height: 780, width: 360 };
const heavy = /compiler|llvm|\.wasm|std\.pch/u;

const head = async (page: Page, selector: string, attribute: string): Promise<string> =>
  (await page.locator(selector).getAttribute(attribute)) ?? '';

const structured = async (page: Page): Promise<Record<string, unknown>> => {
  const text = await page.locator('script[type="application/ld+json"]').textContent();
  return record(string(), unknown()).parse(JSON.parse(text ?? '{}'));
};

test('the home page says what the site is and leads to the first unit', async ({ page }) => {
  await page.goto(pages.home.path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(site['home.heading']);
  await expect(page.getByText(site['home.lead'])).toBeVisible();
  await expect(page.getByText(site['home.enterNote'])).toBeVisible();
  await expect(page.getByText(site['home.now'])).toBeVisible();
  await page.getByRole('link', { name: site['home.enter'] }).click();
  await expect(page).toHaveURL(new RegExp(`${pages.start.path}$`, 'u'));
});

test('the home page fits a phone without scrolling sideways', async ({ page }) => {
  await page.setViewportSize(phone);
  await page.goto(pages.home.path);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('the home page does not fetch the compiler', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    requested.push(request.url());
  });
  await page.goto(pages.home.path);
  await page.waitForLoadState('networkidle');
  expect(requested.filter((address) => heavy.test(address))).toEqual([]);
});

for (const item of listed) {
  test(`${item.path} carries its own title, description, address and structured data`, async ({
    page,
  }) => {
    await page.goto(item.path);
    await expect(page).toHaveTitle(item.title);
    expect(await head(page, 'meta[name="description"]', 'content')).toBe(item.description);
    expect(await head(page, 'meta[property="og:title"]', 'content')).toBe(item.title);
    expect(await head(page, 'meta[property="og:description"]', 'content')).toBe(item.description);
    const canonical = await head(page, 'link[rel="canonical"]', 'href');
    expect(new URL(canonical).pathname).toBe(item.path);
    expect(await head(page, 'meta[property="og:url"]', 'content')).toBe(canonical);
    const data = await structured(page);
    expect(data.url).toBe(canonical);
    expect(data.description).toBe(item.description);
  });
}

test('robots.txt says the same as the pages about being indexed', async ({ page, request }) => {
  await page.goto(pages.home.path);
  const meta = await head(page, 'meta[name="robots"]', 'content');
  const open = meta === robotsMeta(true);
  const canonical = await head(page, 'link[rel="canonical"]', 'href');
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(found);
  expect(meta).toBe(robotsMeta(open));
  expect(await robots.text()).toBe(robotsText(open, new URL(canonical).origin));
});

test('the sitemap lists every page, and every listed page opens', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  const xml = await sitemap.text();
  const paths = [...xml.matchAll(/<loc>(?<address>[^<]+)<\/loc>/gu)].map(
    (match) => new URL(match.groups?.address ?? '').pathname,
  );
  expect(sitemap.status()).toBe(found);
  expect(paths.toSorted()).toEqual(listed.map((item) => item.path).toSorted());
  const statuses = await Promise.all(paths.map(async (path) => (await request.get(path)).status()));
  expect(statuses).toEqual(paths.map(() => found));
});

test('without scripts both pages still say what they are', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(pages.home.path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(site['home.heading']);
  await page.goto(pages.start.path);
  await expect(page.getByText(site['start.plain'])).toBeVisible();
  await context.close();
});
