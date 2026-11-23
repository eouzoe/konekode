import { acceptIntake, intakePath, type Database } from './intake';
import { markPlatform } from './platform';

interface Env {
  readonly ASSETS: { readonly fetch: (request: Request) => Promise<Response> };
  readonly INTAKE?: Database;
}

const serve = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  if (url.pathname === intakePath) {
    return acceptIntake(request, url, env.INTAKE);
  }
  return markPlatform(request, await env.ASSETS.fetch(request));
};

const handler = { fetch: serve };

export default handler;
