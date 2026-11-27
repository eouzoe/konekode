import { Context } from 'effect';

import type { Account, Usage } from './budget';
import type { Ticket } from './contract';
import type { Effect } from 'effect';

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

interface Storage {
  readonly keep: (parcel: Parcel) => Effect.Effect<void>;
  readonly spent: (account: Account, actor: string) => Effect.Effect<Spent>;
}

class Store extends Context.Service<Store, Storage>()('konekode/Store') {}

export { Store, type Origin, type Parcel, type Spent, type Storage };
