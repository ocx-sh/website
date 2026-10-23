// CommandPalette on its story pages (stories/command-palette/{default,wording}): open by trigger,
// Ctrl/Cmd+K (a second press closes) and "/" (opt-out per page); the dialog named "Search" with a
// hidden description; ArrowUp/Down with wrap, the first row highlighted, Enter opening the
// highlighted row, hover moving the highlight; rows as real links; picking closes before
// navigating; one Escape closes with text typed; every open starts clean; the 12vh / min(90vw,
// 560px) layout with the search bar pinned and only the results scrolling; nothing heavy loads
// before the first open; axe per scheme, open and closed.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settle } from './helpers/settle.ts';

const DEFAULT = '/docs/stories/command-palette/default/';
const WORDING = '/docs/stories/command-palette/wording/';
const HINT = 'Search packages by name or keyword, or documentation by title.';

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Search' });
const input = (page: Page) => page.locator('[data-cmdpalette-input]');
const options = (page: Page) => page.locator('[data-cmdpalette-list] [role="option"]');
const selected = (page: Page) => options(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-selected')));

async function openByKeyboard(page: Page, path = DEFAULT) {
  await page.goto(path);
  await page.keyboard.press('ControlOrMeta+K');
  await expect(input(page)).toBeFocused();
}

for (const theme of ['light', 'dark'])
  for (const state of ['closed', 'open with results'])
    test(`CommandPalette: axe reports no violations, ${state} (${theme})`, async ({ page }) => {
      await page.goto(DEFAULT);
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      if (state !== 'closed') {
        await page.keyboard.press('ControlOrMeta+K');
        await input(page).fill('n');
        await expect(options(page)).not.toHaveCount(0);
      }
      await settle(page);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });

test('D-094 / D-098 Ctrl/Cmd+K opens and a second press closes; "/" opens', async ({ page }) => {
  await page.goto(DEFAULT);
  await expect(dialog(page)).toBeHidden();
  await page.keyboard.press('ControlOrMeta+K');
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator('[data-cmdpalette-trigger]')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ControlOrMeta+K');
  await expect(dialog(page)).toBeHidden();
  await page.keyboard.press('/');
  await expect(dialog(page)).toBeVisible();
  await expect(input(page)).toHaveValue('');
});

test('D-094 a page that claims "/" opts out; the other ways in still work', async ({ page }) => {
  await page.goto(WORDING);
  await page.keyboard.press('/');
  await page.waitForTimeout(300);
  await expect(page.getByRole('dialog', { name: 'Find' })).toBeHidden();
  await page.keyboard.press('ControlOrMeta+K');
  await expect(page.getByRole('dialog', { name: 'Find' })).toBeVisible();
});

test('D-097 in a narrow real header the label and keycaps hide (base.css) and the trigger keeps its name', async ({
  page,
}) => {
  await page.goto(DEFAULT);
  // The theme's own header rules decide: a real `.ocx-header` in a 390px container.
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.style.inlineSize = '390px';
    const header = document.createElement('div');
    header.className = 'ocx-header';
    host.append(header);
    document.body.prepend(host);
    header.append(document.querySelector('.ocx-cmdpalette')!);
  });
  const trigger = page.locator('.ocx-header [data-cmdpalette-trigger]');
  await expect(trigger).toBeVisible();
  await expect(trigger.locator('.ocx-header__search-label')).toBeHidden();
  await expect(trigger.locator('.ocx-kbd-group')).toBeHidden();
  await expect(trigger).toHaveAccessibleName('Search packages');
  await expect(trigger).toHaveAttribute('aria-keyshortcuts', 'Control+K');
});

test('focus returns to the trigger when Escape closes a palette opened by clicking it', async ({ page }) => {
  await page.goto(DEFAULT);
  const trigger = page.locator('[data-cmdpalette-trigger]');
  await trigger.click();
  await expect(input(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('D-107 a Mac shows the Command glyph and anyone else Ctrl in the trigger keycap', async ({ page }) => {
  await page.goto(DEFAULT);
  const cap = page.locator('[data-cmdpalette-trigger] .ocx-kbd-key').first();
  await page.evaluate(() => (document.documentElement.dataset['platform'] = 'windows'));
  await expect(cap).toHaveText('Ctrl', { useInnerText: true });
  await page.evaluate(() => (document.documentElement.dataset['platform'] = 'mac'));
  await expect(cap).toContainText('⌘');
});

test('D-096 the dialog is named "Search" and described by a visually hidden text', async ({ page }) => {
  await openByKeyboard(page);
  await expect(dialog(page)).toHaveAccessibleDescription(/arrow keys/);
  const box = await page.locator('[data-part="title"]').boundingBox();
  expect(box!.width).toBeLessThanOrEqual(1);
});

test('D-103 the input turns the mobile helpers off and carries the placeholder', async ({ page }) => {
  await openByKeyboard(page);
  const field = input(page);
  await expect(field).toHaveAttribute('autocomplete', 'off');
  await expect(field).toHaveAttribute('autocorrect', 'off');
  await expect(field).toHaveAttribute('autocapitalize', 'off');
  await expect(field).toHaveAttribute('spellcheck', 'false');
  await expect(field).toHaveAttribute('placeholder', 'Search packages and docs…');
});

test('D-100 the empty-query hint shows on open, hides while typing and returns when cleared', async ({ page }) => {
  await openByKeyboard(page);
  await expect(page.locator('[data-cmdpalette-hint]')).toHaveText(HINT);
  await input(page).fill('n');
  await expect(page.locator('[data-cmdpalette-hint]')).toBeHidden();
  await input(page).fill('');
  await expect(page.locator('[data-cmdpalette-hint]')).toBeVisible();
});

test('D-095 the first row is highlighted; arrows move from the input and wrap; Enter opens the highlighted row', async ({
  page,
}) => {
  await openByKeyboard(page);
  await input(page).fill('n');
  await expect(options(page)).toHaveCount(5);
  expect(await selected(page)).toEqual(['true', 'false', 'false', 'false', 'false']);
  await expect(input(page)).toHaveAttribute('aria-activedescendant', (await options(page).first().getAttribute('id'))!);
  await page.keyboard.press('ArrowUp');
  expect(await selected(page)).toEqual(['false', 'false', 'false', 'false', 'true']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect(await selected(page)).toEqual(['false', 'true', 'false', 'false', 'false']);
  await expect(input(page)).toBeFocused();
  const hash = await options(page)
    .nth(1)
    .evaluate((a) => (a as HTMLAnchorElement).hash);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL((url) => url.hash === hash);
});

test('D-095 hovering a row moves the highlight there', async ({ page }) => {
  await openByKeyboard(page);
  await input(page).fill('n');
  await expect(options(page)).toHaveCount(5);
  await options(page).nth(3).hover();
  expect(await selected(page)).toEqual(['false', 'false', 'false', 'true', 'false']);
  const hash = await options(page)
    .nth(3)
    .evaluate((a) => (a as HTMLAnchorElement).hash);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL((url) => url.hash === hash);
});

test('D-101 rows are links grouped under their labels', async ({ page }) => {
  await openByKeyboard(page);
  await input(page).fill('n');
  await expect(options(page)).toHaveCount(5);
  await expect(page.locator('[data-cmdpalette-list] a[role="option"][href]')).toHaveCount(5);
  await expect(page.locator('.ocx-cmdpalette__group-label')).toHaveText(['Packages', 'Docs']);
  await expect(page.getByRole('group', { name: 'Docs' }).getByRole('option')).toHaveCount(2);
  await expect(page.locator('[data-cmdpalette-status]')).toHaveText('5 results');
});

test('D-102 picking a row with the mouse closes the palette and leaves it closed on the next open', async ({
  page,
}) => {
  await openByKeyboard(page);
  await input(page).fill('node');
  await options(page).first().click();
  await expect(dialog(page)).toBeHidden();
  await expect(page).toHaveURL(/#ocx\.sh\/runtimes\/node$/);
  await page.keyboard.press('ControlOrMeta+K');
  await expect(input(page)).toHaveValue('');
  await expect(options(page)).toHaveCount(0);
});

test('D-099 every open starts clean, with the input focused', async ({ page }) => {
  await openByKeyboard(page);
  await input(page).fill('zzz');
  await expect(page.locator('[data-cmdpalette-status]')).toHaveText('No results for “zzz”');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await page.keyboard.press('ControlOrMeta+K');
  await expect(input(page)).toBeFocused();
  await expect(input(page)).toHaveValue('');
  await expect(page.locator('[data-cmdpalette-status]')).toHaveText('');
  await expect(page.locator('[data-cmdpalette-hint]')).toBeVisible();
});

test('D-104 Escape closes in one press with text typed; the visible Esc button closes too', async ({ page }) => {
  await openByKeyboard(page);
  await input(page).fill('cmake');
  await expect(options(page)).not.toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await page.keyboard.press('ControlOrMeta+K');
  const close = page.getByRole('button', { name: 'Close (Esc)' });
  await expect(close).toBeVisible();
  await expect(close).toHaveText('Esc');
  await close.click();
  await expect(dialog(page)).toBeHidden();
});

test('D-105 the card sits 12vh from the top at min(90vw, 560px); the bar stays put while only the results scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  await openByKeyboard(page);
  await settle(page);
  const card = page.locator('[data-part="content"]');
  const box = (await card.boundingBox())!;
  expect(box.y).toBeCloseTo(520 * 0.12, 0);
  expect(box.width).toBeCloseTo(560, 0);
  const bar = page.locator('.ocx-cmdpalette__bar');
  const barBefore = (await bar.boundingBox())!;
  await input(page).fill('n');
  await expect(options(page)).toHaveCount(5);
  await settle(page);
  expect((await bar.boundingBox())!.y).toBeCloseTo(barBefore.y, 0);
  // Cap the results region so it must scroll: only it scrolls, never the card or the bar.
  await page.addStyleTag({ content: '.ocx-cmdpalette__results { max-block-size: 120px }' });
  const scroll = await page.evaluate(() => {
    const results = document.querySelector<HTMLElement>('.ocx-cmdpalette__results')!;
    const card = document.querySelector<HTMLElement>('[data-part="content"]')!;
    results.scrollTop = 40;
    return { results: results.scrollTop, card: card.scrollTop };
  });
  expect(scroll.results).toBeGreaterThan(0);
  expect(scroll.card).toBe(0);
  expect((await bar.boundingBox())!.y).toBeCloseTo(barBefore.y, 0);
  await page.setViewportSize({ width: 400, height: 520 });
  expect((await card.boundingBox())!.width).toBeCloseTo(360, 0);
});

test('D-106 nothing but the page script loads before the first open; the dialog, session and source load on it', async ({
  page,
}) => {
  const chunks: string[] = [];
  page.on(
    'request',
    (r) => /command-palette-(session|demo|live)|dialog\.zag|zag-runtime/.test(r.url()) && chunks.push(r.url()),
  );
  await page.goto(DEFAULT);
  await page.waitForLoadState('networkidle');
  expect(chunks).toEqual([]);
  await page.keyboard.press('ControlOrMeta+K');
  await expect(input(page)).toBeFocused();
  await input(page).fill('n');
  await expect(options(page)).not.toHaveCount(0);
  expect(chunks.some((u) => /command-palette-session/.test(u))).toBe(true);
  expect(chunks.some((u) => /command-palette-demo/.test(u))).toBe(true);
  expect(chunks.some((u) => /command-palette-live/.test(u))).toBe(true);
});

test('D-106 a chord pressed while the lazy half is still loading is queued: the browser does not get it, the palette opens when it arrives', async ({
  page,
}) => {
  await page.goto(DEFAULT);
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route(/command-palette-live\.[^/]*\.js$/, async (route) => {
    await gate;
    await route.continue();
  });
  // Bubble phase, after the palette's own listener on document: sees whether the chord was claimed.
  await page.evaluate(() => {
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'k') (window as unknown as { claimed: boolean }).claimed = e.defaultPrevented;
    });
  });
  await page.keyboard.press('ControlOrMeta+K');
  expect(await page.evaluate(() => (window as unknown as { claimed: boolean }).claimed)).toBe(true);
  await expect(dialog(page)).toBeHidden();
  release();
  await expect(dialog(page)).toBeVisible();
  await expect(input(page)).toBeFocused();
});

test('the story logs the dialog events', async ({ page }) => {
  await openByKeyboard(page);
  await expect(page.locator('[role="log"]')).toContainText('ocx:dialog:change');
});
