// C-200 TreeView: a pointerdown outside the tree clears the selection (owner finding 2026-09-28).
// Everything else about the machine (keys, events, leaks, first paint) is covered in
// zag-collections.spec.ts; this file owns only the outside-click behaviour.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { activate } from './helpers/zag.ts';

const PATH = '/docs/stories/tree-view/default/';
const demo = (page: Page) => page.locator('#story [data-zag-root="tree-view"]');
const node = (page: Page, value: string): Locator => demo(page).locator(`[role="treeitem"][data-value="${value}"]`);
/** Loads the machine and waits for it, so the next click reaches a live tree. */
const live = async (page: Page) => {
  await activate(demo(page));
  await expect(demo(page)).toHaveAttribute('data-zag-state', 'live');
};

// The story page has no heading: the demo's own corner, left of the tree's first label, is outside it.
const outside = (page: Page) => page.mouse.click(1, 1);

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

test.beforeEach(async ({ page }) => {
  await page.goto(PATH);
  await live(page);
});

test('C-200 TreeView: a pointerdown outside the tree clears the selection', async ({ page }) => {
  const n = node(page, 'config');
  await n.click();
  await expect(n).toHaveAttribute('aria-selected', 'true');
  await outside(page);
  await expect(n).toHaveAttribute('aria-selected', 'false');
});

test('C-200 TreeView: a keyboard selection clears on an outside click too', async ({ page }) => {
  const n = node(page, 'config');
  await n.focus();
  await page.keyboard.press('Enter');
  await expect(n).toHaveAttribute('aria-selected', 'true');
  await outside(page);
  await expect(n).toHaveAttribute('aria-selected', 'false');
});

test('C-200 TreeView: a click inside the tree keeps the selection; Escape clears it', async ({ page }) => {
  const n = node(page, 'config');
  await n.click();
  await demo(page).locator('[data-part="label"]').click();
  await expect(n).toHaveAttribute('aria-selected', 'true');
  await n.focus();
  await page.keyboard.press('Escape');
  await expect(n).toHaveAttribute('aria-selected', 'false');
});
