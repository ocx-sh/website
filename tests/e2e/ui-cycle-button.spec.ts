// CycleButton on its stories (stories/cycle-button/{default,states}) and the header theme switch on
// components/cycle-button.mdx: axe per scheme, click, Space and Enter step through the
// states and wrap, the name (aria-label) and a shown label follow the state, the change event is logged, disabled is inert, forced
// colours keep the glyph visible, and the layout holds with images blocked.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { computed } from './tokens.ts';

const DOC = '/docs/components/cycle-button/';
const PAGE = '/docs/stories/cycle-button/default/';
const STATES = '/docs/stories/cycle-button/states/';
const demo = (page: Page) => page.locator('#story .ocx-ui-cycle-button').first();
// The current glyph; the showcase demo's states have distinct icons (sun, moon, monitor).
const current = (button: ReturnType<typeof demo>) => button.locator('.ocx-ui-cycle-button__current');

for (const theme of ['light', 'dark'])
  for (const path of [PAGE, STATES])
    test(`CycleButton: axe reports no violations on ${path} (${theme})`, async ({ page }) => {
      await page.goto(path);
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      await demo(page).click();
      const { violations } = await new AxeBuilder({ page }).include('main').analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });

test('CycleButton: the states story renders every state, one visible glyph each', async ({ page }) => {
  await page.goto(STATES);
  const all = page.locator('main .ocx-ui-cycle-button');
  expect(await all.count()).toBeGreaterThanOrEqual(8);
  for (const b of await all.all()) await expect(b.locator('svg:visible')).toHaveCount(1);
  await expect(page.locator('main .ocx-ui-cycle-button[data-size="s"]').first()).toBeVisible();
  await expect(page.locator('main .ocx-ui-cycle-button[data-variant="ghost"]').first()).toBeVisible();
  const labelled = page.locator('main .ocx-ui-cycle-button:not([data-icon-only])').first();
  await expect(labelled.locator('.ocx-ui-cycle-button__label')).toHaveText('Ascending');
  await labelled.click();
  await expect(labelled.locator('.ocx-ui-cycle-button__label')).toHaveText('Descending');
  await expect(labelled).toHaveAccessibleName('Descending (click for Ascending)');
  await expect(page.locator('main .ocx-ui-cycle-button:disabled').first()).toBeVisible();
});

test('CycleButton: a click swaps the glyph, wraps after the last state, and the name follows', async ({ page }) => {
  await page.goto(PAGE);
  const button = demo(page);
  await expect(current(button)).toHaveAttribute('data-icon', 'sun');
  await expect(button).toHaveAccessibleName('Light (click for Dark)');
  await button.click();
  await expect(current(button)).toHaveAttribute('data-icon', 'moon');
  await expect(button).toHaveAttribute('data-value', 'dark');
  await expect(button).toHaveAccessibleName('Dark (click for Auto)');
  await button.click();
  await expect(current(button)).toHaveAttribute('data-icon', 'monitor');
  await button.click();
  await expect(current(button)).toHaveAttribute('data-icon', 'sun');
  await expect(button.locator('svg:visible')).toHaveCount(1);
});

test('CycleButton: Space and Enter advance it and the change event is logged', async ({ page }) => {
  await page.goto(PAGE);
  const button = demo(page);
  await button.focus();
  await page.keyboard.press('Space');
  await expect(button).toHaveAttribute('data-value', 'dark');
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('data-value', 'auto');
  await expect(page.locator('#story [role="log"]')).toContainText('ocx:cycle-button:change');
});

test('CycleButton: a named button submits its current value', async ({ page }) => {
  await page.goto(PAGE);
  const sort = page.locator('#story .ocx-ui-cycle-button[data-variant="ghost"]');
  const input = sort.locator('input[name="order"]');
  await expect(input).toHaveValue('asc');
  await sort.click();
  await expect(input).toHaveValue('desc');
});

test('CycleButton: a disabled button does not advance', async ({ page }) => {
  await page.goto(STATES);
  const disabled = page.locator('main .ocx-ui-cycle-button:disabled').first();
  const before = await disabled.getAttribute('data-value');
  await disabled.click({ force: true });
  await expect(disabled).toHaveAttribute('data-value', before ?? '');
});

test('CycleButton: a keyboard-focused button shows the focus ring', async ({ page }) => {
  await page.goto(STATES);
  const first = page.locator('main .ocx-ui-cycle-button:not(:disabled)').first();
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  expect(await first.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
  expect(await computed(first, 'outline-style')).not.toBe('none');
});

test('CycleButton: forced colours keep the current glyph visible in system ink', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto(PAGE);
  const svg = demo(page).locator('svg:visible');
  await expect(svg).toBeVisible();
  const ink = await computed(demo(page), 'color');
  expect(await svg.evaluate((el) => getComputedStyle(el).stroke)).toBe(ink);
});

test('CycleButton: the theme switch in the header flips the theme and its glyph', async ({ page }) => {
  await page.goto(DOC);
  const toggle = page.locator('.ocx-header [data-ocx-theme]').first();
  const html = page.locator('html');
  const start = (await html.getAttribute('data-theme')) === 'dark' ? 'dark' : 'light';
  const other = start === 'dark' ? 'light' : 'dark';
  const glyph = { light: 'sun', dark: 'moon' } as const;
  await expect(toggle.locator('svg:visible')).toHaveAttribute('data-icon', glyph[start]);
  const name = { light: 'Light mode (click for Dark mode)', dark: 'Dark mode (click for Light mode)' } as const;
  await expect(toggle).toHaveAccessibleName(name[start]);
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', other);
  await expect(toggle.locator('svg:visible')).toHaveAttribute('data-icon', glyph[other]);
  await expect(toggle).toHaveAccessibleName(name[other]);
  // The mobile menu's toggle follows (it renders the same button).
  await expect(page.locator('[data-ocx-theme]').last()).toHaveAttribute('data-value', other);
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', start);
});

test('CycleButton: layout is the same with images blocked (AGENTS.md assets rule)', async ({ page, context }) => {
  const boxes = async () => {
    await page.goto(STATES);
    await page.evaluate(() => document.fonts.ready);
    return page.locator('main .ocx-ui-cycle-button').evaluateAll((els) =>
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
