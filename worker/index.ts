interface Env {
  readonly ASSETS: { readonly fetch: (request: Request) => Promise<Response> };
}

const types: Record<string, string> = { tar: 'application/x-tar', wasm: 'application/wasm' };
const packed = /\.(?<kind>tar|wasm)$/u;

const serve = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const kind = packed.exec(url.pathname)?.groups?.kind;
  if (kind === undefined) {
    return env.ASSETS.fetch(request);
  }
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
    },
  };
  return new Response(stored.body, init);
};

const handler = { fetch: serve };

export default handler;
