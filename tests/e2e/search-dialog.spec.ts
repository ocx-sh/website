// C-210 / S-103 search dialog (search.zag): Starlight's search on Zag `dialog`, manual trigger.
// Nothing loads before input; the trigger or Ctrl/⌘K starts the machine and opens the dialog,
// one toggle per press; Pagefind UI loads on the first open and keeps the plugin's mergeIndex
// list (a merged-section result appears); Esc and outside click close and return focus; the
// trigger's first paint is final (C-130c); axe clean open (C-130e); focus trap (C-130d, APG
// dialog); no leak over open/close (C-130h).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { settle } from './helpers/settle.ts';
import { expect, test, type Page } from '@playwright/test';
import * as pagefind from 'pagefind';
import nav from '../../packages/theme/src/nav.json' with { type: 'json' };
import { mergeTargets } from '../../packages/theme/src/registry.mjs';
import { expectNoLeak } from './helpers/leak.ts';
import { computed, resolve, resolveBlockSize } from './tokens.ts';

const PATH = '/docs/';
const root = (page: Page) => page.locator('site-search');
const trigger = (page: Page) => page.locator('site-search [data-open-modal]');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Search' });
const input = (page: Page) => page.locator('#starlight__search .pagefind-ui__search-input');
const lazy = (url: string) => /search\.zag|pagefind/.test(url);
const MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';

/** A Pagefind bundle (the example's Pagefind version) holding one record only it can match. */
const PROBE = { term: 'zebrafishmerged', title: 'Merged section probe', url: '/integrations/bazel/merged-probe/' };
let merged = '';

test.beforeAll(async () => {
  merged = mkdtempSync(join(tmpdir(), 'ocx-merged-'));
  const { index } = await pagefind.createIndex({});
  if (!index) throw new Error('pagefind: no index');
  await index.addCustomRecord({
    url: PROBE.url,
    content: `${PROBE.term} lives in another section`,
    language: 'en',
    meta: { title: PROBE.title },
  });
  await index.writeFiles({ outputPath: merged });
  await pagefind.close();
});
test.afterAll(() => rmSync(merged, { recursive: true, force: true }));

/** Serve every merged section's bundle (absent locally) from the probe bundle. */
async function serveMerged(page: Page) {
  await page.route(
    (u) => u.pathname.includes('/pagefind/') && !u.pathname.startsWith(PATH),
    (r) => r.fulfill({ body: readFileSync(join(merged, new URL(r.request().url()).pathname.split('/pagefind/')[1]!)) }),
  );
}

async function openByClick(page: Page) {
  await trigger(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(root(page)).toHaveAttribute('data-zag-state', 'live');
}

test.describe('C-210 search dialog', () => {
  test.beforeEach(async ({ page }) => {
    await serveMerged(page);
  });

  test('C-210: nothing of the search loads before input; the trigger opens it and Pagefind loads on open', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(PATH);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    expect(requests.filter(lazy), 'search requests before input').toEqual([]);
    await expect(root(page)).toHaveAttribute('data-zag-state', 'idle');
    await expect(trigger(page)).toHaveAttribute('data-part', 'trigger');

    await openByClick(page);
    await expect(input(page)).toBeFocused();
    expect(
      requests.some((u) => /search\.zag/.test(u)),
      'dialog chunk after open',
    ).toBe(true);
    // Pagefind UI imports its bundle from the input's focus handler, a task after the focus itself.
    await expect
      .poll(() => requests.some((u) => /\/docs\/pagefind\//.test(u)), { message: 'own Pagefind bundle after open' })
      .toBe(true);
    await expect(page.locator('body')).toHaveAttribute('data-search-modal-open', '');
    await expect(page.locator('#starlight__search')).toHaveCount(1);
  });

  test('C-210: Ctrl/⌘K has one listener: each press toggles the dialog exactly once', async ({ page }) => {
    await page.goto(PATH);
    await page.waitForLoadState('networkidle');
    await page.keyboard.press(`${MODIFIER}+k`);
    await expect(dialog(page)).toBeVisible();
    await expect(input(page)).toBeFocused();
    await page.keyboard.press(`${MODIFIER}+k`);
    await expect(dialog(page)).toBeHidden();
    await expect(page.locator('body')).not.toHaveAttribute('data-search-modal-open');
    await page.keyboard.press(`${MODIFIER}+k`);
    await expect(dialog(page)).toBeVisible();
    // Two quick presses before anything settles still end where they started.
    await page.keyboard.press(`${MODIFIER}+k`);
    await page.keyboard.press(`${MODIFIER}+k`);
    await expect(dialog(page)).toBeVisible();
  });

  test('C-210: presses that land while the dialog chunk loads still toggle once each', async ({ page }) => {
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route(/search\.zag/, async (r) => {
      await held;
      await r.continue();
    });
    await page.goto(PATH);
    await page.waitForLoadState('networkidle');
    await page.keyboard.press(`${MODIFIER}+k`);
    await page.keyboard.press(`${MODIFIER}+k`);
    await expect(root(page)).toHaveAttribute('data-zag-state', 'loading');
    release();
    await expect(root(page)).toHaveAttribute('data-zag-state', 'live');
    await page.waitForTimeout(300);
    await expect(dialog(page)).toBeHidden();
    await page.keyboard.press(`${MODIFIER}+k`);
    await expect(dialog(page)).toBeVisible();
  });

  test('C-210: trigger clicks while the dialog chunk loads open it once', async ({ page }) => {
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route(/search\.zag/, async (r) => {
      await held;
      await r.continue();
    });
    await page.goto(PATH);
    await page.waitForLoadState('networkidle');
    await trigger(page).click();
    await expect(root(page)).toHaveAttribute('data-zag-state', 'loading');
    await trigger(page).click();
    release();
    await expect(root(page)).toHaveAttribute('data-zag-state', 'live');
    await page.waitForTimeout(300);
    await expect(dialog(page)).toBeVisible();
  });

  test('C-210: following a result closes the dialog, as Starlight does', async ({ page }) => {
    await page.goto(PATH);
    await openByClick(page);
    await input(page).fill('tabs');
    const link = page.locator('#starlight__search .pagefind-ui__result-link').first();
    await expect(link).toBeVisible();
    // Stay on the page: only the close is under test, not the navigation.
    await link.evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()));
    await link.click();
    await expect(dialog(page)).toBeHidden();
    await expect(page.locator('body')).not.toHaveAttribute('data-search-modal-open');
  });

  test('C-210: Esc after Ctrl/⌘K returns focus to where it was', async ({ page }) => {
    await page.goto(PATH);
    const link = page.locator('main a[href]').first();
    await link.focus();
    await page.keyboard.press(`${MODIFIER}+k`);
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(link).toBeFocused();
  });

  test('C-210: Esc closes and returns focus to the trigger', async ({ page }) => {
    await page.goto(PATH);
    await openByClick(page);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused();
    await expect(page.locator('body')).not.toHaveAttribute('data-search-modal-open');
  });

  test('C-210: the open dialog is the top layer: no page chrome paints over it', async ({ page }) => {
    await page.goto(PATH);
    await openByClick(page);
    const covered = await dialog(page).evaluate((d) => {
      const r = d.getBoundingClientRect();
      const points = [
        [r.left + 4, r.top + 4],
        [r.right - 4, r.top + 4],
        [r.right - 24, r.top + 24], // where the fixed mobile menu toggle sits
        [r.left + 4, r.bottom - 4],
        [r.right - 4, r.bottom - 4],
      ];
      return points.filter(([x, y]) => !d.contains(document.elementFromPoint(x!, y!)));
    });
    expect(covered, 'points of the dialog painted over by something else').toEqual([]);
  });

  test('C-210: an outside click closes and returns focus to the trigger', async ({ page }) => {
    await page.goto(PATH);
    await openByClick(page);
    const box = await dialog(page).boundingBox();
    const viewport = page.viewportSize()!;
    // Below the dialog on desktop; on the full-screen mobile sheet there is no outside: Cancel closes.
    if (box && box.y + box.height < viewport.height - 10) await page.mouse.click(5, viewport.height - 5);
    else await page.locator('site-search [data-close-modal]').click();
    await expect(dialog(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused();
  });

  test('C-274: the input wears the SearchField look: field tokens, focus border, icon, ghost clear', async ({
    page,
  }) => {
    await page.goto(PATH);
    await openByClick(page);
    await settle(page); // the enter animation scales the sheet: boundingBox reads a fractional height until it ends
    const field = input(page);
    await expect(field).toBeFocused();
    // Focus is a border colour and no ring.
    expect(await computed(field, 'border-top-color')).toBe(await resolve(page, 'color', 'var(--ocx-color-focus)'));
    expect(await computed(field, 'outline-style')).toBe('none');
    await field.evaluate((el) => (el as HTMLElement).blur());
    expect(await computed(field, 'border-top-color')).toBe(await resolve(page, 'color', 'var(--ocx-color-border)'));
    // The c-input box.
    expect(await computed(field, 'background-color')).toBe(await resolve(page, 'color', 'var(--ocx-color-surface)'));
    expect(await computed(field, 'border-top-left-radius')).toBe(
      await resolve(page, 'border-radius', 'var(--ocx-radius-md)', 'border-top-left-radius'),
    );
    expect((await field.boundingBox())!.height).toBe(await resolveBlockSize(page, 'var(--ocx-control-2xl)'));
    expect(await computed(field, 'font-family')).toBe(await resolve(page, 'font-family', 'var(--ocx-font-mono)'));
    expect(await computed(field, 'font-size')).toBe(await resolve(page, 'font-size', 'var(--ocx-text-sm)'));
    // The start icon: fg-subtle, painted as an inline mask (a data URI, never a late request).
    const icon = await page.locator('#starlight__search .pagefind-ui__form').evaluate((el) => {
      const s = getComputedStyle(el, '::before');
      return { color: s.backgroundColor, mask: s.maskImage || s.webkitMaskImage };
    });
    expect(icon.color).toBe(await resolve(page, 'color', 'var(--ocx-color-fg-subtle)'));
    expect(icon.mask).toContain('data:image/svg+xml');

    // The clear: a ghost icon button, appearing with text, neutral on hover.
    await field.fill('tabs');
    await expect(page.locator('#starlight__search .pagefind-ui__result').first()).toBeVisible();
    const clear = page.locator('#starlight__search .pagefind-ui__search-clear');
    await expect(clear).toBeVisible();
    await expect(clear).toHaveAccessibleName(/\S/);
    expect(await computed(clear, 'background-color')).toBe('rgba(0, 0, 0, 0)');
    expect(await computed(clear, 'color')).toBe(await resolve(page, 'color', 'var(--ocx-color-fg-subtle)'));
    const size = await resolveBlockSize(page, 'var(--ocx-control-lg)');
    expect(await clear.boundingBox()).toMatchObject({ width: size, height: size });
    await clear.hover();
    const fg = await resolve(page, 'color', 'var(--ocx-color-fg)');
    await expect.poll(() => computed(clear, 'color')).toBe(fg); // the hover ink fades in
    await clear.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    expect(await computed(clear, 'outline-style')).toBe('solid');
    await clear.click();
    await expect(field).toHaveValue('');
  });

  test('C-210: the mergeIndex list the plugin builds passes through: a merged-section result appears', async ({
    page,
  }) => {
    await page.goto(PATH);
    await openByClick(page);
    await input(page).fill(PROBE.term);
    const link = page.locator('#starlight__search .pagefind-ui__result-link', { hasText: PROBE.title }).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', PROBE.url);
    // Every merge target is a section filter, labelled as the plugin labels it.
    for (const { label } of mergeTargets(nav, PATH))
      await expect(page.locator(`#starlight__search input[name="section"][value="${label}"]`)).toHaveCount(1);
  });

  test('C-130d: focus stays inside the open dialog (APG dialog)', async ({ page }) => {
    await page.goto(PATH);
    await openByClick(page);
    await input(page).fill('tabs');
    await expect(page.locator('#starlight__search .pagefind-ui__result').first()).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
      expect(await dialog(page).evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
  });

  test('C-130e: axe reports no violations with the dialog open and results shown', async ({ page }) => {
    await page.goto(PATH);
    await openByClick(page);
    await input(page).fill('tabs');
    await expect(page.locator('#starlight__search .pagefind-ui__result').first()).toBeVisible();
    await settle(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('S-103: open, search and close log no console error', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(PATH);
    await openByClick(page);
    await input(page).fill('tabs');
    await expect(page.locator('#starlight__search .pagefind-ui__result').first()).toBeVisible();
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
});

test.describe('C-210 search dialog (desktop gates)', () => {
  test.skip(({ isMobile }) => isMobile, 'pixel and CDP gates run once, on chromium');
  test.use({ reducedMotion: 'reduce' });

  test('C-130c: the trigger paints the same before the machine loads and once it is live', async ({ page }) => {
    await page.route(/search\.zag/, (r) => r.abort());
    await page.goto(PATH);
    await page.evaluate(() => document.fonts.ready);
    const before = await trigger(page).screenshot({ animations: 'disabled' });
    await page.unroute(/search\.zag/);
    await openByClick(page);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused(); // Zag returns focus after the close settles
    await trigger(page).evaluate((el) => (el as HTMLElement).blur());
    await page.mouse.move(1, page.viewportSize()!.height - 1);
    const after = await trigger(page).screenshot({ animations: 'disabled' });
    expect(after.equals(before), 'trigger pixels before load vs live').toBe(true);
  });

  test('C-130h: search.zag leaks nothing over open/close cycles', async ({ page }) => {
    await serveMerged(page);
    await page.goto(PATH);
    await openByClick(page);
    // Pagefind builds its UI and loads the merged indexes after the first open: let that settle.
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Escape');
    await expectNoLeak(page, async () => {
      await trigger(page).click();
      await expect(dialog(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toBeHidden();
    });
  });
});
