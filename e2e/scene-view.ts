import { type Page } from '@playwright/test';

interface Current {
  readonly id: string;
  readonly revealing: boolean;
  readonly wait: string;
  readonly waiting: boolean;
}

const current = async (page: Page): Promise<Current> =>
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-scene][data-ready="true"]');
    const shown = [...(root?.querySelectorAll<HTMLElement>('[data-beat]:not([hidden])') ?? [])];
    const beat = shown.pop();
    return {
      id: beat?.dataset.id ?? '',
      revealing: root?.dataset.revealing === 'true',
      wait: beat?.dataset.wait ?? '',
      waiting: root?.dataset.waiting === 'true',
    };
  });

const currentId = async (page: Page): Promise<string> => (await current(page)).id;

export { current, currentId, type Current };
