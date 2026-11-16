interface Ticket {
  readonly actor: string;
  readonly kind: 'events' | 'replay';
  readonly seq: number;
  readonly session: string;
  readonly site: string;
}

interface Packed {
  readonly body: Blob;
  readonly encoding: 'gzip' | 'identity';
}

const endpoint = '/api/intake';
const stored = 204;
const bodyLimit = 1_000_000;

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

const pack = async (text: string): Promise<Packed> => {
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return { body: await new Response(stream).blob(), encoding: 'gzip' };
  } catch {
    return { body: new Blob([text]), encoding: 'identity' };
  }
};

const post = async (ticket: Ticket, packed: Packed): Promise<boolean> => {
  try {
    const response = await fetch(address(ticket, packed.encoding), {
      body: packed.body,
      method: 'POST',
    });
    return response.status === stored;
  } catch {
    return false;
  }
};

const upload = async (ticket: Ticket, text: string): Promise<boolean> =>
  post(ticket, await pack(text));

const uploadLast = (ticket: Ticket, text: string): boolean => {
  const body = new Blob([text], { type: 'application/json' });
  return navigator.sendBeacon(address(ticket, 'identity'), body);
};

export { bodyLimit, pack, post, upload, uploadLast, type Packed, type Ticket };
