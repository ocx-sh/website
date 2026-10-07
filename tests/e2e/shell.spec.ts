// Shell layout (plain Astro pages without Starlight): the chrome mounts from chrome.mjs alone.
import { expect, test, type Page } from '@playwright/test';

const OCX = '/docs/shell/';
const NEUTRAL = '/docs/shell/neutral/';
const isMobile = (testInfo: { project: { name: string } }) => testInfo.project.name === 'mobile';

async function open(page: Page, path: string) {
  const errors: string[] = [];
  // Script errors only: the ocx-mode favicon and the other sections' pages (prefetched by the mega
  // menu) are routes of other sites, so the example preview answers them with a 404.
  page.on(
    'console',
    (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()),
  );
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(path);
  return errors;
}

test.describe('ocx mode', () => {
  test.beforeEach(({ page: _page }, testInfo) =>
    test.skip(isMobile(testInfo), 'desktop width; mobile has its own test'),
  );

  test('no console errors; hovering the nav starts the machine and the mega menu opens', async ({ page }) => {
    const errors = await open(page, OCX);
    const root = page.locator('.ocx-header [data-zag-root="navigation-menu"]');
    await page.locator('nav.ocx-header__nav').hover();
    await expect(root).toHaveAttribute('data-zag-state', 'live');
    await page.locator('.ocx-header__nav button[data-ocx-section="ecosystem"]').click();
    await expect
      .poll(() => page.locator('#ocx-ecosystem-menu').evaluate((el) => el.matches(':popover-open')))
      .toBe(true);
    expect(errors).toEqual([]);
  });

  test('the theme toggle flips data-theme and persists starlight-theme', async ({ page }) => {
    await open(page, OCX);
    const before = await page.evaluate(() => document.documentElement.dataset['theme']);
    await page.locator('[data-ocx-theme]').first().click();
    const after = before === 'dark' ? 'light' : 'dark';
    await expect(page.locator('html')).toHaveAttribute('data-theme', after);
    expect(await page.evaluate(() => localStorage.getItem('starlight-theme'))).toBe(after);
  });

  test('ocx:toast shows a toast', async ({ page }) => {
    await open(page, OCX);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('ocx:toast', { detail: { title: 'Hello' } })));
    await expect(page.locator('[data-zag-root="toast"] [data-part="root"][data-state="open"]')).toHaveCount(1);
  });
});

test('at 390px the menu popover lists the sections', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'mobile project only');
  await open(page, OCX);
  await page.locator('button.ocx-header__menu').click();
  await expect(page.locator('#ocx-header-menu')).toBeVisible();
  await expect(page.locator('#ocx-header-menu a')).not.toHaveCount(0);
});

test('neutral mode: brand and links present, no ecosystem menu, aria-current right', async ({ page }) => {
  await open(page, NEUTRAL);
  await expect(page.locator('.ocx-mega')).toHaveCount(0);
  await expect(page.locator('.ocx-header__brand')).toContainText('example');
  await expect(page.locator('.ocx-header__nav a[href="/docs/shell/neutral/"]')).toHaveAttribute('aria-current', 'page');
  // "/docs/shell/" is a prefix of the current path, so it is current too (starts-with rule).
  await expect(page.locator('.ocx-header__nav a')).toHaveCount(2);
});
