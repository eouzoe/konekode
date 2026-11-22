import { guard } from '@/lib/fault/fault';

import { idle } from './moment';

const startWhenIdle = async (): Promise<void> => {
  await idle();
  const [{ startIntake }, { keepOffline }] = await Promise.all([
    import('@/lib/intake/mount'),
    import('./offline'),
  ]);
  guard('intake', startIntake());
  guard('offline', keepOffline());
  document.documentElement.dataset.later = 'started';
};

const startLater = (): void => {
  guard('later', startWhenIdle());
};

export { startLater };
