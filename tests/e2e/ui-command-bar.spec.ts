// CommandBar on its story pages (default: the install command; demo: the states): the copy is CopyButton's machine (toast, copied state),
// the picker moves what is copied, the detect script paints the visitor's platform before any module
// runs, the command scrolls inside the field at 390px, forced colours keep the copied state, axe is clean.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { computed } from './tokens.ts';
import { settle } from './helpers/settle.ts';

const PAGE = '/docs/stories/command-bar/default/';
// The `demo` story holds the states, in order: scope picker, one choice, action only, long command,
// icon-only picker and action, pickerText (bars 0-5).
const MORE = '/docs/stories/command-bar/demo/';
const LINUX = 'curl -fsSL https://setup.ocx.sh/sh | sh';
const WINDOWS = 'irm https://setup.ocx.sh/pwsh | iex';
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
// devices['Desktop Chrome'] is a Windows UA, which `detect` rightly preselects: pin Linux where the
// SSR first choice is expected (the detect describe below overrides it).
const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const demo = (page: Page) => page.locator('#story .ocx-cmdbar');
const field = (page: Page, n = 0) => page.locator('main .ocx-cmdbar__trigger').nth(n);
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

test.use({ userAgent: LINUX_UA });

test.describe('desktop', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'clipboard permissions are chromium desktop; the mobile lane checks layout below',
  );
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('a click copies the shown command, toasts its name, and shows the check', async ({ page }) => {
    await page.goto(PAGE);
    await expect(demo(page).locator('[data-part="value-text"]')).toHaveText('Linux');
    const trigger = field(page);
    await expect(trigger).toHaveAccessibleName('Copy Linux install command');
    await trigger.click();
    await expect(trigger).toHaveAttribute('data-copied', '');
    expect(await clipboard(page)).toBe(LINUX);
    await expect(page.locator('[data-zag-root="toast"] [data-part="root"]')).toContainText(
      'Copied Linux install command',
    );
    await expect(demo(page).locator('.ocx-cmdbar__status')).toHaveText('Copied Linux install command');
    // Copy and check crossfade: at rest the check is transparent, while copied the copy glyph is.
    await expect(demo(page).locator('.ocx-cmdbar__done')).toHaveCSS('opacity', '1');
    await expect(demo(page).locator('.ocx-cmdbar__idle')).toHaveCSS('opacity', '0');
    await expect(trigger).not.toHaveAttribute('data-copied', '', { timeout: 4000 });
    await expect(demo(page).locator('.ocx-cmdbar__done')).toHaveCSS('opacity', '0');
  });

  test('the first click, before the machine has loaded, still copies (replayed)', async ({ page }) => {
    await page.goto(MORE);
    await field(page, 0).click();
    await expect.poll(() => clipboard(page)).toBe('ocx install ocx.sh/nodejs/node:24');
  });

  test('picking a platform swaps the text, the picker glyph, the name and the copied value', async ({ page }) => {
    await page.goto(PAGE);
    const bar = demo(page);
    const picker = bar.getByRole('combobox', { name: 'Platform: Linux' });
    await expect(picker.locator('.ocx-ui-select__glyph svg')).toHaveAttribute('data-icon', 'linux');
    await picker.click();
    // Every row of the popup is icon + label.
    for (const [name, icon] of [
      ['Linux', 'linux'],
      ['macOS', 'apple'],
      ['Windows', 'windows'],
    ] as const)
      await expect(page.getByRole('option', { name }).locator('svg')).toHaveAttribute('data-icon', icon);
    await page.getByRole('option', { name: 'Windows' }).click();
    await expect(bar.locator('.ocx-cmdbar__text')).toHaveText(WINDOWS);
    const after = bar.getByRole('combobox', { name: 'Platform: Windows' });
    await expect(after.locator('.ocx-ui-select__glyph svg')).toHaveAttribute('data-icon', 'windows');
    await expect(bar.locator('.ocx-cmdbar__picker')).toHaveAttribute('title', 'Platform: Windows');
    await expect(bar.getByRole('button', { name: 'Copy Windows install command' })).toBeVisible();
    await bar.locator('.ocx-cmdbar__trigger').click();
    // The write is async (writeText's promise), and the first click also loads the machine: the
    // copied state marks it done. Reading at once returns the clipboard's previous content.
    await expect(bar.locator('.ocx-cmdbar__trigger')).toHaveAttribute('data-copied', '');
    expect(await clipboard(page)).toBe(WINDOWS);
    await expect(page.locator('[data-zag-root="toast"] [data-part="root"]')).toContainText(
      'Copied Windows install command',
    );
  });

  test('the picker is the icon alone: a square the bar height, no label text (the popup has it)', async ({ page }) => {
    await page.goto(PAGE);
    const trigger = demo(page).locator('.ocx-ui-select__control');
    const box = (await trigger.boundingBox())!;
    expect(Math.round(box.width)).toBe(Math.round(box.height));
    expect(Math.round(box.height)).toBe(
      Math.round((await demo(page).locator('.ocx-cmdbar__field').boundingBox())!.height),
    );
    const text = (await demo(page).locator('[data-part="value-text"]').boundingBox())!;
    expect(text.width).toBeLessThanOrEqual(1);
  });

  test('pickerText adds the label to the icon; a picker without icons shows its label', async ({ page }) => {
    await page.goto(MORE);
    const labelled = page.locator('main .ocx-cmdbar').nth(5).locator('[data-part="value-text"]');
    await expect(labelled).toBeVisible();
    expect((await labelled.boundingBox())!.width).toBeGreaterThan(20);
    await expect(page.locator('main .ocx-cmdbar').nth(5).locator('.ocx-ui-select__glyph svg')).toBeVisible();
    await expect(page.locator('main .ocx-cmdbar').nth(0).locator('[data-part="value-text"]')).toHaveText('Global');
  });

  test('an icon-only action is named by its label and shows it as a hint', async ({ page }) => {
    await page.goto(MORE);
    const bar = page.locator('main .ocx-cmdbar').nth(4);
    const action = bar.getByRole('link', { name: 'Open in VS Code' });
    await expect(action).toHaveText('');
    await action.hover();
    await expect(bar.locator('.ocx-ui-hint__content')).toBeVisible();
    await expect(bar.locator('.ocx-ui-hint__content')).toHaveText('Open in VS Code');
  });

  test('scope picker without icons: choose project, copy the project command', async ({ page }) => {
    await page.goto(MORE);
    const bar = page.locator('main .ocx-cmdbar').nth(0);
    await bar.getByRole('combobox', { name: 'Scope' }).click();
    await page.getByRole('option', { name: 'Project' }).click();
    await bar.locator('.ocx-cmdbar__trigger').click();
    await expect(bar.locator('.ocx-cmdbar__trigger')).toHaveAttribute('data-copied', '');
    expect(await clipboard(page)).toBe('ocx add ocx.sh/nodejs/node:24');
  });

  test('keyboard: Tab reaches the picker, then the field, then the action; Enter copies', async ({ page }) => {
    await page.goto(MORE);
    const bar = page.locator('main .ocx-cmdbar').nth(0);
    const picker = bar.getByRole('combobox', { name: 'Scope' });
    await picker.focus();
    await page.keyboard.press('Tab');
    await expect(bar.locator('.ocx-cmdbar__trigger')).toBeFocused();
    expect(await bar.locator('.ocx-cmdbar__trigger').evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    await page.keyboard.press('Enter');
    await expect.poll(() => clipboard(page)).toBe('ocx install ocx.sh/nodejs/node:24');
    await page.keyboard.press('Tab');
    await expect(bar.getByRole('link', { name: 'Open in VS Code' })).toBeFocused();
  });

  test('the field takes no second tab stop for its scroller', async ({ page }) => {
    await page.goto(MORE);
    const long = page.locator('main .ocx-cmdbar').nth(3).locator('.ocx-cmdbar__trigger');
    await long.focus();
    await page.keyboard.press('Tab');
    // The next stop is the next bar's picker (the long bar is no longer last), never the same bar.
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('.ocx-cmdbar') === document.querySelectorAll('main .ocx-cmdbar')[3],
      ),
    ).toBe(false);
  });

  test('forced colours: the copied state stays visible (system Highlight border, check shown)', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto(PAGE);
    await field(page).click();
    const box = demo(page).locator('.ocx-cmdbar__field');
    const highlight = await page.evaluate(() => {
      const probe = document.createElement('i');
      probe.style.borderTop = '2px solid Highlight';
      document.body.append(probe);
      const color = getComputedStyle(probe).borderTopColor;
      probe.remove();
      return color;
    });
    await expect(box).toHaveCSS('border-top-color', highlight);
    await expect(demo(page).locator('.ocx-cmdbar__done')).toHaveCSS('opacity', '1');
    expect(await computed(box, 'border-top-style')).toBe('solid');
  });
});

test.describe('detect (before first paint)', () => {
  test.use({ userAgent: WINDOWS_UA });

  test('a Windows visitor sees the Windows command with every module script blocked', async ({ page }) => {
    // Only the inline script can have done this: nothing from /_astro/ ever loads.
    await page.route('**/_astro/**', (route) => route.abort());
    await page.goto(PAGE);
    const bar = demo(page);
    await expect(bar.locator('.ocx-cmdbar__text')).toHaveText(WINDOWS);
    await expect(bar.locator('[data-part="value-text"]')).toHaveText('Windows');
    await expect(bar.locator('.ocx-ui-select__glyph svg')).toHaveAttribute('data-icon', 'windows');
    await expect(bar.getByRole('combobox')).toHaveAccessibleName('Platform: Windows');
    await expect(bar.locator('.ocx-cmdbar__trigger')).toHaveAccessibleName('Copy Windows install command');
  });

  test('the bar never paints the wrong platform first', async ({ page }) => {
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { ocxSeen: string[] }).ocxSeen = seen;
      new MutationObserver(() => {
        // Whatever the first paint could catch: the command text as of each frame.
        requestAnimationFrame(() => {
          const t = document.querySelector('#story .ocx-cmdbar__text')?.textContent;
          if (t) seen.push(t.trim());
        });
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto(PAGE);
    await page.waitForLoadState('networkidle');
    // No sample yet (no frame ran) proves nothing either way: wait for one, then judge them all.
    await page.waitForFunction(() => (window as unknown as { ocxSeen: string[] }).ocxSeen.length > 0);
    const seen = await page.evaluate(() => (window as unknown as { ocxSeen: string[] }).ocxSeen);
    expect(new Set(seen)).toEqual(new Set([WINDOWS]));
  });
});

test.describe('mobile 390', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a long command scrolls inside its field, never the page', async ({ page }) => {
    await page.goto(MORE);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = page.locator('main .ocx-cmdbar').nth(3).locator('.ocx-cmdbar__field');
    const [scroll, client] = await box.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scroll).toBeGreaterThan(client);
    await box.evaluate((el) => el.scrollTo({ left: 200 }));
    expect(await box.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // The copy lane stays put while the text scrolls under it.
    const icons = box.locator('.ocx-cmdbar__icons');
    const edge = await box.evaluate((el) => el.getBoundingClientRect().right);
    expect((await icons.boundingBox())!.x + (await icons.boundingBox())!.width).toBeLessThanOrEqual(edge);
  });

  test('the icon-only picker leaves the field most of the width', async ({ page }) => {
    await page.goto(PAGE);
    const field = (await demo(page).locator('.ocx-cmdbar__field').boundingBox())!;
    const bar = (await demo(page).boundingBox())!;
    expect(field.width / bar.width).toBeGreaterThan(0.8);
  });

  test('every segment is one height and the bar fits the viewport', async ({ page }) => {
    await page.goto(MORE);
    const bar = page.locator('main .ocx-cmdbar').nth(0);
    const heights = await bar.evaluate((el) =>
      [
        el.querySelector('.ocx-ui-select__control'),
        el.querySelector('.ocx-cmdbar__field'),
        el.querySelector('.ocx-cmdbar__action > *'),
      ].map((e) => Math.round(e!.getBoundingClientRect().height)),
    );
    expect(new Set(heights).size).toBe(1);
    expect((await bar.boundingBox())!.x + (await bar.boundingBox())!.width).toBeLessThanOrEqual(390);
  });
});

for (const theme of ['light', 'dark'])
  for (const path of [PAGE, MORE])
    test(`axe reports no violations, every state (${theme}, ${path})`, async ({ page }) => {
      await page.goto(path);
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      await settle(page); // axe must read final colours, not a theme crossfade
      const { violations } = await new AxeBuilder({ page }).include('main').analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
