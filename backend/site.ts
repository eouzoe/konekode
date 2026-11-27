import {
  bodyLimit,
  closedFor,
  intakeContentType,
  intakeOpen,
  intakePath,
  plainHeaders,
  status,
} from './limits';
import { markPlatform } from './platform-mark';

interface Fetcher {
  readonly fetch: (request: Request) => Promise<Response>;
}

interface Env {
  readonly API: Fetcher;
  readonly ASSETS: Fetcher;
  readonly INTAKE: string;
}

const refuse = (code: number): Response =>
  new Response(null, { headers: plainHeaders, status: code });

const closed = (): Response =>
  new Response(null, {
    headers: { ...plainHeaders, 'retry-after': String(closedFor) },
    status: status.closed,
  });

const crossSite = (request: Request, url: URL): boolean => {
  const from = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return (
    (from !== null && from !== url.origin) || (fetchSite !== null && fetchSite !== 'same-origin')
  );
};

const refusal = (request: Request, url: URL): number | null => {
  if (request.method !== 'POST') {
    return status.notAllowed;
  }
  if (crossSite(request, url)) {
    return status.forbidden;
  }
  if (Number(request.headers.get('content-length') ?? '0') > bodyLimit) {
    return status.tooLarge;
  }
  return null;
};

const forward = async (request: Request, api: Fetcher): Promise<Response> => {
  const headers = new Headers(request.headers);
  headers.set('content-type', intakeContentType);
  const answer = await api.fetch(new Request(request, { headers }));
  const guarded = new Response(answer.body, answer);
  for (const [name, value] of Object.entries(plainHeaders)) {
    guarded.headers.set(name, value);
  }
  return guarded;
};

const intake = (request: Request, url: URL, env: Env): Promise<Response> | Response => {
  if (env.INTAKE !== intakeOpen) {
    return closed();
  }
  const refused = refusal(request, url);
  if (refused !== null) {
    return refuse(refused);
  }
  return forward(request, env.API);
};

const firstError = 400;

const uncached = (page: Response): Response => {
  if (page.status < firstError) {
    return page;
  }
  const kept = new Response(page.body, page);
  kept.headers.set('cache-control', 'no-store');
  return kept;
};

const serve = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  if (url.pathname === intakePath) {
    return intake(request, url, env);
  }
  if (url.pathname.startsWith('/api/')) {
    return refuse(status.notFound);
  }
  return markPlatform(request, uncached(await env.ASSETS.fetch(request)));
};

const site = { fetch: serve };

export default site;
export { type Env, type Fetcher };
