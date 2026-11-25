const intakePath = '/api/intake';
const intakeContentType = 'application/octet-stream';
const bodyLimit = 1_000_000;
const seqLimit = 1_000_000_000;
const textLimit = 400;
const retryLater = 60;
const closedFor = 31_536_000;
const intakeOpen = 'open';
const intakeClosed = 'closed';

const status = {
  closed: 429,
  forbidden: 403,
  notAllowed: 405,
  notFound: 404,
  stored: 204,
  tooLarge: 413,
  tooMany: 429,
  unavailable: 503,
  unreadable: 400,
};

const plainHeaders = { 'x-content-type-options': 'nosniff' };

export {
  bodyLimit,
  closedFor,
  intakeClosed,
  intakeContentType,
  intakeOpen,
  intakePath,
  plainHeaders,
  retryLater,
  seqLimit,
  status,
  textLimit,
};
