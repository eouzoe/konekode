import { gsap } from 'gsap';

const wait = async (seconds: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<null>();
  gsap.delayedCall(seconds, () => {
    resolve(null);
  });
  await promise;
};

export { wait };
