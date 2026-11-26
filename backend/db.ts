import { D1 } from '@alchemy.run/cloudflare';
import { RemovalPolicy, Stack } from 'alchemy';

import { isLive, locationFor, named } from './stage';

const props = Stack.useSync((stack) => ({
  ...locationFor(stack.stage),
  migrations: './migrations',
  name: named('cp-intake', stack.stage),
}));
const live = Stack.useSync((stack) => isLive(stack.stage));

const Intake = D1.Database('Intake', props).pipe(
  RemovalPolicy.retain(live),
  RemovalPolicy.protect(live),
);

export { Intake };
