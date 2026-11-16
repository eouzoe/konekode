interface Ticket {
  readonly actor: string;
  readonly kind: 'events' | 'replay';
  readonly seq: number;
  readonly session: string;
  readonly site: string;
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

const squeeze = (text: string): Promise<Blob> => {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
};

const post = async (ticket: Ticket, body: Blob): Promise<boolean> => {
  try {
    const response = await fetch(address(ticket, 'gzip'), { body, method: 'POST' });
    return response.status === stored;
  } catch {
    return false;
  }
};

const upload = async (ticket: Ticket, text: string): Promise<boolean> => {
  try {
    return await post(ticket, await squeeze(text));
  } catch {
    return false;
  }
};

const uploadLast = (ticket: Ticket, text: string): boolean => {
  const body = new Blob([text], { type: 'application/json' });
  return navigator.sendBeacon(address(ticket, 'identity'), body);
};

export { bodyLimit, post, squeeze, upload, uploadLast, type Ticket };
