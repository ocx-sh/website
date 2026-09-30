// Avatar without a Zag machine (D-Z17 deviation): a failed image hides and reports
// `ocx:avatar:status`, and src swaps leak nothing (C-114).
import { expect, test } from '@playwright/test';
import { expectNoLeak } from './helpers/leak.ts';

const PAGE = '/docs/stories/avatar/states/';

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

test('Avatar: a broken image is hidden, leaving the initials, and reports status error', async ({ page }) => {
  await page.goto(PAGE);
  // Scoped to the "broken image" State: "Dana Reyes" also appears in the away-status and group demos.
  const root = page
    .locator('.showcase-state')
    .filter({ has: page.locator('.showcase-state__label', { hasText: /^broken image$/ }) })
    .locator('.ocx-avatar[aria-label="Dana Reyes"]');
  await expect(root.locator('img')).toBeHidden();
  await expect(root.locator('.ocx-avatar__fallback')).toHaveText('DR');
  const status = await root.evaluate(
    (el) =>
      new Promise((resolve) => {
        el.addEventListener('ocx:avatar:status', (e) => resolve((e as CustomEvent<{ status: string }>).detail.status), {
          once: true,
        });
        el.querySelector('img')?.setAttribute('src', 'data:,x');
      }),
  );
  expect(status).toBe('error');
});

test('C-130h Avatar leaks nothing over 20 src-swap cycles', async ({ page }) => {
  await page.goto(PAGE);
  // The states story has no EventLog: the default story's log grows by design.
  const img = page
    .locator('.showcase-state')
    .filter({ has: page.locator('.showcase-state__label', { hasText: /^image$/ }) })
    .locator('.ocx-avatar img');
  await expectNoLeak(page, async () => {
    await img.evaluate((el) => el.setAttribute('src', 'data:,'));
    await img.evaluate((el) => el.setAttribute('src', 'https://i.pravatar.cc/64?img=5'));
  });
});

test('Avatar: presence status joins the accessible name; without status the name stays plain', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('.ocx-avatar:has(.ocx-avatar-status[data-tone="away"])')).toHaveAttribute(
    'aria-label',
    'Dana Reyes (away)',
  );
  await expect(page.locator('.ocx-avatar:not(:has(.ocx-avatar-status))').first()).not.toHaveAttribute(
    'aria-label',
    /\(/,
  );
});
