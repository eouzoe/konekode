import strings from '@/units/text/zh-TW/site.json' with { type: 'json' };

type SiteKey = keyof typeof strings;

interface Page {
  readonly description: string;
  readonly path: string;
  readonly title: string;
}

const site: Readonly<Record<SiteKey, string>> = strings;
const language = 'zh-Hant-TW';
const repository = 'https://github.com/eouzoe/konekode';

const pages = {
  home: { description: site['home.description'], path: '/', title: site['home.title'] },
  start: {
    description: site['start.description'],
    path: '/learn/start/',
    title: site['start.title'],
  },
} as const satisfies Readonly<Record<string, Page>>;

const listed: ReadonlyArray<Page> = Object.values(pages);

const indexable = (flag?: string): boolean => flag === 'true';

const robotsMeta = (open: boolean): string => {
  if (open) {
    return 'index, follow';
  }
  return 'noindex, nofollow';
};

const absolute = (origin: URL | string, path: string): string => new URL(path, origin).href;

const robotsText = (open: boolean, origin: URL | string): string => {
  if (!open) {
    return 'User-agent: *\nDisallow: /\n';
  }
  return `User-agent: *\nAllow: /\n\nSitemap: ${absolute(origin, '/sitemap.xml')}\n`;
};

const escapeXml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const sitemapXml = (origin: URL | string, paths: ReadonlyArray<string>): string => {
  const entries = paths.map(
    (path) => `  <url><loc>${escapeXml(absolute(origin, path))}</loc></url>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
};

const websiteData = (origin: URL | string): Readonly<Record<string, unknown>> => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  alternateName: [site.alternateName, new URL(absolute(origin, pages.home.path)).hostname],
  description: site['home.description'],
  inLanguage: language,
  name: site.name,
  url: absolute(origin, pages.home.path),
});

const lessonData = (origin: URL | string, page: Page): Readonly<Record<string, unknown>> => ({
  '@context': 'https://schema.org',
  '@type': 'LearningResource',
  description: page.description,
  inLanguage: language,
  isPartOf: { '@type': 'WebSite', name: site.name, url: absolute(origin, pages.home.path) },
  name: page.title,
  url: absolute(origin, page.path),
});

const reverseSolidus = 92;
const escapedLessThan = `${String.fromCodePoint(reverseSolidus)}u003c`;

const scriptJson = (data: unknown): string => JSON.stringify(data).replaceAll('<', escapedLessThan);

export {
  absolute,
  indexable,
  lessonData,
  listed,
  pages,
  repository,
  robotsMeta,
  robotsText,
  scriptJson,
  site,
  sitemapXml,
  websiteData,
  type Page,
};
