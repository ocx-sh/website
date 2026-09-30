// C-023, C-190…C-192, S-108: the header section nav on Zag navigation-menu and the ecosystem
// mega panel (its Content, a popover) at desktop width. Mobile-width coexistence with the sidebar
// pane lives in mobile.spec.ts.
import { expect, test, type Page } from '@playwright/test';
import { expectNoLeak } from './helpers/leak.ts';

// At 390 px the header container is ≤ 640 px, which hides the section nav
// (and the menu trigger) by design; mobile.spec.ts covers that width.
test.beforeEach(({ page: _page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'header nav is hidden at ≤ 640px; see mobile.spec.ts');
});

const CHUNK = /\/navigation-menu\.zag\.[^/]*\.js$/;
const root = (page: Page) => page.locator('.ocx-header [data-zag-root="navigation-menu"]');
/** The root has no box (display: contents): pointer and focus land on the nav inside it. */
const navEl = (page: Page) => page.locator('nav.ocx-header__nav');
const trigger = (page: Page) => page.locator('.ocx-header__nav button[data-ocx-section="ecosystem"]');
const menu = (page: Page) => page.locator('#ocx-ecosystem-menu');
const isOpen = (page: Page) => menu(page).evaluate((el) => el.matches(':popover-open'));
const tab = (page: Page, hub: string) => menu(page).getByRole('tab', { name: hub, exact: true });
const panel = (page: Page, hub: string) => page.locator(`.ocx-mega__panel[data-ocx-hub="${hub}"]`);

async function openMenu(page: Page) {
  await page.goto('/docs/');
  await trigger(page).click();
  await expect.poll(() => isOpen(page)).toBe(true);
}

test('C-190 ecosystem menu opens on click; a second click closes it', async ({ page }) => {
  await page.goto('/docs/');
  await expect(menu(page)).toBeHidden();
  await trigger(page).click(); // the hover starts the machine; the click is replayed once live
  await expect.poll(() => isOpen(page)).toBe(true);
  await expect(menu(page)).toBeVisible();
  await expect(root(page)).toHaveAttribute('data-zag-state', 'live');
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
  // C-192: the native fallback is gone once the machine owns the trigger.
  await expect(trigger(page)).not.toHaveAttribute('popovertarget');
  await trigger(page).click();
  await expect.poll(() => isOpen(page)).toBe(false);
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
});

test('C-190 ecosystem menu opens via keyboard (Enter/Space on the trigger)', async ({ page }) => {
  await page.goto('/docs/');
  await trigger(page).focus();
  await page.keyboard.press('Enter'); // may land before the machine is live: replayed once
  await expect.poll(() => isOpen(page)).toBe(true);
  await trigger(page).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => isOpen(page)).toBe(false);
  await trigger(page).focus();
  await page.keyboard.press('Space');
  await expect.poll(() => isOpen(page)).toBe(true);
});

test('C-190 hover opens the menu after the open delay; leaving closes it', async ({ page }) => {
  await page.goto('/docs/');
  await navEl(page).hover();
  await expect(root(page)).toHaveAttribute('data-zag-state', 'live');
  await trigger(page).hover();
  await expect.poll(() => isOpen(page)).toBe(true);
  await menu(page).hover(); // pointer crosses into the panel: it stays open
  await page.waitForTimeout(500);
  expect(await isOpen(page)).toBe(true);
  await page.mouse.move(2, 400);
  await expect.poll(() => isOpen(page)).toBe(false);
});

test('C-190 S-108 keyboard: Tab in loads the machine without losing the key, arrows, Enter, Esc', async ({ page }) => {
  await page.goto('/docs/');
  await page.locator('.ocx-header [data-ocx-section="docs"]').focus();
  await page.keyboard.press('ArrowRight'); // may arrive before the machine is live
  await expect(page.locator('.ocx-header [data-ocx-section="catalog"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(trigger(page)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.ocx-header [data-ocx-section="catalog"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect.poll(() => isOpen(page)).toBe(true);
  await page.keyboard.press('ArrowDown'); // into the panel: the selected hub tab
  await expect(tab(page, 'integrations')).toBeFocused();
  await page.keyboard.press('ArrowDown'); // vertical tabs, automatic activation
  await expect(tab(page, 'apps')).toBeFocused();
  await expect(tab(page, 'apps')).toHaveAttribute('aria-selected', 'true');
  await expect(panel(page, 'apps')).toBeVisible();
  await expect(panel(page, 'integrations')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect.poll(() => isOpen(page)).toBe(false);
  await expect(trigger(page)).toBeFocused();
});

test('C-190 ecosystem menu closes on Esc and returns focus to the trigger', async ({ page }) => {
  await openMenu(page);
  await tab(page, 'integrations').focus();
  await page.keyboard.press('Escape');
  await expect.poll(() => isOpen(page)).toBe(false);
  await expect(trigger(page)).toBeFocused();
});

test('C-190 ecosystem menu closes on outside click', async ({ page }) => {
  await openMenu(page);
  // A non-interactive spot outside the panel: in the content column, below
  // the panel. A link there would navigate, so the spot is checked to be
  // non-interactive and the URL must not change.
  const url = page.url();
  const [box, content] = await Promise.all([
    menu(page).boundingBox(),
    page.locator('main .sl-markdown-content').first().boundingBox(),
  ]);
  const x = (content?.x ?? 0) + 8;
  const y = Math.max((box?.y ?? 0) + (box?.height ?? 0) + 24, (content?.y ?? 0) + 8);
  const hit = await page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px ?? 0, py ?? 0);
      return el && !el.closest('a, button, input, label, summary, [popover]') ? el.tagName : null;
    },
    [x, y],
  );
  expect(hit, `outside-click target at ${x},${y}`).not.toBeNull();
  await page.mouse.click(x, y);
  expect(page.url()).toBe(url);
  await expect.poll(() => isOpen(page)).toBe(false);
});

test('C-190 ecosystem menu closes when focus leaves the panel', async ({ page }) => {
  await openMenu(page);
  // Tab from the trigger into the panel, then on until focus leaves it.
  await trigger(page).focus();
  await page.keyboard.press('Tab');
  expect(await menu(page).evaluate((el) => el.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 60 && (await menu(page).evaluate((el) => el.contains(document.activeElement))); i++) {
    await page.keyboard.press('Tab');
  }
  expect(await menu(page).evaluate((el) => el.contains(document.activeElement))).toBe(false);
  await expect.poll(() => isOpen(page)).toBe(false);
});

test('C-191 clicking a rail tab switches the hub panel and the strip blurb', async ({ page }) => {
  await openMenu(page);
  const blurb = (hub: string) => page.locator(`.ocx-mega__blurb[data-ocx-hub="${hub}"]`);
  await expect(panel(page, 'integrations')).toBeVisible();
  await expect(panel(page, 'apps')).toBeHidden();
  await expect(blurb('integrations')).toBeVisible();
  const height = (await menu(page).boundingBox())?.height;
  await tab(page, 'apps').click();
  await expect(panel(page, 'apps')).toBeVisible();
  await expect(panel(page, 'integrations')).toBeHidden();
  await expect(blurb('apps')).toBeVisible();
  await expect(blurb('integrations')).toBeHidden();
  // Panels share one cell: switching hubs never resizes the menu (close: the open slide may still
  // be moving the box, which rounds its height in the last float digits).
  expect((await menu(page).boundingBox())?.height).toBeCloseTo(height ?? NaN, 2);
});

test('C-191 hover/focus on an item shows its desc in the strip', async ({ page }) => {
  await openMenu(page);
  const item = page.locator('.ocx-mega__panel[data-ocx-hub="integrations"] .ocx-mega__item').first();
  const preview = item.locator('.ocx-mega__preview');
  const desc = item.locator('.ocx-mega__desc');
  await expect(preview).toBeHidden();
  await item.locator('.ocx-mega__link').hover();
  await expect(preview).toBeVisible();
  await expect(desc).toBeVisible();
  await expect(desc).not.toHaveText('');
  // Laid over the strip: same bottom edge as the strip cell.
  await expect
    .poll(async () => {
      const [p, s] = await Promise.all([preview.boundingBox(), page.locator('.ocx-mega__strip').boundingBox()]);
      return Math.abs((p?.y ?? 0) + (p?.height ?? 0) - ((s?.y ?? 0) + (s?.height ?? 0)));
    })
    .toBeLessThanOrEqual(2);

  // Focus alone (no hover) shows it too; the pointer rests on the panel so hover-leave never closes it.
  await page.mouse.move(
    ...(await menu(page)
      .locator('.ocx-mega__strip')
      .boundingBox()
      .then((b) => [(b?.x ?? 0) + 4, (b?.y ?? 0) + 4] as const)),
  );
  const second = page.locator('.ocx-mega__panel[data-ocx-hub="integrations"] a.ocx-mega__link').nth(1);
  await second.focus();
  await expect(second.locator('xpath=ancestor::li[1]').locator('.ocx-mega__desc')).toBeVisible();
});

test('C-190 the active section underline is drawn at SSR: first paint is final (C-130c)', async ({ page }) => {
  const header = page.locator('.ocx-header');
  await page.route(CHUNK, (r) => r.abort());
  await page.goto('/docs/components/code/');
  const before = await header.screenshot({ animations: 'disabled', caret: 'hide' });
  const docs = page.locator('.ocx-header [data-ocx-section="docs"]');
  expect(await docs.evaluate((el) => getComputedStyle(el).borderBottomStyle)).toBe('solid');
  await page.unroute(CHUNK);
  await page.goto('/docs/components/code/');
  await navEl(page).hover();
  await expect(root(page)).toHaveAttribute('data-zag-state', 'live');
  await page.mouse.move(2, 400);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect.poll(() => isOpen(page)).toBe(false);
  const after = await header.screenshot({ animations: 'disabled', caret: 'hide' });
  expect(after.equals(before), 'pixel-exact first paint').toBe(true);
});

test('C-192 a failed load restores the popovertarget fallback: the native popover still opens', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route(CHUNK, (r) => r.abort());
  await page.goto('/docs/');
  await navEl(page).hover();
  await expect(root(page)).toHaveAttribute('data-zag-state', 'error');
  await expect(trigger(page)).toHaveAttribute('popovertarget', 'ocx-ecosystem-menu');
  await trigger(page).click();
  await expect.poll(() => isOpen(page)).toBe(true);
  expect(errors.some((e) => e.includes('[ocx] Zag failed to start'))).toBe(true);
});

test('C-130h navigation-menu.zag leaks nothing over 20 open/close cycles', async ({ page }) => {
  await openMenu(page);
  await trigger(page).click();
  await expect.poll(() => isOpen(page)).toBe(false);
  await expectNoLeak(page, async () => {
    await trigger(page).click();
    await expect.poll(() => isOpen(page)).toBe(true);
    await tab(page, 'apps').click();
    await tab(page, 'integrations').click();
    await page.keyboard.press('Escape');
    await expect.poll(() => isOpen(page)).toBe(false);
  });
});

test.describe('JS disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('C-192 header renders every section link, aria-current on the active one; the popover opens natively', async ({
    page,
  }) => {
    await page.goto('/docs/components/code/');
    const nav = page.locator('nav.ocx-header__nav');
    await expect(nav.locator('a[data-ocx-section="docs"]')).toHaveAttribute('href', '/docs/');
    await expect(nav.locator('a[data-ocx-section="catalog"]')).toHaveAttribute('href', '/catalog/');
    await expect(nav.locator('button[data-ocx-section="ecosystem"]')).toBeVisible();
    await expect(page.locator('a.ocx-header__install')).toHaveAttribute('href', '/install/');
    await expect(page.locator('.ocx-header [aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('a[data-ocx-section="docs"]')).toHaveAttribute('aria-current', 'page');
    // The popover is native: it still opens without JS, on the first hub.
    await trigger(page).click();
    await expect.poll(() => isOpen(page)).toBe(true);
    await expect(panel(page, 'integrations')).toBeVisible();
    await expect(page.locator('.ocx-mega__rail a.ocx-mega__hub-link[href="/apps/"]')).toBeVisible();
  });
});
