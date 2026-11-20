import { acceptIntake, intakePath, type Database } from './intake';
import { markPlatform } from './platform';

interface Env {
  readonly ASSETS: { readonly fetch: (request: Request) => Promise<Response> };
  readonly INTAKE?: Database;
}

const types: Record<string, string> = { tar: 'application/x-tar', wasm: 'application/wasm' };
const packed = /\.(?<kind>tar|wasm)$/u;

const servePacked = async (request: Request, env: Env, kind: string): Promise<Response> => {
  const url = new URL(request.url);
  url.pathname += '.br';
  const stored = await env.ASSETS.fetch(new Request(url, { method: request.method }));
  if (!stored.ok) {
    return stored;
  }
  const init: ResponseInit & { encodeBody: 'manual' } = {
    encodeBody: 'manual',
    headers: {
      'cache-control': 'public, max-age=31536000, immutable',
      'content-encoding': 'br',
      'content-type': types[kind] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    },
  };
  return new Response(stored.body, init);
};

const serve = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  if (url.pathname === intakePath) {
    return acceptIntake(request, url, env.INTAKE);
  }
  const kind = packed.exec(url.pathname)?.groups?.kind;
  if (kind === undefined) {
    return markPlatform(request, await env.ASSETS.fetch(request));
  }
  return servePacked(request, env, kind);
};

const handler = { fetch: serve };

export default handler;
