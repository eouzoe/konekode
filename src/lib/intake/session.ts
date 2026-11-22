import { track } from '@/lib/record/current';
import { siteVersion } from '@/lib/site/version';

import { environment } from './environment';
import { watchPage } from './watch';

let begun = false;

const beginSession = (): void => {
  if (begun) {
    return;
  }
  begun = true;
  track('session.started', { data: environment(siteVersion()) });
  watchPage();
};

export { beginSession };
