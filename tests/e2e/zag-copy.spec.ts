// Z7 clipboard + toast: C-180 CopyButton, C-181 toaster (Footer override), C-182 every copy
// control toasts, S-104, and C-130 (c) first paint, (d) keyboard, (e) axe, (h) leaks.
import { readFileSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { examplePages, STORIES_DIR } from '../budgets.mjs';
import { expectNoLeak } from './helpers/leak.ts';
import { lifetime } from './helpers/toast.ts';

const PAGE = '/docs/stories/copy-button/default/';
const STATES = '/docs/stories/copy-button/states/';
const CODE = '/docs/components/code/';
// Copy controls live on component pages and, for stories that mount a toaster (`toaster: true`), on story pages.
const toasterStory = (route: string) =>
  /^toaster:\s*true\s*$/m.test(
    readFileSync(`${STORIES_DIR}${route.replace('/docs/stories/', '').replace(/\/$/, '')}.mdx`, 'utf8'),
  );
const SHOWCASE = examplePages().filter(
  (p) => p.startsWith('/docs/components/') || (p.startsWith('/docs/stories/') && toasterStory(p)),
);
// Zag runtime, machine and component chunks. Not the trigger layer (ui/zag.mjs → `zag.<hash>.js`):
// the search mounts through it on every page, and it loads nothing until a start (C-113).
const ZAG_CHUNK = /\/_astro\/(?!zag\.[\w-]+\.js)[^/]*zag[^/]*\.js/;

// Clipboard permissions and CDP are chromium desktop; the touch path adds nothing here.
test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const region = (page: Page) => page.locator('[data-zag-root="toast"]');
const toasts = (page: Page) => region(page).locator('[data-part="root"][data-state="open"]');
const copyButton = (page: Page, n = 0) => page.locator('[data-zag-root="clipboard"]').nth(n);
const trigger = (root: Locator) => root.locator('[data-part="trigger"]');

/** Counts `ocx:toast` events on the document from now on. */
async function countToasts(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { ocxToasts: string[] };
    w.ocxToasts = [];
    document.addEventListener('ocx:toast', (e) => w.ocxToasts.push((e as CustomEvent<{ title: string }>).detail.title));
  });
  return () => page.evaluate(() => (window as unknown as { ocxToasts: string[] }).ocxToasts);
}

/** Dismisses every toast (a leaving one may already sit off screen) and waits until none is left. */
async function clearToasts(page: Page) {
  await region(page)
    .locator('[data-part="close-trigger"]')
    .evaluateAll((buttons) => buttons.forEach((b) => (b as HTMLButtonElement).click()));
  await expect(region(page).locator('[data-part="root"]')).toHaveCount(0);
}

test('C-181 zero bytes of toast JS before the first ocx:toast; the first one loads the toaster', async ({ page }) => {
  const zag: string[] = [];
  page.on('request', (r) => ZAG_CHUNK.test(r.url()) && zag.push(r.url()));
  await page.goto(CODE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  expect(zag, 'Zag chunks fetched before any toast').toEqual([]);
  await expect(region(page)).toHaveAttribute('data-zag-state', 'idle');

  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('ocx:toast', { detail: { title: 'Hello' }, bubbles: true })),
  );
  await expect(toasts(page)).toHaveCount(1);
  await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Hello');
  await expect(region(page)).toHaveAttribute('data-zag-state', 'live');
  await expect(region(page)).toHaveAttribute('aria-live', 'polite');
  expect(zag.length).toBeGreaterThan(0);

  // Bottom-right of the viewport.
  const vp = page.viewportSize()!;
  const b = (await toasts(page).first().boundingBox())!;
  expect(vp.width - (b.x + b.width)).toBeLessThan(48);
  expect(vp.height - (b.y + b.height)).toBeLessThan(48);
});

test('C-181 S-104 a toast leaves after 2.5 s, stays while hovered, and at most 3 show', async ({ page }) => {
  await page.goto(CODE);
  const send = (title: string) =>
    page.evaluate((t) => document.dispatchEvent(new CustomEvent('ocx:toast', { detail: { title: t } })), title);
  // Timed in the page: a toast falling back to Zag's 2 s success default must fail, not pass a
  // loose "gone within 4 s".
  const ms = await lifetime(page, { title: 'one' });
  expect(ms, 'toast lifetime').toBeGreaterThan(2300);
  expect(ms, 'toast lifetime').toBeLessThan(2900);

  for (const t of ['a', 'b', 'c', 'd']) await send(t);
  await expect(toasts(page)).toHaveCount(3);
  await page.waitForTimeout(200);
  await expect(toasts(page)).toHaveCount(3);

  await toasts(page).first().hover();
  await page.waitForTimeout(3200);
  await expect(toasts(page).first()).toBeVisible();
  await page.mouse.move(5, 5);
  // The queued fourth shows once one leaves, then all drain.
  await expect(toasts(page).locator('[data-part="title"]', { hasText: /^d$/ })).toBeVisible({ timeout: 6000 });
  await expect(region(page).locator('[data-part="root"]')).toHaveCount(0, { timeout: 12_000 });
});

test('C-181 a focused toast stays past its 2.5 s', async ({ page }) => {
  await page.goto(CODE);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('ocx:toast', { detail: { title: 'stay' } })));
  await expect(toasts(page)).toHaveCount(1);
  await page.keyboard.press('Alt+t');
  await page.keyboard.press('Tab');
  await expect(toasts(page).first()).toBeFocused();
  await page.waitForTimeout(3200);
  await expect(toasts(page)).toHaveCount(1);
});

test('C-180 CopyButton copies, shows copied for 1.5 s and toasts "Copied <label>"', async ({ page }) => {
  await page.goto(PAGE);
  const root = copyButton(page);
  await trigger(root).click();
  await expect(root).toHaveAttribute('data-zag-state', 'live');
  await expect(root).toHaveAttribute('data-copied', '');
  await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Copied install command');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('ocx install ocx.sh/nodejs/node:24');
  await expect(root).not.toHaveAttribute('data-copied', /.*/, { timeout: 3000 });
});

test('C-180 S-104 a refused write toasts "Copy failed" (danger) with no uncaught error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    });
  });
  await page.goto(PAGE);
  await trigger(copyButton(page)).click();
  await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Copy failed');
  await expect(toasts(page)).toHaveAttribute('data-type', 'error');
  await expect(copyButton(page)).not.toHaveAttribute('data-copied', /.*/);
  expect(errors).toEqual([]);
});

test('C-182 an Expressive Code copy button toasts its first line, cut to 40', async ({ page }) => {
  await page.goto(CODE);
  const buttons = page.locator('.expressive-code .copy button');
  await buttons.nth(0).click();
  await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Copied ocx install ocx.sh/nodejs/node:24');
  await clearToasts(page);
  await buttons.nth(1).click(); // ocx.toml: the first line is a 50-character schema comment
  await expect(toasts(page).locator('[data-part="title"]')).toHaveText(
    'Copied #:schema https://ocx.sh/schemas/project…',
  );
});

test("C-182 a second code-block copy while EC's feedback still shows toasts success, not failure", async ({ page }) => {
  await page.goto(CODE);
  const count = await countToasts(page);
  const button = page.locator('.expressive-code .copy button').first();
  await button.click();
  await expect.poll(async () => (await count()).length).toBe(1);
  await page.waitForTimeout(1200); // EC's feedback is fading now, and adds none for the next click
  await button.click();
  await expect.poll(async () => (await count()).length, { timeout: 3000 }).toBe(2);
  expect(await count()).toEqual([
    'Copied ocx install ocx.sh/nodejs/node:24',
    'Copied ocx install ocx.sh/nodejs/node:24',
  ]);
});

test('C-182 S-104 a code-block copy the browser refuses toasts "Copy failed"', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    });
    document.execCommand = () => false;
  });
  await page.goto(CODE);
  await page.locator('.expressive-code .copy button').first().click();
  await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Copy failed');
  await expect(toasts(page)).toHaveAttribute('data-type', 'error');
});

test('C-182 every copy control on the showcase pages shows exactly one toast', async ({ page }) => {
  test.setTimeout(180_000);
  let controls = 0;
  for (const path of SHOWCASE) {
    await page.goto(path);
    const count = await countToasts(page);
    const all = await page
      .locator('.expressive-code .copy button, [data-zag-root="clipboard"] [data-part="trigger"]')
      .all();
    for (const control of all) {
      if (!(await control.isVisible())) continue; // an inactive tab panel
      const before = (await count()).length;
      await control.click();
      await expect
        .poll(async () => (await count()).length, { message: `${path}: one toast per copy` })
        .toBe(before + 1);
      await expect(toasts(page).first()).toBeVisible();
      await page.waitForTimeout(100);
      expect((await count()).length, `${path}: a second toast for one copy`).toBe(before + 1);
      expect((await count()).at(-1)).toMatch(/^Copied /);
      await clearToasts(page);
      controls++;
    }
  }
  expect(controls, 'copy controls found across the showcase').toBeGreaterThan(5);
});

test('C-130c first paint is final: the CopyButton looks the same before and after its machine starts', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await context.route(ZAG_CHUNK, (r) => r.abort());
  await page.goto(PAGE);
  const root = copyButton(page);
  const before = await root.screenshot({ animations: 'disabled' });
  await context.unroute(ZAG_CHUNK);
  await page.reload();
  await root.hover();
  await expect(root).toHaveAttribute('data-zag-state', 'live');
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await root.screenshot({ animations: 'disabled' })).toEqual(before);
});

test('C-130d keyboard: Enter copies, Alt+T focuses the toasts, Escape dismisses', async ({ page }) => {
  await page.goto(PAGE);
  await trigger(copyButton(page)).focus();
  await page.keyboard.press('Enter');
  await expect(toasts(page)).toHaveCount(1);
  await page.keyboard.press('Alt+t');
  await expect(region(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(toasts(page).first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(region(page).locator('[data-part="root"]')).toHaveCount(0);
});

test('C-130e axe is clean on the copy story, idle and with a toast open', async ({ page }) => {
  await page.goto(PAGE);
  const axe = async () => {
    const { violations } = await new AxeBuilder({ page })
      .include('#story')
      .include('[data-zag-root="toast"]')
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  };
  await axe();
  await trigger(copyButton(page)).click();
  await expect(toasts(page)).toHaveCount(1);
  await axe();
});

test('C-130h C-115 no leak over copy → toast → dismiss cycles (clipboard.zag.mjs, toast.zag.mjs)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(STATES);
  const root = copyButton(page); // a states-story button: no event log to fill
  const cycle = async () => {
    await trigger(root).click();
    await expect(toasts(page)).toHaveCount(1);
    await clearToasts(page);
    await expect(root).not.toHaveAttribute('data-copied', /.*/, { timeout: 3000 });
  };
  // The first cycles load and compile both chunks (~400 KiB of heap, measured flat after ~20).
  for (let i = 0; i < 20; i++) await cycle();
  await expectNoLeak(page, cycle);
});
