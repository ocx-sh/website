// Breadcrumbs: the docs page trail (PageTitle, C-025) and its narrow-width fold, in a real engine:
// aria-current on the current page, the fold at 390px with the hidden items reachable by keyboard
// through the native popover, and no self-link on the section index.
import { expect, test } from '@playwright/test';

const DEEP = '/docs/components/tabs/'; // docs / Components / Navigation / Tabs (no root crumb)
const trail = (page: import('@playwright/test').Page) => page.locator('main nav.ocx-page-trail');

test.describe('Breadcrumbs', () => {
  test('the trail sits right before the H1, the current page last with aria-current and no link', async ({ page }) => {
    await page.goto(DEEP);
    const nav = trail(page);
    await expect(nav).toHaveAttribute('aria-label', 'Breadcrumbs');
    expect(await nav.evaluate((n) => n.nextElementSibling?.tagName)).toBe('H1');
    const current = nav.locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText('Tabs');
    expect(await current.evaluate((n) => n.closest('a'))).toBeNull();
    await expect(nav.locator('> ol > li').first()).toHaveText('docs');
    await expect(nav.locator('a[href="/"]')).toHaveCount(0);
    await expect(nav.locator('> ol > li > a[href="/docs/"]')).toHaveCount(1);
  });

  test('wide: every item shows, no ellipsis', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(DEEP);
    const nav = trail(page);
    await expect(nav.locator('.ocx-ui-crumbs__more')).toBeHidden();
    await expect(nav.locator('> ol > li[data-mid]').first()).toBeVisible();
  });

  test('390px: the middle folds into the ellipsis; keyboard opens and closes it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(DEEP);
    const nav = trail(page);
    for (const mid of await nav.locator('> ol > li[data-mid]').all()) await expect(mid).toBeHidden();
    const button = nav.getByRole('button', { name: /^Show \d+ more$/ });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(24);
    expect(box?.width).toBeGreaterThanOrEqual(24);

    await button.focus();
    await page.keyboard.press('Enter');
    const panel = nav.locator('.ocx-ui-crumbs__more > ul[popover]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Components');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  // The doc page's own trail, and the component's stories (the states story folds long trails in narrow cells).
  for (const path of [
    '/docs/components/breadcrumbs/',
    '/docs/stories/breadcrumbs/default/',
    '/docs/stories/breadcrumbs/states/',
  ])
    test(`the trail row never scrolls the page sideways at 390px: ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

  // Splash pages (no trail) are covered by route-middleware.test.ts: the example has none.
  // The section crumb of /docs/ links the page itself, so it is dropped; the trail is then the page
  // alone, and PageTitle renders no trail at all.
  test('the section index has no trail: its own section crumb is dropped, not linked', async ({ page }) => {
    await page.goto('/docs/');
    await expect(trail(page)).toHaveCount(0);
    await expect(page.locator('main h1')).toBeVisible();
  });
});
