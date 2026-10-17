// `src` on Popover and Hint (fetch on open) on their story pages: nothing is requested before the first
// open, the first open fetches once, reopening reuses it, an error offers Retry, and nothing moves.
import { AxeBuilder } from '@axe-core/playwright';
import { settle } from './helpers/settle.ts';
import { expect, test, type Locator, type Page } from '@playwright/test';

const STORY = '/docs/stories/';

/** Counts requests to `glob` from now on. */
function count(page: Page, glob: string) {
  let n = 0;
  page.on('request', (r) => {
    if (new RegExp(glob.replace(/\*\*/g, '.*').replace(/\./g, '\\.')).test(r.url())) n++;
  });
  return () => n;
}
const box = async (l: Locator) => {
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
};

test.describe('Popover src', () => {
  test('fetches only on the first open, then reuses the result; the page does not move', async ({ page }) => {
    await page.goto(`${STORY}popover/fetch/`);
    const requests = count(page, '/docs/fill/version.html');
    const root = page.locator('.ocx-ui-popover');
    const trigger = root.getByRole('button', { name: 'Version 1.4.2' });
    const before = {
      trigger: await box(trigger),
      height: await page.evaluate(() => document.documentElement.scrollHeight),
    };

    await trigger.hover();
    await expect(root).toHaveAttribute('data-zag-state', 'live');
    await settle(page);
    expect(requests(), 'the machine is live but the panel is closed: no fetch yet').toBe(0);

    await trigger.click();
    const region = root.locator('[data-fill]');
    await expect(region).toHaveAttribute('data-fill-state', 'ready');
    await expect(region).toContainText('Pinned by digest');
    expect(requests()).toBe(1);
    expect(await box(trigger)).toEqual(before.trigger);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(before.height);

    await page.keyboard.press('Escape');
    await expect(root.locator('[data-part="content"]')).toBeHidden();
    await trigger.click();
    await expect(root.locator('[data-part="content"]')).toBeVisible();
    await expect(region).toContainText('Pinned by digest');
    expect(requests(), 'reopening reuses the result').toBe(1);
  });

  test('keyboard: focus then Enter opens and fills; no console errors; axe clean', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${STORY}popover/fetch/`);
    const trigger = page.locator('.ocx-ui-popover').getByRole('button', { name: 'Version 1.4.2' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-fill]')).toHaveAttribute('data-fill-state', 'ready');
    await settle(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a failed fetch shows the error and Retry, which fetches again and recovers', async ({ page }) => {
    await page.goto(`${STORY}popover/fetch-error/`);
    const root = page.locator('.ocx-ui-popover');
    const region = root.locator('[data-fill]');
    await root.getByRole('button', { name: 'Version 0.0.0' }).click();
    await expect(region).toHaveAttribute('data-fill-state', 'error');
    await expect(region.getByText('No preview for this version.')).toBeVisible();
    await expect(region.locator('.ocx-ui-loader')).toBeHidden();
    await page.route('**/docs/fill/missing.html', (route) =>
      route.fulfill({ body: '<p>Recovered</p>', contentType: 'text/html' }),
    );
    const retry = region.getByRole('button', { name: 'Retry' });
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(region).toHaveAttribute('data-fill-state', 'ready');
    await expect(root.locator('[data-part="content"]')).toBeFocused();
    await expect(region).toHaveText('Recovered');
  });
});

test.describe('Hint src', () => {
  test('the first show fetches the text into the hint, once', async ({ page }) => {
    await page.goto(`${STORY}hint/fetch/`);
    const requests = count(page, '/docs/fill/hint.txt');
    const root = page.locator('.ocx-ui-hint');
    const content = root.locator('[data-part="content"]');
    await root.getByRole('button', { name: 'Release info' }).hover();
    await expect(root).toHaveAttribute('data-zag-state', 'live');
    await expect(content).toBeVisible();
    await expect(content).toHaveText('Released 12 Oct, 3 platforms');
    expect(requests()).toBe(1);
    await page.mouse.move(0, 0);
    await expect(content).toBeHidden();
    await root.getByRole('button', { name: 'Release info' }).hover();
    await expect(content).toBeVisible();
    expect(requests()).toBe(1);
  });

  test('nothing is requested on load or before the hint shows', async ({ page }) => {
    const requests = count(page, '/docs/fill/hint.txt');
    await page.goto(`${STORY}hint/fetch/`);
    await settle(page);
    expect(requests()).toBe(0);
  });
});

test('popover and hint fixtures exist (the routes the stories fetch)', async ({ request }) => {
  expect((await request.get('/docs/fill/version.html')).ok()).toBe(true);
  expect((await request.get('/docs/fill/hint.txt')).ok()).toBe(true);
});
