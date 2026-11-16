// The "On this page" list tells section titles (h2) from subsections (h3): ink and semibold against muted and
// regular, the caption distinct from both, and the current entry's accent kept at 4.5:1 in both schemes, on the
// desktop outline and in the phone list. No layout change: the rows keep their height.
import { expect, test, type Page } from '@playwright/test';

// Two h2 entries with h3 entries under one of them.
const PAGE = '/docs/components/dialog-presets/';
const DESKTOP = 'starlight-toc';
const PHONE = 'mobile-starlight-toc';

/** Colour, weight and size of the first h2 row that is not current, the first h3 row and (desktop) the caption. */
const levels = (page: Page, root: string) =>
  page.evaluate((sel) => {
    const style = (el: Element | null | undefined) => {
      const css = getComputedStyle(el as Element);
      return {
        color: css.color,
        weight: Number(css.fontWeight),
        size: parseFloat(css.fontSize),
        height: (el as Element).getBoundingClientRect().height,
      };
    };
    const rows = [...document.querySelectorAll(`${sel} > nav ul > li > a, ${sel} .dropdown ul > li > a`)].filter(
      (a) => !a.closest('ul ul') && a.getAttribute('aria-current') !== 'true',
    );
    return {
      h2: style(rows[0]),
      h3: style(document.querySelector(`${sel} ul ul a`)),
      caption: document.querySelector('.right-sidebar-panel h2')
        ? style(document.querySelector('.right-sidebar-panel h2'))
        : null,
    };
  }, root);

/** WCAG contrast of `color` over `bg`, both `rgb()` strings with no alpha. */
const contrast = (color: string, bg: string) => {
  const lum = (c: string) => {
    const [r = 0, g = 0, b = 0] = (c.match(/[\d.]+/g) ?? []).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi = 0, lo = 0] = [lum(color), lum(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

test.describe('desktop outline', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');
  test.use({ viewport: { width: 1400, height: 800 } });

  for (const scheme of ['light', 'dark'] as const) {
    test(`section rows read as titles, subsections stay muted and regular (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(PAGE);
      const { h2, h3, caption } = await levels(page, DESKTOP);
      const ink = await page.evaluate(() => getComputedStyle(document.querySelector('h1') as Element).color);
      expect(h2.weight).toBe(600);
      expect(h3.weight).toBe(400);
      expect(h2.size).toBeGreaterThan(h3.size);
      expect(h2.color, 'h2 rows wear the ink colour').toBe(ink);
      expect(h3.color, 'h3 rows are visibly lighter than h2 rows').not.toBe(h2.color);
      expect(caption?.color, 'the caption is distinct from both').not.toBe(h2.color);
      expect(caption?.color).not.toBe(h3.color);
      expect(h2.height, 'the row keeps its height').toBeCloseTo(23.6, 0);
    });

    test(`the current entry keeps its accent at 4.5:1 and stays heavier than a subsection (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(PAGE);
      const current = page.locator(`${DESKTOP} a[aria-current="true"]`).first();
      const [color, bg, weight] = await Promise.all([
        current.evaluate((el) => getComputedStyle(el).color),
        page.evaluate(() => getComputedStyle(document.body).backgroundColor),
        current.evaluate((el) => Number(getComputedStyle(el).fontWeight)),
      ]);
      expect(contrast(color, bg)).toBeGreaterThanOrEqual(4.5);
      expect(weight).toBe(600);
    });
  }

  test('a subsection that is current is accent-coloured, not muted', async ({ page }) => {
    await page.goto(`${PAGE}#confirmdialog`);
    const link = page.locator(`${DESKTOP} ul ul a[aria-current="true"]`);
    await expect(link).toHaveCount(1);
    const [color, muted] = await Promise.all([
      link.evaluate((el) => getComputedStyle(el).color),
      page
        .locator(`${DESKTOP} ul ul a`)
        .last()
        .evaluate((el) => getComputedStyle(el).color),
    ]);
    expect(color).not.toBe(muted);
  });
});

test.describe('phone list', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('section rows are semibold and subsections regular and muted', async ({ page }) => {
    await page.goto(PAGE);
    await page.locator(`${PHONE} summary`).click();
    const { h2, h3 } = await levels(page, PHONE);
    expect(h2.weight).toBe(600);
    expect(h3.weight).toBe(400);
    expect(h2.color).not.toBe(h3.color);
  });
});
