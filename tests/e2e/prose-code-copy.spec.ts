// ProseCodeCopy (D-064, D-112, D-131, D-143, D-166): a Copy code button on every plain-HTML code block
// in prose, one delegated click, "Copied — code block". Stories: prose-code-copy/default and /states.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settle } from './helpers/settle.ts';

const DEFAULT = '/docs/stories/prose-code-copy/default/';
const STATES = '/docs/stories/prose-code-copy/states/';
// The toaster and Zag chunks (not the every-page trigger layer): nothing of them before the first copy.
const ZAG_CHUNK = /\/_astro\/(?!zag\.[\w-]+\.js)[^/]*zag[^/]*\.js/;

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project; clipboard permissions are chromium desktop');
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const buttons = (page: Page) => page.locator('.ocx-prose pre > .ocx-prose-copy');
const toasts = (page: Page) => page.locator('[data-zag-root="toast"] [data-part="root"][data-state="open"]');
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

test('D-064 every code block in prose has a labelled Copy code button, faded in on hover', async ({ page }) => {
  await page.goto(DEFAULT);
  await expect(buttons(page)).toHaveCount(2);
  const first = buttons(page).first();
  await expect(first).toHaveAccessibleName('Copy code');
  await expect(first).toHaveCSS('opacity', '0');
  await page.locator('.ocx-prose pre').first().hover();
  await expect(first).toHaveCSS('opacity', '1');
});

test('D-064 D-131 a click copies the block, toasts "Copied — code block" and reads copied for 1.5 s', async ({
  page,
}) => {
  await page.goto(DEFAULT);
  await page.locator('.ocx-prose pre').nth(1).hover();
  await buttons(page).nth(1).click();
  await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Copied — code block');
  expect(await clipboard(page)).toBe('ocx add astral-sh/uv:0.10\nocx lock');
  await expect(buttons(page).nth(1)).toHaveAttribute('data-copied', '');
  await expect(buttons(page).nth(1)).not.toHaveAttribute('data-copied', /.*/, { timeout: 3000 });
});

test('D-143 D-166 a second copy replaces the toast showing: one message, not two', async ({ page }) => {
  await page.goto(DEFAULT);
  await page.locator('.ocx-prose pre').first().hover();
  await buttons(page).first().click();
  await expect(toasts(page)).toHaveCount(1);
  await page.waitForTimeout(1000);
  await buttons(page).first().click();
  await expect(toasts(page)).toHaveCount(1);
  await expect(buttons(page).first()).toHaveAttribute('data-copied', '');
  await page.waitForTimeout(1000); // 2 s after the first copy: its own window is over, the second's is not
  await expect(buttons(page).first()).toHaveAttribute('data-copied', '');
});

test('D-064 the toaster is not touched before the first copy', async ({ page }) => {
  const zag: string[] = [];
  page.on('request', (r) => ZAG_CHUNK.test(r.url()) && zag.push(r.url()));
  await page.goto(DEFAULT);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  expect(zag, 'Zag chunks fetched before any copy').toEqual([]);
  await buttons(page).first().click();
  await expect(toasts(page)).toHaveCount(1);
});

test('D-064 the clipboard and toast scripts load on the first hover or click, not at page load', async ({ page }) => {
  const copyChunk: string[] = []; // copy.mjs, the clipboard half
  page.on('request', (r) => /\/_astro\/copy\.[\w-]+\.js/.test(r.url()) && copyChunk.push(r.url()));
  await page.goto(DEFAULT);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  expect(copyChunk, 'copy.mjs fetched at page load').toEqual([]);
  await page.locator('.ocx-prose pre').first().hover();
  await expect.poll(() => copyChunk.length).toBeGreaterThan(0);
});

test('D-064 keyboard: Tab reaches the button, it shows, Enter copies', async ({ page }) => {
  await page.goto(DEFAULT);
  await page.keyboard.press('Tab');
  await expect(buttons(page).first()).toBeFocused();
  await expect(buttons(page).first()).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Copied — code block');
  expect(await clipboard(page)).toBe('ocx install ocx.sh/astral-sh/uv:0.10');
});

test('D-112 docs content roots get it; a block outside prose does not', async ({ page }) => {
  await page.goto(STATES);
  await expect(page.locator('.sl-markdown-content pre > .ocx-prose-copy')).toHaveCount(1);
  await expect(page.locator('.ocx-prose pre > .ocx-prose-copy')).toHaveCount(1);
  await expect(
    page.locator('.showcase-states pre:not(.ocx-prose pre, .sl-markdown-content pre) .ocx-prose-copy'),
  ).toHaveCount(0);
  // A pre without a code child copies its own text.
  await page.locator('.ocx-prose pre').hover();
  await page.locator('.ocx-prose pre > .ocx-prose-copy').click();
  await expect.poll(() => clipboard(page)).toBe('plain text block'); // the first click awaits the lazy import
});

test('D-084 no clipboard API: "Copy failed" toast and the button stays as it was', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
  await page.goto(DEFAULT);
  await buttons(page).first().click();
  await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Copy failed');
  await expect(buttons(page).first()).not.toHaveAttribute('data-copied', /.*/);
  expect(errors).toEqual([]);
});

test('axe is clean on the prose story, idle and copied', async ({ page }) => {
  await page.goto(DEFAULT);
  const axe = async () => {
    await settle(page);
    const { violations } = await new AxeBuilder({ page })
      .include('#story')
      .include('[data-zag-root="toast"]')
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  };
  await axe();
  await buttons(page).first().click();
  await expect(toasts(page)).toHaveCount(1);
  await axe();
});
