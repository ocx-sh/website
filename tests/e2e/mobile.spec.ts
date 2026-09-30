// C-023 at 390px (playwright.config.ts `mobile` project, viewport 390x844):
// the ecosystem menu (popover) must coexist with Starlight's own mobile
// sidebar pane (`sl-sidebar-pane`) rather than fighting it for space/focus.
// Mobile-only cases skip outside the `mobile` project and vice versa.
import { AxeBuilder } from '@axe-core/playwright';
import { settle } from './helpers/settle.ts';
import { expect, test, type Page } from '@playwright/test';
import { expectNoLeak } from './helpers/leak.ts';
import { writeFile } from 'node:fs/promises';

const writeShot = async (path: string, body: Buffer) => (await writeFile(path, body), path);

const openState = (page: Page, sel: string) => page.locator(sel).evaluate((el) => el.matches(':popover-open'));
const SIDEBAR = '#starlight__sidebar';
const MENU = '#ocx-ecosystem-menu';

test('C-023 390px: ecosystem menu works with the mobile menu (sl-sidebar-pane) open', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-viewport-only case');
  await page.goto('/docs/components/code/');
  await page.locator('.sl-menu-button').click();
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);

  // The mobile menu carries the ecosystem hubs as plain links (no-JS path).
  const sections = page.locator(`${SIDEBAR} .ocx-mobile-sections`);
  await expect(sections.getByRole('link', { name: 'integrations' })).toBeVisible();
  await expect(sections.getByRole('link', { name: 'apps' })).toBeVisible();

  // The header's trigger is hidden at ≤ 640px; the pane carries its own. An
  // invoker inside the open pane nests the menu under it, so opening the menu
  // does not light-dismiss the pane. It sits outside the header's Zag root, so
  // it keeps its popovertarget whether or not the nav machine has started (C-192).
  const trigger = page.locator('button[popovertarget="ocx-ecosystem-menu"]').filter({ visible: true });
  await expect(trigger).toHaveCount(1);
  await expect(page.locator(SIDEBAR).locator('button[popovertarget="ocx-ecosystem-menu"]')).toBeVisible();
  // WCAG 2.5.8: at least 24×24 CSS px.
  const box = await trigger.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(24);
  expect(box?.height).toBeGreaterThanOrEqual(24);
  await trigger.click();
  await expect.poll(() => openState(page, MENU)).toBe(true);
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
  // Top layer, on screen, and usable: a rail tab switches the panel.
  await expect(page.locator(MENU)).toBeInViewport({ ratio: 1 });
  await page.locator(MENU).getByRole('tab', { name: 'apps', exact: true }).click();
  await expect(page.locator('.ocx-mega__panel[data-ocx-hub="apps"]')).toBeVisible();

  // Esc closes the ecosystem menu first; the pane stays.
  await page.keyboard.press('Escape');
  await expect.poll(() => openState(page, MENU)).toBe(false);
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
});

test('C-023 390px: axe reports no violations with the mobile menu and the ecosystem menu open', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-viewport-only case');
  await page.goto('/docs/');
  await page.locator('.sl-menu-button').click();
  await page.locator(`${SIDEBAR} button[popovertarget="ocx-ecosystem-menu"]`).click();
  await expect.poll(() => openState(page, MENU)).toBe(true);
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('C-023 >390px: ecosystem menu works without the mobile sidebar pane present', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'desktop-viewport-only case');
  await page.goto('/docs/components/code/');
  // Desktop: Starlight drops the pane's popover attribute; the sidebar is in-flow.
  await expect(page.locator(SIDEBAR)).not.toHaveAttribute('popover');
  await expect(page.locator('.sl-menu-button')).toBeHidden();
  await page.locator('.ocx-header__nav button[data-ocx-section="ecosystem"]').click();
  await expect.poll(() => openState(page, MENU)).toBe(true);
  await expect(page.locator(SIDEBAR)).toBeVisible();
});

test('C-023 C-192 720px: after the nav machine started, the pane-opened panel nests in the pane (clicks and the first Esc spare it)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'desktop project at a middle width (header nav and pane both present)');
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto('/docs/components/code/');
  const root = page.locator('.ocx-header [data-zag-root="navigation-menu"]');
  await page.locator('nav.ocx-header__nav').hover();
  await expect(root).toHaveAttribute('data-zag-state', 'live');
  await page.locator('.sl-menu-button').click();
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
  await page.locator(`${SIDEBAR} button[popovertarget="ocx-ecosystem-menu"]`).click();
  await expect.poll(() => openState(page, MENU)).toBe(true);
  await page.locator(MENU).getByRole('tab', { name: 'apps', exact: true }).click();
  await expect(page.locator('.ocx-mega__panel[data-ocx-hub="apps"]')).toBeVisible();
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => openState(page, MENU)).toBe(false);
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
  // A panel the header machine opened on hover (`manual`) over the open drawer: the first Esc closes
  // it and spares the drawer, the second closes the drawer and focus (in the pane) returns to the toggle.
  // The page's own sidebar link: the pane's section links below mark the current section (C-007) too.
  await page.locator(`${SIDEBAR} .top-level a[aria-current="page"]`).focus();
  await page.locator(`.ocx-header__nav button[aria-controls="${MENU.slice(1)}"]`).hover();
  await expect.poll(() => openState(page, MENU)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => openState(page, MENU)).toBe(false);
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => openState(page, SIDEBAR)).toBe(false);
  await expect(page.locator('.sl-menu-button')).toBeFocused();
});

// C-231 / S-102: the mobile menu on Zag `drawer` (mobile-menu.zag.mjs), started by the toggle's
// first tap. Leak coverage (C-115): mobile-menu.zag.
const TOGGLE = '.sl-menu-button';
const ROOT = '.ocx-menu[data-zag-root="drawer"]';
const MENU_CHUNK = /mobile-menu\.zag|drawer\.zag/;
const mobileOnly = (name: string) => test.skip(name !== 'mobile', 'mobile-viewport-only case');
const focusIn = (page: Page, sel: string) =>
  page.locator(sel).evaluate((el) => el.contains(document.activeElement) || el === document.activeElement);

test('C-231 S-102: no drawer chunk before input; the first tap opens the drawer, Esc closes it and focus returns', async ({
  page,
}, testInfo) => {
  mobileOnly(testInfo.project.name);
  const chunks: string[] = [];
  page.on('request', (r) => MENU_CHUNK.test(r.url()) && chunks.push(r.url()));
  await page.goto('/docs/components/code/');
  await page.waitForLoadState('networkidle');
  expect(chunks, 'first paint loads no drawer code').toEqual([]);
  await expect(page.locator(ROOT)).toHaveAttribute('data-zag-state', 'idle');
  // JS-off fallback in the markup until the machine takes over.
  await expect(page.locator(TOGGLE)).toHaveAttribute('popovertarget', 'starlight__sidebar');

  await page.locator(TOGGLE).tap();
  await expect(page.locator(ROOT)).toHaveAttribute('data-zag-state', 'live');
  expect(chunks.length).toBeGreaterThan(0);
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
  await expect(page.locator(TOGGLE)).not.toHaveAttribute('popovertarget');
  await expect(page.locator(TOGGLE)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(SIDEBAR)).toHaveAttribute('role', 'dialog');
  await expect(page.locator(SIDEBAR)).toHaveAccessibleName('Menu');
  await expect.poll(() => focusIn(page, SIDEBAR)).toBe(true);
  // Starlight's modality: the main frame is inert and the page does not scroll.
  await expect(page.locator('.main-frame')).toHaveAttribute('inert', '');
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');

  await page.keyboard.press('Escape');
  await expect.poll(() => openState(page, SIDEBAR)).toBe(false);
  await expect(page.locator(TOGGLE)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(TOGGLE)).toBeFocused();
  await expect(page.locator('.main-frame')).not.toHaveAttribute('inert');
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
});

test('C-231: the backdrop closes the drawer; the toggle closes it too', async ({ page }, testInfo) => {
  mobileOnly(testInfo.project.name);
  await page.emulateMedia({ reducedMotion: 'reduce' }); // no slide-in: geometry is final at once
  await page.goto('/docs/components/code/');
  const toggle = page.locator(TOGGLE);
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const sheet = (await page.locator(SIDEBAR).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(sheet.width, 'a start sheet leaves the backdrop visible').toBeLessThan(viewport.width);
  await expect(page.locator(`${ROOT} > div`)).toBeVisible();
  await page.touchscreen.tap(sheet.x + sheet.width + (viewport.width - sheet.width) / 2, sheet.y + sheet.height / 2);
  await expect.poll(() => openState(page, SIDEBAR)).toBe(false);
  await expect(page.locator(`${ROOT} > div`)).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.tap();
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
  await toggle.tap();
  await expect.poll(() => openState(page, SIDEBAR)).toBe(false);
});

test('C-231: a swipe towards the start edge closes the drawer', async ({ page }, testInfo) => {
  mobileOnly(testInfo.project.name);
  await page.emulateMedia({ reducedMotion: 'reduce' }); // no slide-in: geometry is final at once
  await page.goto('/docs/components/code/');
  await page.locator(TOGGLE).tap();
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
  const box = (await page.locator(SIDEBAR).boundingBox())!;
  const y = box.y + box.height - 40; // below the list, on the sheet itself
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  for (let x = box.x + box.width - 20; x > box.x - box.width; x -= 25) await page.mouse.move(x, y);
  await page.mouse.up();
  await expect.poll(() => openState(page, SIDEBAR)).toBe(false);
});

test('C-231: keyboard: Enter on the toggle opens the drawer on that press; Tab stays in header and pane', async ({
  page,
}, testInfo) => {
  mobileOnly(testInfo.project.name);
  await page.goto('/docs/components/code/');
  await page.locator(TOGGLE).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
  await expect.poll(() => focusIn(page, SIDEBAR)).toBe(true);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await focusIn(page, '.main-frame'), 'focus never reaches the inert main frame').toBe(false);
  }
});

test('C-231: a pane opened natively before the script ran is closed by the next tap; the one after opens the drawer', async ({
  page,
}, testInfo) => {
  mobileOnly(testInfo.project.name);
  await page.goto('/docs/components/code/');
  // What a tap before the module script ran leaves behind: the pane open through its popovertarget.
  await page.locator(SIDEBAR).evaluate((el: HTMLElement) => el.showPopover());
  await page.locator(TOGGLE).tap();
  await expect.poll(() => openState(page, SIDEBAR)).toBe(false);
  await expect(page.locator(ROOT)).toHaveAttribute('data-zag-state', 'idle');
  await page.locator(TOGGLE).tap();
  await expect(page.locator(ROOT)).toHaveAttribute('data-zag-state', 'live');
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
});

test('C-231 S-102: the drawer chunk fails → the tap still opens the pane through its native popover', async ({
  page,
}, testInfo) => {
  mobileOnly(testInfo.project.name);
  await page.route(/mobile-menu\.zag/, (route) => route.abort());
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/docs/components/code/');
  await page.locator(TOGGLE).tap();
  await expect(page.locator(ROOT)).toHaveAttribute('data-zag-state', 'error');
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
  await expect(page.locator(TOGGLE)).toHaveAttribute('popovertarget', 'starlight__sidebar');
  // Later taps are the native popover's: close, open.
  await page.locator(TOGGLE).tap();
  await expect.poll(() => openState(page, SIDEBAR)).toBe(false);
  await page.locator(TOGGLE).tap();
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
  expect(errors.filter((e) => e.includes('[ocx] Zag failed to start'))).toHaveLength(1);
});

test.describe('C-231 JS off', () => {
  test.use({ javaScriptEnabled: false });
  test('the toggle opens the pane natively (popovertarget fallback)', async ({ page }, testInfo) => {
    mobileOnly(testInfo.project.name);
    await page.goto('/docs/components/code/');
    await page.locator(TOGGLE).tap();
    await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
    // The current page's link, inside its SSR-open group of the grouped sidebar (C-120).
    await expect(page.locator(SIDEBAR).getByRole('link', { name: 'Code', exact: true })).toBeVisible();
  });
});

test('C-231 ≥ 50em: the pane is a static column without a popover; the menu root stays idle and hidden', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'desktop-viewport-only case');
  await page.goto('/docs/components/code/');
  await expect(page.locator(SIDEBAR)).not.toHaveAttribute('popover');
  await expect(page.locator(SIDEBAR)).toBeVisible();
  await expect(page.locator(ROOT)).toBeHidden();
  await expect(page.locator(ROOT)).toHaveAttribute('data-zag-state', 'idle');
});

test('C-231: resizing to ≥ 50em while the drawer is open closes it and leaves the static column', async ({
  page,
}, testInfo) => {
  mobileOnly(testInfo.project.name);
  await page.goto('/docs/components/code/');
  await page.locator(TOGGLE).tap();
  await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
  await page.setViewportSize({ width: 1024, height: 844 });
  await expect(page.locator(SIDEBAR)).not.toHaveAttribute('popover');
  await expect(page.locator(SIDEBAR)).toBeVisible();
  await expect(page.locator('.main-frame')).not.toHaveAttribute('inert');
  await expect(page.locator(TOGGLE)).toHaveAttribute('aria-expanded', 'false');
});

test('C-130c: first paint is final: the header before any tap equals it after the drawer opened and closed', async ({
  page,
}, testInfo) => {
  mobileOnly(testInfo.project.name);
  // Fonts settled first: under load the first shot could otherwise catch the fallback face.
  const header = async () => {
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    return page.locator('header.header').screenshot({ animations: 'disabled' });
  };
  // No drawer code loads before the first tap, so this is the first paint.
  await page.goto('/docs/components/code/');
  const before = await header();
  // Opened from the keyboard: a tap leaves Chrome's transient tap highlight on the toggle.
  await page.locator(TOGGLE).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(ROOT)).toHaveAttribute('data-zag-state', 'live');
  await page.keyboard.press('Escape');
  await expect.poll(() => openState(page, SIDEBAR)).toBe(false);
  await expect(page.locator(TOGGLE)).toBeFocused(); // focus returned, then left: no focus ring
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(1, 400);
  // Two frames: the closed backdrop's compositor layer is gone (it can repaint the toggle's edges).
  await expect(page.locator(`${ROOT} > div`)).toBeHidden();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const after = await header();
  if (!after.equals(before))
    for (const [name, body] of [
      ['before', before],
      ['after', after],
    ] as const)
      await testInfo.attach(name, { path: await writeShot(testInfo.outputPath(`${name}.png`), body) });
  expect(after.equals(before), 'the header after the drawer ran differs from its first paint').toBe(true);
});

test('C-130h C-115 no leak over open → close cycles (mobile-menu.zag)', async ({ page }, testInfo) => {
  mobileOnly(testInfo.project.name);
  await page.goto('/docs/components/code/');
  await expectNoLeak(page, async () => {
    await page.locator(TOGGLE).click();
    await expect.poll(() => openState(page, SIDEBAR)).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => openState(page, SIDEBAR)).toBe(false);
  });
});
