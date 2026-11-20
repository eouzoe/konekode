import { guard } from '@/lib/fault/fault';

import { replayWanted } from './environment';
import { noteFingerprint } from './fingerprint';
import { startReplay } from './replay';
import { watchPage } from './watch';

const observePage = (site: string): void => {
  watchPage();
  if (replayWanted()) {
    guard('replay', startReplay(site));
  }
  guard('fingerprint', noteFingerprint());
};

export { observePage };
