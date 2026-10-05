// ToggleButton (C-267, D-P5) on its story pages (stories/toggle-button/{default,states}): axe per state and scheme, Space and
// click toggle aria-pressed, the pressed look, and a layout that holds with images blocked.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { computed, resolve } from './tokens.ts';
import { settle } from './helpers/settle.ts';

const DEFAULT = '/docs/stories/toggle-button/default/';
const STATES = '/docs/stories/toggle-button/states/';
const button = (page: Page, name: string) => page.locator('main .ocx-ui-toggle-button', { hasText: name }).first();

for (const theme of ['light', 'dark'])
  for (const path of [DEFAULT, STATES])
    test(`ToggleButton: axe reports no violations in ${path.split('/')[4]} (${theme})`, async ({ page }) => {
      await page.goto(path);
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      await settle(page); // axe must read final colours, not a theme crossfade
      // Pressed and disabled states are on the page; press one more so the flipped state is covered too.
      await page.locator('#story .ocx-ui-toggle-button:not([aria-pressed="true"]):not(:disabled)').first().click();
      const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });

test('ToggleButton: the showcase renders every state', async ({ page }) => {
  await page.goto(STATES);
  const all = page.locator('main .ocx-ui-toggle-button');
  await expect(all.first()).toBeVisible();
  await expect(page.locator('main .ocx-ui-toggle-button[aria-pressed="true"]').first()).toBeVisible();
  await expect(page.locator('main .ocx-ui-toggle-button[aria-pressed="false"]').first()).toBeVisible();
  await expect(page.locator('main .ocx-ui-toggle-button[data-size="s"]').first()).toBeVisible();
  await expect(page.locator('main .ocx-ui-toggle-button[data-icon-only][aria-label]').first()).toBeVisible();
  await expect(page.locator('main .ocx-ui-toggle-button:disabled').first()).toBeVisible();
});

test('ToggleButton: Space toggles aria-pressed and logs the change event', async ({ page }) => {
  await page.goto(DEFAULT);
  const demo = page.locator('#story .ocx-ui-toggle-button[data-value="hidden"]');
  await expect(demo).toHaveAttribute('aria-pressed', 'false');
  await demo.focus();
  await page.keyboard.press('Space');
  await expect(demo).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(demo).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#story [role="log"]')).toContainText('ocx:toggle-button:change');
});

test('ToggleButton: a click toggles, a disabled button does not', async ({ page }) => {
  await page.goto(STATES);
  // The first linux is the "off" state; not filtered on aria-pressed, which the click flips.
  const off = button(page, 'linux');
  await expect(off).toHaveAttribute('aria-pressed', 'false');
  await off.click();
  await expect(off).toHaveAttribute('aria-pressed', 'true');
  const disabled = page.locator('main .ocx-ui-toggle-button:disabled[aria-pressed="false"]').first();
  await disabled.click({ force: true });
  await expect(disabled).toHaveAttribute('aria-pressed', 'false');
});

test('ToggleButton: pressed wears the accent border, accent ink and accent tint; off does not', async ({ page }) => {
  await page.goto(STATES);
  const on = page.locator('main .ocx-ui-toggle-button[aria-pressed="true"]:not(:disabled)').first();
  const off = page.locator('main .ocx-ui-toggle-button[aria-pressed="false"]:not(:disabled)').first();
  const accent = await resolve(page, 'border-top-color', 'var(--ocx-color-accent)');
  const ink = await resolve(page, 'color', 'var(--ocx-color-accent-fg)');
  const tint = await resolve(page, 'background-color', 'var(--ocx-color-accent-tint)');
  expect(await computed(on, 'border-top-color')).toBe(accent);
  expect(await computed(on, 'color')).toBe(ink);
  expect(await computed(on, 'background-color')).toBe(tint);
  expect(await computed(off, 'border-top-color')).not.toBe(accent);
  expect(await computed(off, 'background-color')).not.toBe(tint);
});

test('ToggleButton: a keyboard-focused button shows the focus ring', async ({ page }) => {
  await page.goto(STATES);
  const first = page.locator('main .ocx-ui-toggle-button:not(:disabled)').first();
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  expect(await first.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
  expect(await computed(first, 'outline-style')).not.toBe('none');
});

test('ToggleButton: layout is the same with images blocked (AGENTS.md assets rule)', async ({ page, context }) => {
  const boxes = async () => {
    await page.goto(STATES);
    await page.evaluate(() => document.fonts.ready);
    return page.locator('main .ocx-ui-toggle-button').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map(Math.round).join(',');
      }),
    );
  };
  const loaded = await boxes();
  await context.route('**/*', (r) => (r.request().resourceType() === 'image' ? r.abort() : r.continue()));
  expect(await boxes()).toEqual(loaded);
});
