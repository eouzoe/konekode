import { D1 } from '@alchemy.run/cloudflare';
import { D1 as drizzleOver } from '@alchemy.run/drizzle';
import { RuntimeContext } from 'alchemy/RuntimeContext';
import { and, eq, sql } from 'drizzle-orm';
import { Effect, Layer } from 'effect';

import { usageOf, type Account } from './budget';
import { Intake } from './db';
import { intake, intakeActorUsage, intakeUsage } from './schema';
import { Store, type Parcel, type Spent } from './store';

import type { EffectSQLiteD1Database } from 'drizzle-orm/effect-d1';

type Database = EffectSQLiteD1Database;
type Client = D1.QueryDatabaseClient;

const networkRow = { batches: intakeUsage.batches, bytes: intakeUsage.bytes };
const actorRow = { batches: intakeActorUsage.batches, bytes: intakeActorUsage.bytes };

const spentBy = (
  db: Database,
  account: Account,
  actor: string,
): Effect.Effect<Spent, never, RuntimeContext> => {
  const network = db
    .select(networkRow)
    .from(intakeUsage)
    .where(and(eq(intakeUsage.network, account.network), eq(intakeUsage.day, account.day)));
  const own = db
    .select(actorRow)
    .from(intakeActorUsage)
    .where(and(eq(intakeActorUsage.actor, actor), eq(intakeActorUsage.day, account.day)));
  return Effect.all([network, own], { concurrency: 2 }).pipe(
    Effect.map(([networkRows, ownRows]) => ({
      actor: usageOf(ownRows[0]),
      network: usageOf(networkRows[0]),
    })),
    Effect.orDie,
    Effect.withSpan('intake.spent'),
  );
};

const statementsFor = (
  db: Database,
  parcel: Parcel,
): Array<{ params: Array<unknown>; sql: string }> => {
  const { account, body, now, origin, ticket } = parcel;
  const size = body.byteLength;
  const row = db.insert(intake).values({ ...ticket, ...origin, body, receivedAt: now });
  const network = db
    .insert(intakeUsage)
    .values({ batches: 1, bytes: size, day: account.day, network: account.network })
    .onConflictDoUpdate({
      set: {
        batches: sql`${intakeUsage.batches} + 1`,
        bytes: sql`${intakeUsage.bytes} + excluded.bytes`,
      },
      target: [intakeUsage.network, intakeUsage.day],
    });
  const own = db
    .insert(intakeActorUsage)
    .values({ actor: ticket.actor, batches: 1, bytes: size, day: account.day })
    .onConflictDoUpdate({
      set: {
        batches: sql`${intakeActorUsage.batches} + 1`,
        bytes: sql`${intakeActorUsage.bytes} + excluded.bytes`,
      },
      target: [intakeActorUsage.actor, intakeActorUsage.day],
    });
  return [row.toSQL(), network.toSQL(), own.toSQL()];
};

const keepIn = (
  db: Database,
  client: Client,
  parcel: Parcel,
): Effect.Effect<void, never, RuntimeContext> => {
  const prepared = statementsFor(db, parcel).map((query) =>
    client.prepare(query.sql).bind(...query.params),
  );
  return client.batch(prepared).pipe(Effect.asVoid, Effect.withSpan('intake.keep'));
};

const D1Store = Layer.effect(
  Store,
  Effect.gen(function* opening() {
    const client = yield* D1.QueryDatabase(yield* Intake);
    const db = yield* drizzleOver(client);
    return Store.of({
      keep: (parcel) => keepIn(db, client, parcel).pipe(Effect.provide(RuntimeContext.phantom)),
      spent: (account, actor) =>
        spentBy(db, account, actor).pipe(Effect.provide(RuntimeContext.phantom)),
    });
  }),
);

export { D1Store };
