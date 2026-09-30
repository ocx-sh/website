// C-268 Tag chip primitive on the tag story pages: axe per state and scheme, filter on/off computed
// styles, the remove button's accessible name, and filter-on contrast in both schemes.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { computed, resolve } from './tokens.ts';

// The `states` story holds every variant; `default` is the label and stamp pair.
const STORY = '/docs/stories/tag/';
const PAGE = `${STORY}states/`;
const on = 'main .ocx-ui-tag[data-variant="filter"][aria-pressed="true"]';
const off = 'main .ocx-ui-tag[data-variant="filter"][aria-pressed="false"]:not(:disabled)';
const setTheme = (page: Page, t: string) => page.evaluate((v) => (document.documentElement.dataset['theme'] = v), t);

for (const theme of ['light', 'dark'])
  for (const path of [`${STORY}default/`, PAGE])
    test(`Tag: axe reports no violations on ${path} (${theme})`, async ({ page }) => {
      await page.goto(path);
      await setTheme(page, theme);
      const { violations } = await new AxeBuilder({ page }).include('main').analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });

test('Tag: the showcase renders filter off, on and disabled, and removable chips', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator(on).first()).toBeVisible();
  await expect(page.locator(off).first()).toBeVisible();
  await expect(page.locator('main .ocx-ui-tag[data-variant="filter"]:disabled').first()).toBeVisible();
  await expect(page.locator('main .ocx-ui-tag[data-removable]').first()).toBeVisible();
  await expect(page.locator('main .ocx-ui-tag[data-removable][data-tone="keyword"]').first()).toBeVisible();
});

test('Tag: filter on shows an accent edge, accent ink and tint, and the check; off is surface and hairline', async ({
  page,
}) => {
  await page.goto(PAGE);
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    const chip = page.locator(on).first();
    expect(await computed(chip, 'color'), theme).toBe(await resolve(page, 'color', 'var(--ocx-color-accent-fg)'));
    expect(await computed(chip, 'background-color'), theme).toBe(
      await resolve(page, 'background-color', 'var(--ocx-color-accent-tint)'),
    );
    expect(await computed(chip, 'border-top-color'), theme).toBe(
      await resolve(page, 'border-top-color', 'var(--ocx-color-accent)'),
    );
    // The emphasis edge is an inset shadow: the border box stays as thick as an off chip's.
    expect(await computed(chip, 'box-shadow'), theme).toContain('inset');
    // A probe without a border style computes every width to 0, so give it one.
    expect(await computed(chip, 'border-top-width'), theme).toBe(
      await resolve(page, 'border-top', 'var(--ocx-border-width) solid', 'border-top-width'),
    );
    await expect(chip.locator('.ocx-ui-tag__check')).toBeVisible();

    const other = page.locator(off).first();
    expect(await computed(other, 'color'), theme).toBe(await resolve(page, 'color', 'var(--ocx-color-fg-muted)'));
    expect(await computed(other, 'background-color'), theme).toBe(
      await resolve(page, 'background-color', 'var(--ocx-color-surface)'),
    );
    expect(await computed(other, 'border-top-color'), theme).toBe(
      await resolve(page, 'border-top-color', 'var(--ocx-color-border)'),
    );
    expect(await computed(other, 'box-shadow'), theme).toBe('none');
    await expect(other.locator('.ocx-ui-tag__check')).toBeHidden();
  }
});

test('Tag: aria-pressed alone flips the look (no class, no JS)', async ({ page }) => {
  await page.goto(PAGE);
  // Pinned by value: the `off` selector stops matching the chip once it is pressed.
  const value = await page.locator(off).first().getAttribute('data-value');
  const chip = page.locator(`main .ocx-ui-tag[data-variant="filter"][data-value="${value}"]`);
  await chip.evaluate((el) => el.setAttribute('aria-pressed', 'true'));
  await expect(chip.locator('.ocx-ui-tag__check')).toBeVisible();
  expect(await computed(chip, 'border-top-color')).toBe(
    await resolve(page, 'border-top-color', 'var(--ocx-color-accent)'),
  );
});

test('Tag: the filter chip is a focusable button with a square focus ring', async ({ page }) => {
  await page.goto(PAGE);
  const chip = page.locator(off).first();
  await chip.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(chip).toBeFocused();
  expect(await computed(chip, 'outline-style')).toBe('solid');
  expect(await computed(chip, 'cursor')).toBe('pointer');
});

test('Tag: the remove button is named by removeLabel, square, and inside the chip', async ({ page }) => {
  await page.goto(PAGE);
  const chip = page.locator('main .ocx-ui-tag[data-removable]').first();
  const remove = chip.getByRole('button', { name: 'Remove cli' });
  await expect(remove).toBeVisible();
  const [w, h, inside] = await remove.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const c = b.parentElement!.getBoundingClientRect();
    return [r.width, r.height, r.right <= c.right && r.left >= c.left && r.top >= c.top && r.bottom <= c.bottom];
  });
  expect(w).toBe(h);
  expect(inside).toBe(true);
  expect(await computed(remove, 'color')).toBe(await resolve(page, 'color', 'var(--ocx-color-fg-subtle)'));
  await remove.hover();
  expect(await computed(remove, 'color')).toBe(await resolve(page, 'color', 'var(--ocx-color-fg)'));
  await remove.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  expect(await computed(remove, 'outline-style')).toBe('solid');
});

test('Tag: the remove button does nothing on its own', async ({ page }) => {
  await page.goto(PAGE);
  const chip = page.locator('main .ocx-ui-tag[data-removable]').first();
  await chip.getByRole('button').click();
  await expect(chip).toBeVisible();
});

for (const theme of ['light', 'dark'])
  test(`Tag: filter-on ink on its tint meets 4.5:1 over the page and surface (${theme})`, async ({ page }) => {
    await page.goto(PAGE);
    await setTheme(page, theme);
    const chip = page.locator(on).first();
    const ink = await computed(chip, 'color');
    const tint = await computed(chip, 'background-color');
    for (const base of ['var(--ocx-color-bg)', 'var(--ocx-color-surface)']) {
      const baseColor = await resolve(page, 'background-color', base);
      // Canvas normalises any colour space (oklch, color()) to sRGB and composites the tint's alpha.
      const ratio = await page.evaluate(
        ([ink, tint, baseColor]) => {
          const px = (paint: (c: CanvasRenderingContext2D) => void) => {
            const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
            paint(ctx);
            return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
          };
          const fill = (c: CanvasRenderingContext2D, color: string) => {
            c.fillStyle = color;
            c.fillRect(0, 0, 1, 1);
          };
          const bg = px((c) => (fill(c, baseColor!), fill(c, tint!)));
          const fg = px((c) => fill(c, ink!));
          const lum = (rgb: number[]) => {
            const [r, g, b] = rgb.map((v) => {
              const s = v / 255;
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
          };
          const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
          return (hi! + 0.05) / (lo! + 0.05);
        },
        [ink, tint, baseColor],
      );
      expect(ratio, `${theme} on ${base}`).toBeGreaterThanOrEqual(4.5);
    }
  });
