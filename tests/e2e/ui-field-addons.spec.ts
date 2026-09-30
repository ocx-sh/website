// Select and Combobox slots `start` / `end` (field addons) on their "Sort field" stories: a
// slotted CycleButton flips the sort direction without opening the listbox (before and after the
// machine starts: mount() must not replay the click into the widget), is its own tab stop, and the
// Select popup hangs under the whole box. SSR shape: ui-field-addons.test.ts.
import { expect, test, type Locator, type Page } from '@playwright/test';

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

const CASES = [
  { name: 'select', path: '/docs/stories/select/sort-field/' },
  { name: 'combobox', path: '/docs/stories/combobox/sort-field/' },
] as const;

const live = (root: Locator) => expect(root).toHaveAttribute('data-zag-state', 'live');

for (const c of CASES) {
  test.describe(`field addons: ${c.name} sort field`, () => {
    const root = (page: Page) => page.locator(`#story [data-zag-root="${c.name}"]`);
    const control = (page: Page) => root(page).getByRole('combobox', { name: 'Sort by', exact: true });
    const toggle = (page: Page) => root(page).locator('.ocx-ui-cycle-button');
    const listbox = (page: Page) => page.getByRole('listbox', { name: 'Sort by', exact: true });

    test.beforeEach(async ({ page }) => {
      await page.goto(c.path);
    });

    test('clicking the slotted toggle flips the direction once and never opens the list, cold or live', async ({
      page,
    }) => {
      await expect(toggle(page)).toHaveAttribute('data-value', 'desc');
      // Cold: this click starts the machine; a replayed click would flip the toggle back.
      await toggle(page).click();
      await live(root(page));
      await expect(toggle(page)).toHaveAttribute('data-value', 'asc');
      await expect(control(page)).toHaveAttribute('aria-expanded', 'false');
      await expect(listbox(page)).toBeHidden();
      await toggle(page).click();
      await expect(toggle(page)).toHaveAttribute('data-value', 'desc');
      await expect(control(page)).toHaveAttribute('aria-expanded', 'false');
      await expect(listbox(page)).toBeHidden();
    });

    test('keyboard: the toggle is its own tab stop before the control; Enter flips it without opening', async ({
      page,
    }) => {
      await control(page).focus();
      await live(root(page));
      await page.keyboard.press('Shift+Tab');
      await expect(toggle(page)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(toggle(page)).toHaveAttribute('data-value', 'asc');
      await expect(control(page)).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('Tab');
      await expect(control(page)).toBeFocused();
      // The box shows focus while either sits in it (field.css :focus-within).
      const box = root(page).locator('[data-part="control"]');
      const border = await box.evaluate((el) => getComputedStyle(el).borderTopColor);
      await page.keyboard.press('Shift+Tab');
      expect(await box.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(border);
    });
  });
}

test('field addons: the Select popup hangs under the whole box, not just the trigger inside it', async ({ page }) => {
  await page.goto('/docs/stories/select/sort-field/');
  const root = page.locator('#story [data-zag-root="select"]');
  await root.getByRole('combobox', { name: 'Sort by', exact: true }).click();
  const list = page.getByRole('listbox', { name: 'Sort by', exact: true });
  await expect(list).toBeVisible();
  const box = await root.locator('[data-part="control"]').boundingBox();
  const popup = await list.boundingBox();
  expect(Math.abs((popup?.x ?? 0) - (box?.x ?? 99))).toBeLessThanOrEqual(1);
  expect(popup?.width ?? 0).toBeGreaterThanOrEqual((box?.width ?? 0) - 1);
});
