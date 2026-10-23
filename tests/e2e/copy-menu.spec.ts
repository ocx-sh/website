// CopyMenu (D-056, D-083, D-131, D-143, D-084): a menu of copy items from a button or as a context
// menu over many hosts, one Tab stop per host, data on the host, one replacing toast per copy.
// Stories: copy-menu/default (a tag list, logged) and copy-menu/states (button, cards).
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoLeak } from './helpers/leak.ts';
import { lifetime } from './helpers/toast.ts';
import { settle } from './helpers/settle.ts';

const DEFAULT = '/docs/stories/copy-menu/default/';
const STATES = '/docs/stories/copy-menu/states/';

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project; the long-press path needs a touch device');
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const root = (page: Page) => page.locator('[data-zag-root="copy-menu"]').first();
const content = (page: Page) => root(page).locator('[data-part="content"]');
const items = (page: Page) => root(page).locator('[data-part="item"]:not([hidden])');
const tag = (page: Page, name: string) => page.locator(`[data-copy]`, { hasText: name });
const toasts = (page: Page) => page.locator('[data-zag-root="toast"] [data-part="root"][data-state="open"]');
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

test.describe('D-083 the menu belongs to the host it opened on', () => {
  test('D-083 D-131 a right-click on a tag opens the menu, a choice copies THAT tag and toasts its meaning', async ({
    page,
  }) => {
    await page.goto(DEFAULT);
    await tag(page, '22.12').click({ button: 'right' });
    await expect(content(page)).toBeVisible();
    await expect(items(page)).toHaveCount(4);
    await items(page).filter({ hasText: 'Copy identifier' }).click();
    await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Copied — identifier');
    expect(await clipboard(page)).toBe('ocx.sh/nodejs/node:22.12');
    await expect(content(page)).toBeHidden();
  });

  test('D-083 a second host takes the open menu over, and its choice copies its own text', async ({ page }) => {
    await page.goto(DEFAULT);
    await tag(page, '24.1').click({ button: 'right' });
    await expect(content(page)).toBeVisible();
    await tag(page, '22.11').click({ button: 'right' });
    await expect(content(page)).toBeVisible();
    await items(page).filter({ hasText: 'install' }).click();
    await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Copied — install command');
    expect(await clipboard(page)).toBe('ocx install ocx.sh/nodejs/node:22.11');
  });

  test('D-083 a host without a tag text shows no Copy tag; empty space opens nothing and keeps the browser menu', async ({
    page,
  }) => {
    await page.goto(STATES);
    const menu = page.locator('[data-zag-root="copy-menu"][data-context]');
    await page.locator('[data-copy]', { hasText: 'deno' }).click({ button: 'right' });
    await expect(menu.locator('[data-part="content"]')).toBeVisible();
    await expect(menu.locator('[data-part="item"]:not([hidden])')).toHaveText(['Copy identifier', 'Copy link']);
    await page.keyboard.press('Escape');
    await expect(menu.locator('[data-part="content"]')).toBeHidden();

    // Empty space: the contextmenu event is not ours to cancel (the browser's own menu shows).
    const prevented = await menu.getByText('Empty space').evaluate(
      (el) =>
        new Promise<boolean>((resolve) => {
          el.addEventListener('contextmenu', (e) => setTimeout(() => resolve(e.defaultPrevented)), { once: true });
          el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
        }),
    );
    expect(prevented).toBe(false);
    await expect(menu.locator('[data-part="content"]')).toBeHidden();
  });

  test('D-083 a menu asked for before the island has loaded opens when it does, on the same tag', async ({ page }) => {
    await page.goto(DEFAULT);
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    await page.route(/\/copy-menu\.zag\.[^/]*\.js$/, async (route) => {
      await gate;
      await route.continue();
    });
    await tag(page, '24.0').click({ button: 'right' });
    await expect(root(page)).toHaveAttribute('data-zag-state', 'loading');
    await expect(content(page)).toBeHidden();
    release();
    await expect(content(page)).toBeVisible();
    await items(page).filter({ hasText: 'Copy tag' }).click();
    expect(await clipboard(page)).toBe('24.0');
  });
});

test.describe('D-083 the copy code loads on the first interaction with a host', () => {
  // The machine (copy-menu.zag, menu.zag) and the copy and toast-confirmation code (copy.<hash>.js).
  const LAZY = /\/_astro\/(?:copy|copy-menu\.zag|menu\.zag)\.[\w-]+\.js$/;
  const track = (page: Page) => {
    const seen: string[] = [];
    page.on(
      'request',
      (r) =>
        LAZY.test(r.url()) &&
        seen.push(
          r
            .url()
            .split('/')
            .pop()!
            .replace(/\.[\w-]+\.js$/, ''),
        ),
    );
    return seen;
  };

  test('D-083 nothing loads at page load, on a hover over the list or on empty space', async ({ page }) => {
    const seen = track(page);
    await page.goto(DEFAULT);
    await page.waitForLoadState('networkidle');
    await tag(page, '22.12').hover();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(500);
    expect(seen, 'copy code requested before any input on a host').toEqual([]);
    await expect(root(page)).toHaveAttribute('data-zag-state', 'idle');
  });

  test('D-083 focus on a host loads the machine and the copy code once, and the menu then opens at once', async ({
    page,
  }) => {
    const seen = track(page);
    await page.goto(DEFAULT);
    await page.waitForLoadState('networkidle');
    await tag(page, '22.12').focus();
    await expect(root(page)).toHaveAttribute('data-zag-state', 'live');
    expect(seen).toEqual(expect.arrayContaining(['copy-menu.zag', 'copy']));
    await page.keyboard.press('Shift+F10');
    await expect(content(page)).toBeVisible();
  });
});

test.describe('D-056 keyboard', () => {
  test('D-056 one Tab stop per tag; the menu key opens under the focused tag and Escape returns focus to it', async ({
    page,
  }) => {
    await page.goto(DEFAULT);
    const stops = await page.locator('[data-zag-root="copy-menu"] [tabindex="0"]:not([hidden], [hidden] *)').count();
    expect(stops, 'the tags only: the menu adds no Tab stop').toBe(4);
    await tag(page, '22.12').focus();
    await page.keyboard.press('Shift+F10');
    await expect(content(page)).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(items(page).first()).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Escape');
    await expect(content(page)).toBeHidden();
    await expect(tag(page, '22.12')).toBeFocused();
  });

  test('D-056 Enter on an item copies it, closes the menu and focus is back on the tag', async ({ page }) => {
    await page.goto(DEFAULT);
    await tag(page, '24.1').focus();
    await page.keyboard.press('Shift+F10');
    await expect(content(page)).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Copied — identifier');
    expect(await clipboard(page)).toBe('ocx.sh/nodejs/node:24.1');
    await expect(tag(page, '24.1')).toBeFocused();
  });
});

test('button mode: a trigger opens the menu, the item copies its own text', async ({ page }) => {
  await page.goto(STATES);
  const menu = page.locator('[data-zag-root="copy-menu"]:not([data-context])');
  await menu.locator('[data-part="trigger"]').click();
  await menu.locator('[data-part="item"]', { hasText: 'ocx install' }).click();
  await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Copied — install command');
  expect(await clipboard(page)).toBe('ocx install ocx.sh/nodejs/node:24');
  await expect(menu.locator('[data-part="trigger"]')).toBeFocused();
});

test.describe('D-143 D-084 the toast', () => {
  test('D-143 a copy toast lasts about 2 s, not the default 2.5 s', async ({ page }) => {
    await page.goto(DEFAULT);
    await tag(page, '24.1').click({ button: 'right' });
    await items(page).first().click();
    await expect(toasts(page)).toHaveCount(1);
    const ms = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const start = performance.now();
          const frame = () =>
            document.querySelector('[data-zag-root="toast"] [data-part="root"][data-state="open"]')
              ? requestAnimationFrame(frame)
              : resolve(performance.now() - start);
          frame();
        }),
    );
    expect(ms, 'copy toast remaining lifetime').toBeLessThan(2200);
    // A generic toast keeps the 2.5 s default.
    expect(await lifetime(page, { title: 'one' })).toBeGreaterThan(2300);
  });

  test('D-143 D-166 a second copy replaces the toast showing and starts a full window', async ({ page }) => {
    await page.goto(DEFAULT);
    const copy = async (name: string) => {
      await tag(page, name).click({ button: 'right' });
      await items(page).filter({ hasText: 'Copy tag' }).click();
    };
    await copy('24.1');
    await expect(toasts(page)).toHaveCount(1);
    await page.waitForTimeout(1200);
    await copy('24.0');
    await expect(toasts(page)).toHaveCount(1); // the first one left, one message not two
    await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Copied — tag');
    await page.waitForTimeout(1500); // 2.7 s after the first copy
    await expect(toasts(page)).toHaveCount(1);
    await expect(toasts(page)).toHaveCount(0, { timeout: 2000 });
  });

  test('D-084 no clipboard API: "Copy failed" toast, nothing thrown', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
    await page.goto(DEFAULT);
    await tag(page, '24.1').click({ button: 'right' });
    await items(page).first().click();
    await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Copy failed');
    await expect(toasts(page)).toHaveAttribute('data-type', 'error');
    expect(errors).toEqual([]);
  });
});

test('axe is clean on the tag list, idle and with the menu open', async ({ page }) => {
  await page.goto(DEFAULT);
  const axe = async () => {
    await settle(page);
    const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  };
  await axe();
  await tag(page, '24.1').click({ button: 'right' });
  await expect(content(page)).toBeVisible();
  await axe();
});

test('C-115 no leak over open → copy → toast → dismiss cycles (copy-menu.zag.mjs, toast.zag.mjs)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(DEFAULT);
  const cycle = async () => {
    await tag(page, '24.1').click({ button: 'right' });
    await expect(content(page)).toBeVisible();
    await items(page).first().click();
    await expect(content(page)).toBeHidden();
    await expect(toasts(page)).toHaveCount(1); // the copy slot: one toast, never a stack
    await page
      .locator('[data-zag-root="toast"] [data-part="close-trigger"]')
      .evaluateAll((buttons) => buttons.forEach((b) => (b as HTMLButtonElement).click()));
    await expect(toasts(page)).toHaveCount(0);
  };
  // The first cycles load and compile the menu, popper and toaster chunks; heap is flat after ~20.
  for (let i = 0; i < 20; i++) await cycle();
  await expectNoLeak(page, cycle);
});
