import { Schema } from 'effect';

import { checkAll, report, type Target, type Token } from './checks';

const argumentsStart = 2;
const outputs = Schema.Struct({ api: Schema.String, site: Schema.String });

type Outputs = typeof outputs.Type;

const optional = (value: string | undefined): string | null => {
  if (value === undefined || value === '') {
    return null;
  }
  return value;
};

const tokenFromEnv = (): Token | null => {
  const id = optional(process.env.KONEKODE_CHECK_CLIENT_ID);
  const secret = optional(process.env.KONEKODE_CHECK_CLIENT_SECRET);
  if (id === null || secret === null) {
    return null;
  }
  return { id, secret };
};

const backendFlags = (): Array<string> => {
  if (process.env.KONEKODE_LOCAL === '1') {
    return ['--backend', 'local'];
  }
  return [];
};

const outputsOf = async (stage: string): Promise<Outputs> => {
  const path = `Konekode/${stage}/output`;
  const command = ['bun', 'x', 'alchemy', 'state', 'cat', path, '--no-input', ...backendFlags()];
  const child = Bun.spawn(command, { stderr: 'inherit', stdout: 'pipe' });
  const [text, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  if (code !== 0) {
    throw new Error(`no outputs recorded for stage ${stage}`);
  }
  const recorded: unknown = JSON.parse(text.slice(text.indexOf('{')));
  return Schema.decodeUnknownSync(outputs)(recorded);
};

const apiAddress = (site: URL, api: string): string | null => {
  if (site.hostname === 'localhost') {
    return null;
  }
  const account = site.hostname.split('.').slice(1).join('.');
  return `https://${api}.${account}/`;
};

const targetOf = (stage: string, recorded: Outputs, version: string | null): Target => {
  const site = new URL(recorded.site);
  return {
    api: apiAddress(site, recorded.api),
    live: stage === 'prod',
    local: site.hostname === 'localhost',
    site,
    token: tokenFromEnv(),
    version,
  };
};

if (import.meta.main) {
  const [stage = '', version] = Bun.argv.slice(argumentsStart);
  const target = targetOf(stage, await outputsOf(stage), optional(version));
  const results = await checkAll({ fetch: (input) => fetch(input), target });
  process.stdout.write(`${report(results)}\n`);
  if (!results.every((each) => each.passed)) {
    process.exitCode = 1;
  }
}

export { apiAddress, targetOf };
