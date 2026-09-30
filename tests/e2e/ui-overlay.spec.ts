// Overlays on their story pages (stories/{select,menu,combobox}/, C-125):
// Menu (WP14b) is the Popover API; Select and Combobox are Zag (Z5), whose behaviour is
// tests/e2e/zag-form.spec.ts. Here: the stories hold the states, the popups wear the overlay
// tokens, menus anchor to their triggers.
import { AxeBuilder } from '@axe-core/playwright';
import { settle } from './helpers/settle.ts';
import { expect, test, type Locator, type Page } from '@playwright/test';

const STORY = '/docs/stories/';
const PAGE = {
  select: `${STORY}select/default/`,
  selectStates: `${STORY}select/states/`,
  menu: `${STORY}menu/default/`,
  menuStates: `${STORY}menu/states/`,
  combobox: `${STORY}combobox/default/`,
  comboboxStates: `${STORY}combobox/states/`,
};

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => {
  const b = await l.boundingBox();
  if (!b) throw new Error('element has no box');
  return b;
};
const isOpen = (l: Locator) => l.evaluate((e) => e.matches(':popover-open'));
const menus = (page: Page) => page.locator('.ocx-ui-menu');
const parts = (menu: Locator) => ({
  trigger: menu.locator('.ocx-ui-menu__trigger'),
  popup: menu.locator('.ocx-ui-menu__popup'),
});
async function axe(page: Page) {
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}
/** Resolve a CSS value (e.g. a token) to its computed form on a probe element. */
const resolve = (page: Page, prop: string, value: string) =>
  page.evaluate(
    ([p, v]) => {
      const probe = document.createElement('div');
      probe.style.setProperty(p, v);
      if (p.startsWith('border')) probe.style.borderStyle = 'solid';
      document.body.append(probe);
      const out = getComputedStyle(probe).getPropertyValue(p);
      probe.remove();
      return out;
    },
    [prop, value] as const,
  );

test('WP14b stories: Select (default + disabled), Combobox live states and at least two Menus (one align=end)', async ({
  page,
}) => {
  await page.goto(PAGE.select);
  await expect(page.locator('.ocx-ui-select button.ocx-ui-select__control').first()).toBeVisible();
  await page.goto(PAGE.selectStates);
  await expect(page.locator('button.ocx-ui-select__control:disabled').first()).toBeAttached();
  await page.goto(PAGE.comboboxStates);
  await expect(page.locator('[data-zag-root="combobox"]')).not.toHaveCount(0);
  await expect(page.locator('.ocx-ui-combobox input:disabled').first()).toBeAttached();
  expect(await page.locator('[inert]').count()).toBe(0);
  await page.goto(PAGE.menuStates);
  expect(await menus(page).count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.ocx-ui-menu[data-align="end"]').first()).toBeAttached();
});

test('WP14b overlays: axe reports no violations on the menu stories, closed and with a menu open', async ({ page }) => {
  await page.goto(PAGE.menuStates);
  await axe(page);
  const { trigger, popup } = parts(menus(page).first());
  await trigger.click();
  await expect(popup).toBeVisible();
  await axe(page);
});

for (const [name, open] of [
  ['Select', async (page: Page) => page.locator('#story .ocx-ui-select__control').click()],
  [
    'Combobox',
    async (page: Page) => {
      await page.locator('#story input[role="combobox"]').focus();
      await page.keyboard.press('ArrowDown');
    },
  ],
] as const)
  test(`C-161 C-162 ${name}: the open popup wears the overlay tokens (surface, border, radius-lg)`, async ({
    page,
  }) => {
    await page.goto(name === 'Select' ? PAGE.select : PAGE.combobox);
    await open(page);
    const surface = page.locator('#story .ocx-ui-overlay').first();
    await expect(surface).toBeVisible();
    const look = await surface.evaluate((e) => {
      const cs = getComputedStyle(e);
      return { bg: cs.backgroundColor, bw: cs.borderTopWidth, bc: cs.borderTopColor, r: cs.borderTopLeftRadius };
    });
    expect(look).toEqual({
      bg: await resolve(page, 'background-color', 'var(--ocx-color-surface)'),
      bw: await resolve(page, 'border-top-width', 'var(--ocx-border-width)'),
      bc: await resolve(page, 'border-top-color', 'var(--ocx-color-border)'),
      r: await resolve(page, 'border-top-left-radius', 'var(--ocx-radius-lg)'),
    });
  });

test('C-162 Combobox: the popup keeps its height while it fades out, then disappears', async ({ page }) => {
  await page.goto(PAGE.combobox);
  const input = page.locator('#story input[role="combobox"]');
  await input.focus();
  await page.keyboard.press('ArrowDown');
  const surface = page.locator('#story .ocx-ui-overlay').first();
  await expect(surface).toBeVisible();
  await settle(page);
  const open = (await box(surface)).height;
  await page.keyboard.press('Escape');
  const mid = await surface.evaluate((e) => ({
    height: e.getBoundingClientRect().height,
    running: e.getAnimations().some((a) => a instanceof CSSTransition),
  }));
  expect(mid.running).toBe(true);
  expect(mid.height).toBeGreaterThanOrEqual(open - 1);
  await expect(surface).toBeHidden();
});

test.describe('WP14b Menu (Popover API)', () => {
  // The states story holds three menus (start, end, icons); the first opens as the default one does.
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE.menuStates);
  });
  test('WP14b Menu: the trigger opens the popover; Escape closes it and returns focus to the trigger', async ({
    page,
  }) => {
    const { trigger, popup } = parts(menus(page).first());
    await trigger.click();
    await expect.poll(() => isOpen(popup)).toBe(true);
    await expect(popup).toBeVisible();
    await popup.locator('a.ocx-ui-menu__item').first().focus();
    await page.keyboard.press('Escape');
    await expect.poll(() => isOpen(popup)).toBe(false);
    await expect(trigger).toBeFocused();
  });

  test('WP14b Menu: Tabbing past the last item closes the popover (closeOnFocusOut)', async ({ page }) => {
    const { trigger, popup } = parts(menus(page).first());
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => isOpen(popup)).toBe(true);
    const items = popup.locator('a.ocx-ui-menu__item');
    const n = await items.count();
    expect(n).toBeGreaterThan(0);
    await page.keyboard.press('Tab');
    await expect(items.first()).toBeFocused();
    for (let i = 0; i < n; i++) await page.keyboard.press('Tab');
    await expect.poll(() => isOpen(popup)).toBe(false);
  });

  test('WP14b Menu: each popup anchors below its own trigger (end-aligned menus to its end edge); two menus never collide', async ({
    page,
  }) => {
    const count = await menus(page).count();
    expect(count).toBeGreaterThanOrEqual(2);
    const popups: Box[] = [];
    for (let i = 0; i < count; i++) {
      const menu = menus(page).nth(i);
      const { trigger, popup } = parts(menu);
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await expect.poll(() => isOpen(popup)).toBe(true);
      await popup.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
      const t = await box(trigger);
      const p = await box(popup);
      const label = `menu ${i}`;
      expect(p.y, `${label}: popup starts below its trigger`).toBeGreaterThanOrEqual(t.y + t.height - 1);
      expect(p.y - (t.y + t.height), `${label}: popup is anchored, not detached`).toBeLessThanOrEqual(16);
      if ((await menu.getAttribute('data-align')) === 'end')
        expect(Math.abs(p.x + p.width - (t.x + t.width)), `${label}: end edges align`).toBeLessThanOrEqual(1);
      else expect(Math.abs(p.x - t.x), `${label}: start edges align`).toBeLessThanOrEqual(1);
      popups.push({ ...p, y: p.y + (await page.evaluate(() => scrollY)) });
      await page.keyboard.press('Escape');
      await expect.poll(() => isOpen(popup)).toBe(false);
    }
    // Page coordinates: distinct triggers must never produce the same popup box.
    const keys = popups.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`);
    expect(new Set(keys).size).toBe(popups.length);
  });
});
