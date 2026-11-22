import { guard } from '@/lib/fault/fault';

import { replayWanted } from './environment';
import { noteFingerprint } from './fingerprint';
import { startReplay } from './replay';

const observePage = (site: string): void => {
  if (replayWanted()) {
    guard('replay', startReplay(site));
  }
  guard('fingerprint', noteFingerprint());
};

export { observePage };
