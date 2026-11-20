import { open } from './start-support';
import { expect, test } from './test';

const sizes = [
  { height: 650, width: 900 },
  { height: 620, width: 1100 },
  { height: 720, width: 1280 },
  { height: 768, width: 1366 },
  { height: 1080, width: 1920 },
];
const slack = 1;

for (const size of sizes) {
  const name = `${String(size.width)}×${String(size.height)}`;
  test(`${name}: every sentence fits the lines the dialogue box keeps for it`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page);
    const found = await page.evaluate(() => {
      const words = document.querySelector<HTMLElement>('[data-role="dialogue"] .words');
      if (words === null) {
        return { room: 0, tallest: 0, which: 'no dialogue' };
      }
      const look = getComputedStyle(words);
      const probe = document.createElement('p');
      Object.assign(probe.style, {
        font: look.font,
        lineHeight: look.lineHeight,
        margin: '0',
        overflowWrap: 'anywhere',
        position: 'absolute',
        visibility: 'hidden',
        width: `${String(words.clientWidth)}px`,
      });
      document.body.append(probe);
      probe.textContent = '字';
      const line = probe.scrollHeight;
      let tallest = 0;
      let which = '';
      for (const beat of document.querySelectorAll<HTMLElement>('[data-beat]')) {
        probe.textContent = beat.textContent.trim();
        if (probe.scrollHeight > tallest) {
          tallest = probe.scrollHeight;
          which = beat.dataset.id ?? '';
        }
      }
      probe.remove();
      const kept = Number(look.getPropertyValue('--shown-lines'));
      return { room: kept * line, tallest, which };
    });
    expect(found.room, `${name}: the box keeps room`).toBeGreaterThan(0);
    expect(found.tallest, `${name}: ${found.which}`).toBeLessThanOrEqual(found.room + slack);
  });

  test(`${name}: every line to add is shown in full`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page, 'task');
    const cut = await page.evaluate((allowance) => {
      const card = document.querySelector<HTMLElement>('[data-role="snippet"]');
      if (card === null) {
        return ['no card'];
      }
      const lines = [...document.querySelectorAll<HTMLElement>('[data-beat][data-snippet]')].map(
        (beat) => beat.dataset.snippet ?? '',
      );
      const before = card.textContent;
      const found = [...new Set(lines)].filter((line) => {
        card.textContent = line;
        return (
          card.clientWidth === 0 ||
          card.scrollWidth > card.clientWidth + allowance ||
          card.scrollHeight > card.clientHeight + allowance
        );
      });
      card.textContent = before;
      return found;
    }, slack);
    expect(cut).toEqual([]);
  });

  test(`${name}: the dialogue box is the same height whatever is in it`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page);
    const heights = await page.evaluate(() => {
      const dialogue = document.querySelector<HTMLElement>('[data-role="dialogue"]');
      const note = dialogue?.querySelector<HTMLElement>('[data-role="note"]') ?? null;
      if (dialogue === null || note === null) {
        return [];
      }
      const shown = [...dialogue.querySelectorAll<HTMLElement>('[data-beat]')].find(
        (beat) => beat.offsetParent !== null,
      );
      const empty = dialogue.getBoundingClientRect().height;
      note.textContent = '第 12 行應該是 123456789，目前輸出的是 987654321。'.repeat(3);
      const noted = dialogue.getBoundingClientRect().height;
      note.textContent = '';
      const before = shown?.textContent ?? '';
      if (shown !== undefined) {
        shown.textContent = '字'.repeat(400);
      }
      const crowded = dialogue.getBoundingClientRect().height;
      if (shown !== undefined) {
        shown.textContent = before;
      }
      return [empty, noted, crowded];
    });
    expect(heights).toHaveLength(3);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(slack);
  });
}
