import { timing } from '../src/lib/intake/plan';
import {
  blockedWait,
  databaseName,
  schemaVersion,
  stallWait,
  storeName,
} from '../src/lib/record/browser';
import { say, type UiKey } from '../src/lib/text/ui';
import { currentId } from './scene-view';
import { expect, test, type Page } from './test';

interface Sent {
  readonly data: Readonly<Record<string, unknown>>;
  readonly kind: string;
}

const intake = /\/api\/intake\?/u;
const notice = '[data-role="site-notice"]';
const second = 1000;
const tick = 15 * second;
const openTroubles: ReadonlyMap<string, UiKey> = new Map([
  ['storage.blocked', 'notice.blocked'],
  ['storage.stalled', 'notice.unsaved'],
]);

const isSent = (value: unknown): value is Sent =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  typeof value.kind === 'string' &&
  'data' in value &&
  typeof value.data === 'object' &&
  value.data !== null;

const textOf = async (encoding: string | null, body: Buffer): Promise<string> => {
  const bytes = new Blob([new Uint8Array(body)]);
  if (encoding !== 'gzip') {
    return await bytes.text();
  }
  return await new Response(bytes.stream().pipeThrough(new DecompressionStream('gzip'))).text();
};

const readBody = async (url: string, body: Buffer | null): Promise<Sent[]> => {
  const query = new URL(url).searchParams;
  if (body === null || query.get('kind') !== 'events') {
    return [];
  }
  const parsed: unknown = JSON.parse(await textOf(query.get('encoding'), body));
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((value) => isSent(value));
};

const watchUploads = (page: Page): Sent[] => {
  const sent: Sent[] = [];
  page.on('request', async (request) => {
    if (intake.test(request.url())) {
      sent.push(...(await readBody(request.url(), request.postDataBuffer())));
    }
  });
  return sent;
};

const faultsIn = (sent: readonly Sent[]): string[] =>
  sent.filter((event) => event.kind === 'fault').map((event) => String(event.data.kind));

const kindsIn = (sent: readonly Sent[]): string[] => sent.map((event) => event.kind);

const nextSentence = async (page: Page): Promise<void> => {
  const before = await currentId(page);
  await expect(async () => {
    await page.keyboard.press('Space');
    expect(await currentId(page)).not.toBe(before);
  }).toPass();
};

const openUnit = async (page: Page): Promise<void> => {
  await page.goto('/learn/start/');
  await page.locator('[data-scene][data-ready="true"]').waitFor();
};

const reachedStored = async (page: Page): Promise<number> =>
  await page.evaluate(
    async ({ name, store }) => {
      const { promise, resolve } = Promise.withResolvers<number>();
      const opening = indexedDB.open(name);
      opening.addEventListener('error', () => {
        resolve(-1);
      });
      opening.addEventListener('success', () => {
        const all = opening.result.transaction(store).objectStore(store).getAll();
        all.addEventListener('success', () => {
          resolve(
            all.result.filter((event: { kind: string }) => event.kind === 'beat.reached').length,
          );
        });
        all.addEventListener('error', () => {
          resolve(-1);
        });
      });
      return await promise;
    },
    { name: databaseName, store: storeName },
  );

const fillTheQuota = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const original: unknown = Reflect.get(IDBDatabase.prototype, 'transaction');
    if (typeof original !== 'function') {
      throw new TypeError('IDBDatabase has no transaction');
    }
    IDBDatabase.prototype.transaction = function transaction(
      this: IDBDatabase,
      ...values: Parameters<IDBDatabase['transaction']>
    ): IDBTransaction {
      const made: unknown = Reflect.apply(original, this, values);
      if (!(made instanceof IDBTransaction)) {
        throw new TypeError('transaction did not return a transaction');
      }
      if (made.mode === 'readwrite') {
        queueMicrotask(() => {
          made.abort();
        });
      }
      return made;
    };
  });
};

const waitsAtMostForATrouble = async (page: Page, sent: readonly Sent[]): Promise<void> => {
  const began = performance.now();
  await page.goto('/learn/start/');
  await page
    .locator('[data-scene][data-ready="true"]')
    .waitFor({ timeout: stallWait + 10 * second });
  expect(performance.now() - began).toBeGreaterThanOrEqual(blockedWait);
  await expect.poll(() => faultsIn(sent).filter((kind) => openTroubles.has(kind))).toHaveLength(1);
  const trouble = faultsIn(sent).find((kind) => openTroubles.has(kind)) ?? '';
  await expect(page.locator(notice)).toHaveText(say(openTroubles.get(trouble) ?? 'notice.blocked'));
};

test.describe('when the browser cannot keep what the learner does', () => {
  test('the learner is told once, we hear of it at once, and what they did still reaches us', async ({
    page,
  }) => {
    const sent = watchUploads(page);
    await openUnit(page);
    await nextSentence(page);
    await expect.poll(async () => await reachedStored(page)).toBeGreaterThan(0);
    const before = await reachedStored(page);
    await expect(page.locator(notice)).toBeHidden();
    await fillTheQuota(page);
    await nextSentence(page);
    await expect(page.locator(notice)).toHaveText(say('notice.unsaved'));
    await expect.poll(() => faultsIn(sent)).toContain('storage.write');
    await expect.poll(() => kindsIn(sent)).toContain('beat.reached');
    await page.reload();
    await page.locator('[data-scene][data-ready="true"]').waitFor();
    expect(await reachedStored(page)).toBe(before);
  });

  test('a browser that refuses the database still runs the unit, tells the learner, and tells us', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        get: () => {
          throw new DOMException('Site data is blocked.', 'SecurityError');
        },
      });
    });
    const sent = watchUploads(page);
    await page.clock.install();
    await openUnit(page);
    await expect(page.locator(notice)).toHaveText(say('notice.unsaved'));
    await expect.poll(() => faultsIn(sent)).toContain('storage.unavailable');
    await nextSentence(page);
    await page.clock.fastForward(timing.maxWait + tick);
    await expect.poll(() => kindsIn(sent)).toContain('beat.reached');
  });

  test('a database held open by older code does not leave the unit waiting forever', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ name, version }) => {
        const open = indexedDB.open.bind(indexedDB);
        const holding = open(name, version);
        holding.addEventListener('success', () => {
          Reflect.set(globalThis, 'held', holding.result);
        });
        indexedDB.open = (asked: string): IDBOpenDBRequest => {
          if (asked === name) {
            return open(asked, version + 1);
          }
          return open(asked);
        };
      },
      { name: databaseName, version: schemaVersion },
    );
    await waitsAtMostForATrouble(page, watchUploads(page));
  });

  test('a database that never answers does not leave the unit waiting forever either', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ name, version }) => {
        const holding = indexedDB.open(name, version);
        holding.addEventListener('success', () => {
          Reflect.set(globalThis, 'held', holding.result);
        });
        indexedDB.deleteDatabase(name);
      },
      { name: databaseName, version: schemaVersion },
    );
    await waitsAtMostForATrouble(page, watchUploads(page));
  });

  test('a database that answers late is taken over, and what was done meanwhile is kept', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ delay, name }) => {
        const open = indexedDB.open.bind(indexedDB);
        const kinds = ['upgradeneeded', 'success', 'error', 'blocked'];
        indexedDB.open = (asked: string, version?: number): IDBOpenDBRequest => {
          if (asked !== name) {
            return open(asked, version);
          }
          const carrier = open(`${name}-carrier`);
          for (const kind of kinds) {
            carrier.addEventListener(kind, (event) => {
              if (event.isTrusted) {
                event.stopImmediatePropagation();
              }
            });
          }
          setTimeout(() => {
            const real = open(asked, version);
            Object.defineProperty(carrier, 'result', { get: () => real.result });
            Object.defineProperty(carrier, 'error', { get: () => real.error });
            for (const kind of kinds) {
              real.addEventListener(kind, () => {
                carrier.dispatchEvent(new Event(kind));
              });
            }
          }, delay);
          return carrier;
        };
      },
      { delay: stallWait + 2 * second, name: databaseName },
    );
    const sent = watchUploads(page);
    await page.goto('/learn/start/');
    await page
      .locator('[data-scene][data-ready="true"]')
      .waitFor({ timeout: stallWait + 10 * second });
    await expect(page.locator(notice)).toHaveText(say('notice.unsaved'));
    await nextSentence(page);
    const later = { timeout: 20 * second };
    await expect(page.locator(notice)).toBeHidden(later);
    await expect
      .poll(() => faultsIn(sent), later)
      .toEqual(expect.arrayContaining(['storage.stalled', 'storage.recovered']));
    await expect.poll(async () => await reachedStored(page), later).toBeGreaterThan(0);
    const kept = await reachedStored(page);
    await nextSentence(page);
    await expect.poll(async () => await reachedStored(page), later).toBeGreaterThan(kept);
  });
});

test.describe('when the intake fails', () => {
  test.use({ tolerated: [/the server responded with a status of 500/u] });

  test('a refused upload is kept and sent later, and the learner is not bothered', async ({
    page,
  }) => {
    let refusing = true;
    await page.route(intake, async (route) => {
      if (refusing) {
        await route.fulfill({ status: 500 });
        return;
      }
      await route.continue();
    });
    const sent = watchUploads(page);
    await page.clock.install();
    await openUnit(page);
    await nextSentence(page);
    const refused = page.waitForResponse((response) => intake.test(response.url()));
    await page.clock.fastForward(timing.maxWait + tick);
    expect((await refused).status()).toBe(500);
    refusing = false;
    sent.length = 0;
    await page.clock.fastForward(timing.lastBackoff + tick);
    await expect.poll(() => faultsIn(sent)).toContain('intake.refused');
    await expect.poll(() => kindsIn(sent)).toContain('beat.reached');
    await expect.poll(() => kindsIn(sent)).toContain('intake.held');
    await expect(page.locator(notice)).toBeHidden();
  });
});

test.describe('when something throws where nobody is waiting', () => {
  test.use({ tolerated: [/probe: (?:uncaught|rejected)/u] });

  test('it reaches us with where it happened, and the learner is not bothered', async ({
    page,
  }) => {
    const sent = watchUploads(page);
    await openUnit(page);
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('probe: uncaught');
      }, 0);
      void Promise.reject(new Error('probe: rejected'));
    });
    await expect
      .poll(() => faultsIn(sent))
      .toEqual(expect.arrayContaining(['uncaught', 'rejected']));
    const reasons = sent
      .filter((event) => event.kind === 'fault')
      .map((event) => String(event.data.reason));
    expect(reasons).toEqual(
      expect.arrayContaining(['Error: probe: uncaught', 'Error: probe: rejected']),
    );
    await expect(page.locator(notice)).toBeHidden();
  });
});
