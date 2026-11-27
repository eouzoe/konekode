import { Schema } from 'effect';

import { outputsOf } from './check-stage';
import { named } from './stage';

const argumentsStart = 2;
const microsPerMilli = 1000;
const defaultMinutes = 60;
const graphql = 'https://api.cloudflare.com/client/v4/graphql';

const row = Schema.Struct({
  dimensions: Schema.Struct({ scriptName: Schema.String, status: Schema.String }),
  max: Schema.Struct({ cpuTime: Schema.Finite }),
  quantiles: Schema.Struct({
    cpuTimeP50: Schema.Finite,
    cpuTimeP90: Schema.Finite,
    cpuTimeP99: Schema.Finite,
  }),
  sum: Schema.Struct({ errors: Schema.Finite, requests: Schema.Finite }),
});

const answer = Schema.Struct({
  data: Schema.Struct({
    viewer: Schema.Struct({
      accounts: Schema.Array(Schema.Struct({ workersInvocationsAdaptive: Schema.Array(row) })),
    }),
  }),
});

type Row = typeof row.Type;

interface Usage {
  readonly errors: number;
  readonly maxMs: number;
  readonly p50Ms: number;
  readonly p90Ms: number;
  readonly p99Ms: number;
  readonly requests: number;
  readonly status: string;
  readonly worker: string;
}

const millis = (micros: number): number => Math.round(micros / 10) / (microsPerMilli / 10);

const usageOf = (rows: ReadonlyArray<Row>, workers: Record<string, string>): Array<Usage> =>
  rows
    .flatMap((each) => {
      const worker = workers[each.dimensions.scriptName];
      if (worker === undefined) {
        return [];
      }
      return [
        {
          errors: each.sum.errors,
          maxMs: millis(each.max.cpuTime),
          p50Ms: millis(each.quantiles.cpuTimeP50),
          p90Ms: millis(each.quantiles.cpuTimeP90),
          p99Ms: millis(each.quantiles.cpuTimeP99),
          requests: each.sum.requests,
          status: each.dimensions.status,
          worker,
        },
      ];
    })
    .sort(
      (left, right) => left.worker.localeCompare(right.worker) || right.requests - left.requests,
    );

const query = `query Cpu($account: String!, $since: Time!, $scripts: [String!]) {
  viewer { accounts(filter: { accountTag: $account }) {
    workersInvocationsAdaptive(limit: 100, filter: { datetime_geq: $since, scriptName_in: $scripts }) {
      dimensions { scriptName status }
      sum { requests errors }
      quantiles { cpuTimeP50 cpuTimeP90 cpuTimeP99 }
      max { cpuTime }
    }
  } }
}`;

const read = async (
  scripts: ReadonlyArray<string>,
  minutes: number,
): Promise<ReadonlyArray<Row>> => {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const response = await fetch(graphql, {
    body: JSON.stringify({
      query,
      variables: { account: process.env.CLOUDFLARE_ACCOUNT_ID ?? '', scripts, since },
    }),
    headers: {
      authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN ?? ''}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const decoded = Schema.decodeUnknownSync(answer)(await response.json());
  return decoded.data.viewer.accounts.flatMap((account) => account.workersInvocationsAdaptive);
};

if (import.meta.main) {
  const [stage = '', minutesText] = Bun.argv.slice(argumentsStart);
  const minutes = Number(minutesText ?? defaultMinutes);
  const recorded = await outputsOf(stage);
  const workers = { [named('cp', stage)]: 'Site', [recorded.api]: 'Api' };
  const usage = usageOf(await read(Object.keys(workers), minutes), workers);
  process.stdout.write(`${JSON.stringify({ minutes, stage, usage }, null, 2)}\n`);
}

export { usageOf };
