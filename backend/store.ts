import { type Effect } from 'effect';

import { type Account, type Usage } from './budget';
import { type Ticket } from './contract';

interface Origin {
  readonly agent: string;
  readonly asn: number;
  readonly city: string;
  readonly country: string;
  readonly ip: string;
  readonly network: string;
  readonly region: string;
  readonly timezone: string;
}

interface Spent {
  readonly actor: Usage;
  readonly network: Usage;
}

interface Parcel {
  readonly account: Account;
  readonly body: ArrayBuffer;
  readonly now: number;
  readonly origin: Origin;
  readonly ticket: Ticket;
}

interface Storage<Needs = never> {
  readonly keep: (parcel: Parcel) => Effect.Effect<void, never, Needs>;
  readonly spent: (account: Account, actor: string) => Effect.Effect<Spent, never, Needs>;
}

export { type Origin, type Parcel, type Spent, type Storage };
