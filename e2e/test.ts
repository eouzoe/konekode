import { test as base, type Page } from '@playwright/test';

import { holdTime } from './time';

interface Options {
  readonly compiler: boolean;
  readonly heldTime: boolean;
  readonly tolerated: ReadonlyArray<RegExp>;
}

const plainHttpOnly = /Prefetch request denied: URL must be secure \(HTTPS\)/u;
const workerLoadAborted =
  /^console: \[JavaScript Error: "NS_BINDING_ABORTED: " \{file: "chrome:\/\/juggler\/content\/content\/WorkerMain\.js" line: \d+\}\]$/u;
const partCancelled =
  /^console: Fetch API cannot load http:\/\/localhost:\d+\/(?:parts\/[\da-f]{64}|compiler\/parts\.json) due to access control checks\.$/u;
const workerScriptCancelled =
  /^uncaught: \/localhost:\d+\/_astro\/(?:compiler|prefetch)\.worker-[\w-]+\.js due to access control checks\.$/u;
const compilerScript = /\/compiler\.worker[^/]*\.js(?:\?|$)/u;
const partList = /\/compiler\/parts\.json$/u;
const needed =
  'a run reached the compiler, which this test does not load; declare test.use({ compiler: true })';

const withoutCompiler = async (page: Page): Promise<void> => {
  await page.route(compilerScript, async (route) => {
    await route.abort();
  });
  await page.route(partList, async (route) => {
    await route.fulfill({ json: { parts: [] } });
  });
  await page.addInitScript((message) => {
    const watch = new MutationObserver(() => {
      if (document.querySelector('[data-code-runner][data-state="error"]') !== null) {
        watch.disconnect();
        throw new Error(message);
      }
    });
    watch.observe(document, { attributeFilter: ['data-state'], attributes: true, subtree: true });
  }, needed);
};

const watchProblems = (page: Page): Array<string> => {
  const problems: Array<string> = [];
  page.on('pageerror', (error) => {
    problems.push(`uncaught: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(`console: ${message.text()}`);
    }
  });
  return problems;
};

const test = base.extend<Options>({
  compiler: [false, { option: true }],
  heldTime: [false, { option: true }],
  page: async ({ compiler, heldTime, page, tolerated }, use) => {
    const problems = watchProblems(page);
    if (!compiler) {
      await withoutCompiler(page);
    }
    if (heldTime) {
      await holdTime(page);
    }
    await use(page);
    const unexpected = problems.filter(
      (problem) =>
        !plainHttpOnly.test(problem) &&
        !workerLoadAborted.test(problem) &&
        !partCancelled.test(problem) &&
        !workerScriptCancelled.test(problem) &&
        !tolerated.some((known) => known.test(problem)),
    );
    if (unexpected.length > 0) {
      throw new Error(`the page threw or logged an error:\n${unexpected.join('\n')}`);
    }
  },
  tolerated: [[], { option: true }],
});

export { test };

export { expect, type Page } from '@playwright/test';
