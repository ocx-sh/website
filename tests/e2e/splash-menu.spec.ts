// A page without a sidebar (`template: splash`, the probe page) reaches the site sections through the
// header's own menu button and drawer at phone width; at desktop width the header nav stays and the
// button is hidden. Mobile cases skip outside the `mobile` project (390x844) and vice versa.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGE = '/docs/probe/splash/';
const DRAWER = '#ocx-header-menu';

test('splash 390px: the menu button opens the drawer with the section rows', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-viewport-only case');
  await page.goto(PAGE);
  const button = page.locator('.ocx-header__menu');
  await expect(button).toBeVisible();
  // The slot reserved for the sidebar toggle is gone: nothing clips at the inline end.
  const box = await button.boundingBox();
  expect(box && box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await button.click();
  const drawer = page.locator(DRAWER);
  await expect(drawer).toBeVisible();
  for (const name of ['docs', 'catalog', 'install']) {
    const row = drawer.getByRole('link', { name, exact: true });
    await expect(row).toBeVisible();
    expect((await row.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  const solutions = drawer.locator('button[popovertarget="ocx-ecosystem-menu"]');
  await expect(solutions).toBeVisible();
  expect((await solutions.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  // The one visible ecosystem trigger lives in the drawer (the header's is hidden at <= 640px).
  await expect(page.locator('button[popovertarget="ocx-ecosystem-menu"]').filter({ visible: true })).toHaveCount(1);

  await solutions.click();
  await expect(page.locator('#ocx-ecosystem-menu')).toBeVisible();
  const violations = (await new AxeBuilder({ page }).include('.ocx-header').analyze()).violations;
  expect(violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

test('splash desktop: the header nav shows and there is no menu button', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'desktop-viewport-only case');
  await page.goto(PAGE);
  await expect(page.locator('.ocx-header__nav')).toBeVisible();
  await expect(page.locator('.ocx-header__menu')).toBeHidden();
});
