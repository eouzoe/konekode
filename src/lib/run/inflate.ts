const packed = /\.(?<kind>tar|wasm)$/u;
const types: Record<string, string> = { tar: 'application/x-tar', wasm: 'application/wasm' };

const locate = (input: RequestInfo | URL): string => {
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
};

const inflate = async (request: typeof fetch, url: string, kind: string): Promise<Response> => {
  const response = await request(`${url}.gz`);
  if (!response.ok || response.body === null) {
    return response;
  }
  return new Response(response.body.pipeThrough(new DecompressionStream('gzip')), {
    headers: { 'content-type': types[kind] ?? 'application/octet-stream' },
  });
};

const installInflate = (): void => {
  const request = globalThis.fetch.bind(globalThis);
  const patched = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = locate(input);
    const kind = packed.exec(url)?.groups?.kind;
    if (kind === undefined) {
      return request(input, init);
    }
    return inflate(request, url, kind);
  };
  globalThis.fetch = Object.assign(patched, request);
};

export { installInflate };
