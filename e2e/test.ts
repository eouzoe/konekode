import { test as base } from '@playwright/test';

interface Options {
  readonly tolerated: readonly RegExp[];
}

const test = base.extend<Options>({
  page: async ({ page, tolerated }, use) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => {
      problems.push(`uncaught: ${error.message}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        problems.push(`console: ${message.text()}`);
      }
    });
    await use(page);
    const unexpected = problems.filter(
      (problem) => !tolerated.some((known) => known.test(problem)),
    );
    if (unexpected.length > 0) {
      throw new Error(`the page threw or logged an error:\n${unexpected.join('\n')}`);
    }
  },
  tolerated: [[], { option: true }],
});

export { test };

export { expect, type Page } from '@playwright/test';
