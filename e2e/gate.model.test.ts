import { expectedNow, type Session } from '../src/lib/edit/session';
import { checksOf, planOf } from '../src/units/index';
import { openAt } from './fuzz-support';
import { arrive, expectSame, tap } from './gate-support';
import { studentEditor } from './gate-view';
import { expect, test } from './test';

const gates = checksOf('start').filter((gate) => (planOf('start', gate.id)?.path.length ?? 0) > 0);
const never = '~';

test.use({ heldTime: true });

const swapCase = (key: string): string => {
  if (key.length !== 1) {
    return never;
  }
  if (key.toLowerCase() === key) {
    return key.toUpperCase();
  }
  return key.toLowerCase();
};

const upcomingText = ({ at, path }: Session): string =>
  path.slice(at).find((expected) => expected.kind === 'text')?.key ?? never;

const wrongKeys = (session: Session): string[] => {
  const wanted = expectedNow(session)?.key ?? '';
  const candidates = [
    never,
    swapCase(wanted),
    'Backspace',
    'Delete',
    'Enter',
    'Escape',
    upcomingText(session),
    'ArrowLeft',
    'ArrowDown',
  ];
  return [...new Set(candidates)].filter((key) => key !== wanted && key !== '');
};

for (const gate of gates) {
  test(`${gate.id}: after every key, right or wrong, the page shows what the rules say`, async ({
    page,
  }) => {
    await openAt(page, gate.id, studentEditor);
    const walk = arrive(page, gate.id);
    await expectSame(walk, 'on arrival');
    for (const [at, expected] of walk.session.path.entries()) {
      for (const key of wrongKeys(walk.session)) {
        const label = `step ${String(at)}, wrong key ${key}`;
        expect((await tap(walk, key)).verdict, label).toBe('wrong');
        await expectSame(walk, label);
      }
      if (expected.kind === 'run') {
        break;
      }
      const label = `step ${String(at)}, right key ${expected.key}`;
      expect((await tap(walk, expected.key)).verdict, label).toBe('right');
      await expectSame(walk, label);
    }
    expect(walk.session.buffer.text).toBe(gate.program);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-code-runner]')).toHaveAttribute('data-armed', 'false', {
      timeout: 60_000,
    });
  });
}
