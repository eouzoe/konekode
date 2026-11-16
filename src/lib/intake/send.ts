interface Ticket {
  readonly actor: string;
  readonly kind: 'events' | 'replay';
  readonly seq: number;
  readonly session: string;
  readonly site: string;
}

interface Packed {
  readonly body: ArrayBuffer;
  readonly encoding: 'gzip' | 'identity';
}

const endpoint = '/api/intake';
const stored = 204;
const bodyLimit = 1_000_000;
const keepaliveLimit = 60_000;

const address = (ticket: Ticket, encoding: string): string => {
  const query = new URLSearchParams({
    actor: ticket.actor,
    encoding,
    kind: ticket.kind,
    seq: String(ticket.seq),
    session: ticket.session,
    site: ticket.site,
  });
  return `${endpoint}?${query.toString()}`;
};

const squeeze = (bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> => {
  const plain = new Response(bytes).body;
  if (plain === null) {
    throw new TypeError('no stream to compress');
  }
  return new Response(plain.pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
};

const pack = async (text: string): Promise<Packed> => {
  const bytes = new TextEncoder().encode(text);
  try {
    return { body: await squeeze(bytes), encoding: 'gzip' };
  } catch {
    return { body: bytes.buffer, encoding: 'identity' };
  }
};

const post = async (ticket: Ticket, packed: Packed): Promise<boolean> => {
  try {
    const response = await fetch(address(ticket, packed.encoding), {
      body: packed.body,
      keepalive: packed.body.byteLength <= keepaliveLimit,
      method: 'POST',
    });
    return response.status === stored;
  } catch {
    return false;
  }
};

const upload = async (ticket: Ticket, text: string): Promise<boolean> =>
  post(ticket, await pack(text));

const uploadLast = (ticket: Ticket, text: string): boolean =>
  navigator.sendBeacon(address(ticket, 'identity'), text);

export { bodyLimit, keepaliveLimit, pack, post, upload, uploadLast, type Packed, type Ticket };
