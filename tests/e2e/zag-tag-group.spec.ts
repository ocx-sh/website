// TagGroup (C-272, S-113, C-130c/d/e/g/h) on the built story pages: selectable groups stay idle
// until touched, single selects one, multiple toggles several, arrows walk wrapped chips, removable
// chips go by mouse and keyboard with focus handed on, first paint is final, axe per state, no leak.
// Desktop chromium: the leak helper and the pixel comparison need CDP and one viewport.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoLeak } from './helpers/leak.ts';

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

const STORY = '/docs/stories/tag-group/';
const DEMO = `${STORY}default/`; // filter chips, multiple, with an EventLog
const REMOVE = `${STORY}demo/`; // removable labels, with an EventLog
const PAGE = `${STORY}states/`; // every state, in StateGrid cells
const CHUNK = /\/toggle-group\.zag\.[^/]*\.js$/;

const state = (page: Page, label: string) =>
  page.locator('.showcase-state').filter({ has: page.locator('figcaption', { hasText: new RegExp(`^${label}$`) }) });
const demo = (page: Page) => page.locator('#story [data-zag-root="tag-group"]');
const removeDemo = (page: Page) => page.locator('#story ul[data-ocx-tag-group]');
const log = (page: Page) => page.locator('#story [role="log"] li');
const chip = (root: Locator, name: string) => root.getByRole('button', { name, exact: true });
const removeButton = (root: Locator, label: string) =>
  root.getByRole('button', { name: `Remove ${label}`, exact: true });

async function live(root: Locator) {
  await root.hover();
  await expect(root).toHaveAttribute('data-zag-state', 'live');
}

async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('C-113 selectable groups stay idle without input and go live on first hover', async ({ page }) => {
  await page.goto(PAGE);
  const roots = page.locator('[data-zag-root="tag-group"]');
  expect(await roots.count()).toBeGreaterThanOrEqual(4);
  await page.waitForTimeout(2000);
  await expect(page.locator('[data-zag-root="tag-group"]:not([data-zag-state="idle"])')).toHaveCount(0);
  await live(roots.first());
  // 'none' mode is not a Zag root.
  await page.goto(REMOVE);
  await expect(page.locator('ul[data-ocx-tag-group]')).toHaveCount(1);
  await expect(page.locator('ul[data-ocx-tag-group][data-zag-root]')).toHaveCount(0);
});

test('S-113 multiple: toggling linux and windows logs both values; a second click releases', async ({ page }) => {
  await page.goto(DEMO);
  const root = demo(page);
  await expect(root).toHaveAttribute('role', 'group');
  await chip(root, 'linux').click(); // may arrive before live: replayed (C-104)
  await expect(chip(root, 'linux')).toHaveAttribute('aria-pressed', 'true');
  await chip(root, 'windows').click();
  await expect(chip(root, 'windows')).toHaveAttribute('aria-pressed', 'true');
  await expect(log(page).first()).toHaveText('ocx:tag-group:change {"value":["linux","windows"]}');
  await expect(log(page).nth(1)).toHaveText('ocx:tag-group:change {"value":["linux"]}');
  await chip(root, 'linux').click();
  await expect(chip(root, 'linux')).toHaveAttribute('aria-pressed', 'false');
  await expect(log(page).first()).toHaveText('ocx:tag-group:change {"value":["windows"]}');
  await expect(page.locator('#story [role="log"]')).not.toContainText('ocx:toggle-group');
});

test('S-113 single: a radio group with exactly one checked, not deselectable', async ({ page }) => {
  await page.goto(PAGE);
  const root = state(page, 'single, one on').locator('[data-zag-root="tag-group"]');
  await expect(root).toHaveAttribute('role', 'radiogroup');
  const radios = root.getByRole('radio');
  await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true');
  await live(root);
  await radios.nth(2).click();
  await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true');
  await expect(root.locator('[aria-checked="true"]')).toHaveCount(1);
  await radios.nth(2).click();
  await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true');
});

test('C-130d arrows walk wrapped chips linearly; Home, End and Space work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(PAGE);
  const root = state(page, 'many chips wrapping').locator('[data-zag-root="tag-group"]');
  const chips = root.locator('[data-part="item"]');
  const n = await chips.count();
  const tops = await chips.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(new Set(tops).size, 'the chips wrap onto several lines').toBeGreaterThan(1);
  const firstBreak = tops.findIndex((t) => t !== tops[0]);

  await root.focus(); // the group's Tab stop, before the machine is live
  await expect(root).toHaveAttribute('data-zag-state', 'live');
  await expect(chips.first()).toBeFocused();
  for (let i = 0; i < firstBreak; i++) await page.keyboard.press('ArrowRight');
  await expect(chips.nth(firstBreak), 'ArrowRight crosses onto the next line').toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(chips.nth(firstBreak - 1), 'ArrowLeft goes back to the end of the line above').toBeFocused();
  await page.keyboard.press('End');
  await expect(chips.nth(n - 1)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(chips.first(), 'wraps at the end').toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  // Zag moves roving focus in the next frame: Space before it would press the previous chip.
  await expect(chips.nth(1)).toBeFocused();
  await page.keyboard.press(' ');
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'false');
});

test('removable by mouse: the chip goes, the event logs, focus moves to the next remove button', async ({ page }) => {
  await page.goto(REMOVE);
  const root = removeDemo(page);
  await removeButton(root, 'stable').click();
  await expect(root.locator('[data-value="stable"]')).toHaveCount(0);
  await expect(removeButton(root, 'beta')).toBeFocused();
  await expect(log(page).first()).toHaveText('ocx:tag-group:remove {"value":"stable"}');
});

test('removable by keyboard: Backspace/Delete remove, focus goes next, previous, then the group', async ({ page }) => {
  await page.goto(PAGE);
  const root = state(page, 'removable').locator('ul[data-ocx-tag-group]');
  await removeButton(root, 'linux').focus();
  await page.keyboard.press('Backspace');
  await expect(removeButton(root, 'macos')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(removeButton(root, 'windows')).toBeFocused();
  await page.keyboard.press('Delete');
  await expect(removeButton(root, 'macos'), 'no next: the previous one').toBeFocused();
  await page.keyboard.press('Enter');
  await expect(root.locator('li')).toHaveCount(0);
  await expect(root, 'empty: the group itself').toBeFocused();
  await expect(page.locator(`#${await root.getAttribute('aria-labelledby')}`)).toHaveText('Tags');
  await axe(page);
});

test('a prevented ocx:tag-group:remove keeps the chip and focus', async ({ page }) => {
  await page.goto(REMOVE);
  await page.evaluate(() => document.addEventListener('ocx:tag-group:remove', (e) => e.preventDefault()));
  const root = removeDemo(page);
  await removeButton(root, 'cli').click();
  await expect(root.locator('[data-value="cli"]')).toHaveCount(1);
  await expect(removeButton(root, 'cli')).toBeFocused();
  await expect(log(page).first()).toHaveText('ocx:tag-group:remove {"value":"cli"}');
});

test('C-130c first paint is final: SSR (chunk blocked) equals the live default state', async ({ page }) => {
  const region = (p: Page) => state(p, 'multiple, two on').locator('[data-zag-root="tag-group"]');
  await page.route(CHUNK, (r) => r.abort());
  await page.goto(PAGE);
  const before = await region(page).screenshot({ animations: 'disabled', caret: 'hide' });
  await page.unroute(CHUNK);
  await page.goto(PAGE);
  await live(region(page));
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const after = await region(page).screenshot({ animations: 'disabled', caret: 'hide' });
  expect(after.equals(before), 'pixel-exact first paint').toBe(true);
});

for (const theme of ['light', 'dark'])
  for (const path of [DEMO, REMOVE, PAGE])
    test(`C-130e axe is clean in ${path}, idle and live, after toggles (${theme})`, async ({ page }) => {
      await page.goto(path);
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      await axe(page);
      for (const root of await page.locator('[data-zag-root="tag-group"]').all()) await live(root);
      if (path === DEMO) await chip(demo(page), 'macos').click();
      if (path === PAGE) await state(page, 'single, one on').getByRole('radio').first().click();
      await axe(page);
    });

test('C-130h toggle-group.zag leaks nothing over 20 toggle cycles of a tag group', async ({ page }) => {
  await page.goto(PAGE);
  // A group without an event log: the log's own entries are not the component's nodes.
  const root = state(page, 'multiple, two on').locator('[data-zag-root="tag-group"]');
  await live(root);
  const [a, b] = [chip(root, 'macos'), chip(root, 'freebsd')];
  await expectNoLeak(page, async () => {
    await a.click();
    await b.click();
    await a.click();
    await b.click();
  });
});
