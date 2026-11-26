import { listed, sitemapXml } from '@/lib/site/pages';

import type { APIRoute } from 'astro';

const GET: APIRoute = ({ site, url }) =>
  new Response(
    sitemapXml(
      site ?? url,
      listed.map((page) => page.path),
    ),
    { headers: { 'content-type': 'application/xml; charset=utf-8' } },
  );

export { GET };
