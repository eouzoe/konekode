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

interface Answer {
  readonly retryAfter: string | null;
  readonly status: number;
}

const endpoint = '/api/intake';
const stored = 204;
const bodyLimit = 1_000_000;
const keepaliveLimit = 60_000;
const unreached: Answer = { retryAfter: null, status: 0 };

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

const answerOf = async (sending: Promise<Response>): Promise<Answer> => {
  try {
    const response = await sending;
    return { retryAfter: response.headers.get('retry-after'), status: response.status };
  } catch {
    return unreached;
  }
};

const deliver = (ticket: Ticket, packed: Packed): Promise<Answer> => {
  try {
    return answerOf(
      fetch(address(ticket, packed.encoding), {
        body: packed.body,
        keepalive: packed.body.byteLength <= keepaliveLimit,
        method: 'POST',
      }),
    );
  } catch {
    return Promise.resolve(unreached);
  }
};

const post = async (ticket: Ticket, packed: Packed): Promise<boolean> => {
  const answer = await deliver(ticket, packed);
  return answer.status === stored;
};

const upload = async (ticket: Ticket, text: string): Promise<Answer> =>
  deliver(ticket, await pack(text));

const uploadNow = (ticket: Ticket, text: string): Promise<Answer> => {
  const bytes = new TextEncoder().encode(text);
  return deliver(ticket, { body: bytes.buffer, encoding: 'identity' });
};

const uploadLast = (ticket: Ticket, text: string): boolean =>
  navigator.sendBeacon(address(ticket, 'identity'), text);

export {
  bodyLimit,
  keepaliveLimit,
  pack,
  post,
  stored,
  upload,
  uploadLast,
  uploadNow,
  type Answer,
  type Packed,
  type Ticket,
};
