import { indexable, robotsText } from '@/lib/site/pages';

import type { APIRoute } from 'astro';

const GET: APIRoute = ({ site, url }) =>
  new Response(robotsText(indexable(import.meta.env.PUBLIC_INDEX), site ?? url), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });

export { GET };
