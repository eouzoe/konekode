import { intakeClosed, intakeOpen } from './limits';

const live = 'prod';
const compatibility = { date: '2026-11-02', flags: ['enable_request_signal'] };
const unsafe = /[^0-9a-z-]/gu;
const everything = 1;
const observability = {
  enabled: true,
  headSamplingRate: everything,
  issues: { enabled: true },
  logs: { enabled: true, headSamplingRate: everything, invocationLogs: true, persist: true },
  traces: { enabled: true, headSamplingRate: everything, persist: true },
};
const build = { output: { sourcemap: true } };
const nearTaiwan = 'apac';

const isLive = (stage: string): boolean => stage === live;

const named = (base: string, stage: string): string => {
  if (isLive(stage)) {
    return base;
  }
  return `${base}-${stage.toLowerCase().replaceAll(unsafe, '-')}`;
};

const locationFor = (stage: string): { readonly primaryLocationHint?: typeof nearTaiwan } => {
  if (isLive(stage)) {
    return {};
  }
  return { primaryLocationHint: nearTaiwan };
};

const intakeState = (stage: string): string => {
  if (isLive(stage)) {
    return intakeClosed;
  }
  return intakeOpen;
};

export { compatibility, intakeState, isLive, named, observability, build, locationFor };
