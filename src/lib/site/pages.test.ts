import { expect, test } from 'bun:test';

import {
  absolute,
  indexable,
  lessonData,
  listed,
  pages,
  robotsMeta,
  robotsText,
  scriptJson,
  sitemapXml,
  websiteData,
} from './pages';

const origin = 'https://example.test';

test('structured data cannot close its script element, and still reads back the same', () => {
  const data = { name: '</script><script>alert(1)</script>', nested: ['<!--', '<b>'] };
  const text = scriptJson(data);
  expect(text).not.toContain('<');
  expect(JSON.parse(text)).toEqual(data);
});

test('only an explicit flag opens the site to search engines', () => {
  expect(indexable('true')).toBe(true);
  expect(indexable('false')).toBe(false);
  expect(indexable('1')).toBe(false);
  expect(indexable('')).toBe(false);
  expect(indexable()).toBe(false);
});

test('a closed build tells crawlers to stay out, in the page and in robots.txt', () => {
  expect(robotsMeta(false)).toBe('noindex, nofollow');
  expect(robotsText(false, origin)).toBe('User-agent: *\nDisallow: /\n');
});

test('an open build lets every crawler in and points to the sitemap', () => {
  const text = robotsText(true, origin);
  expect(robotsMeta(true)).toBe('index, follow');
  expect(text).toContain('User-agent: *\nAllow: /\n');
  expect(text).toContain('Sitemap: https://example.test/sitemap.xml');
  expect(text).not.toContain('Disallow');
});

test('the sitemap lists every page once, as an absolute address', () => {
  const xml = sitemapXml(
    origin,
    listed.map((page) => page.path),
  );
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(xml).toContain('<loc>https://example.test/</loc>');
  expect(xml).toContain('<loc>https://example.test/learn/start/</loc>');
  expect(xml.match(/<url>/gu)).toHaveLength(listed.length);
});

test('addresses in the sitemap are escaped', () => {
  expect(sitemapXml(origin, ['/a?b=1&c=2'])).toContain(
    '<loc>https://example.test/a?b=1&amp;c=2</loc>',
  );
});

test('every page has its own title and description', () => {
  const titles = listed.map((page) => page.title);
  const descriptions = listed.map((page) => page.description);
  expect(new Set(titles).size).toBe(listed.length);
  expect(new Set(descriptions).size).toBe(listed.length);
  for (const page of listed) {
    expect(page.title.length).toBeGreaterThan(0);
    expect(page.description.length).toBeGreaterThan(0);
    expect(page.path.startsWith('/')).toBe(true);
    expect(page.path.endsWith('/')).toBe(true);
  }
});

test('structured data repeats what the page itself says', () => {
  const home = websiteData(origin);
  const lesson = lessonData(origin, pages.start);
  expect(home).toMatchObject({
    '@type': 'WebSite',
    description: pages.home.description,
    url: absolute(origin, '/'),
  });
  expect(lesson).toMatchObject({
    '@type': 'LearningResource',
    description: pages.start.description,
    name: pages.start.title,
    url: 'https://example.test/learn/start/',
  });
});
