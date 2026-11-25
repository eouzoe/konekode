import { providers, state, Worker } from '@alchemy.run/cloudflare';
import { providers as drizzleProviders } from '@alchemy.run/drizzle';
import { localState, Stack } from 'alchemy';
import { Effect, Layer } from 'effect';

import api from './backend/api';
import { Intake } from './backend/db';
import { compatibility, intakeState, isLive, named, observability, build } from './backend/stage';

const local = (): boolean =>
  process.env.ALCHEMY_DEV === 'true' || process.env.KONEKODE_LOCAL === '1';

const records = (): ReturnType<typeof localState> | ReturnType<typeof state> => {
  if (local()) {
    return localState();
  }
  return state();
};

const localPort = (): { readonly dev?: { readonly port: number } } => {
  const port = Number(process.env.SITE_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    return {};
  }
  return { dev: { port } };
};

const viewer = (): string => {
  const email = process.env.KONEKODE_PREVIEW_VIEWER ?? '';
  if (email === '') {
    throw new Error(
      'KONEKODE_PREVIEW_VIEWER is needed to deploy a preview: run it through secretspec',
    );
  }
  return email;
};

const previewAccess = (stage: string) => {
  if (isLive(stage) || local()) {
    return {};
  }
  return {
    access: {
      policies: [
        { decision: 'allow', include: [{ email: viewer() }], name: 'viewer' },
        { decision: 'non_identity', include: ['anyValidServiceToken'], name: 'checks' },
      ],
      sessionDuration: '24h',
    },
  } as const;
};

export default Stack(
  'Konekode',
  { providers: Layer.mergeAll(providers(), drizzleProviders()), state: records() },
  Effect.gen(function* stack() {
    const { stage } = yield* Stack;
    const database = yield* Intake;
    const backend = yield* api;
    const site = yield* Worker('Site', {
      assets: {
        directory: process.env.SITE_ASSETS ?? './dist',
        htmlHandling: 'auto-trailing-slash',
        notFoundHandling: 'none',
        runWorkerFirst: ['/api/*', '/learn/*'],
      },
      ...localPort(),
      ...previewAccess(stage),
      build,
      compatibility,
      env: { API: backend, INTAKE: intakeState(stage) },
      main: './backend/site.ts',
      name: named('cp', stage),
      observability,
    });
    return { api: backend.workerName, databaseName: database.databaseName, site: site.url };
  }),
);
