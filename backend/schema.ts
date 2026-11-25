import { customType, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const bytes = customType<{ data: ArrayBuffer; driverData: ArrayBuffer }>({
  dataType: () => 'blob',
});

const intake = sqliteTable('intake', {
  actor: text('actor').notNull(),
  agent: text('agent').notNull(),
  asn: integer('asn').notNull(),
  body: bytes('body').notNull(),
  city: text('city').notNull(),
  country: text('country').notNull(),
  encoding: text('encoding').notNull(),
  id: integer('id').primaryKey(),
  ip: text('ip').notNull(),
  kind: text('kind').notNull(),
  network: text('network').notNull(),
  receivedAt: integer('received_at').notNull(),
  region: text('region').notNull(),
  seq: integer('seq').notNull(),
  session: text('session').notNull(),
  site: text('site').notNull(),
  timezone: text('timezone').notNull(),
});

const used = {
  batches: integer('batches').notNull(),
  bytes: integer('bytes').notNull(),
  day: text('day').notNull(),
};

const intakeUsage = sqliteTable(
  'intake_usage',
  { network: text('network').notNull(), ...used },
  (table) => [primaryKey({ columns: [table.network, table.day] })],
);

const intakeActorUsage = sqliteTable(
  'intake_actor_usage',
  { actor: text('actor').notNull(), ...used },
  (table) => [primaryKey({ columns: [table.actor, table.day] })],
);

export { intake, intakeActorUsage, intakeUsage };
