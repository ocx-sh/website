// Heading permalinks (markdown/heading-anchors.mjs): every heading carries one link element around its text, no wrapper, no
// icon markup; the glyph is CSS and shows on hover and keyboard focus; a jump lands where it always did.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { settle } from './helpers/settle.ts';

const LONG = '/docs/probe/long/';

test.describe('heading permalinks', () => {
  test('a heading holds one link element around its text; no wrapper, no icon markup', async ({ page }) => {
    await page.goto(LONG);
    const stats = await page.evaluate(() => {
      const headings = [...document.querySelectorAll('.sl-markdown-content :is(h2, h3, h4)[id]')];
      return {
        count: headings.length,
        wrappers: document.querySelectorAll('.sl-heading-wrapper, .sl-anchor-link, .sl-anchor-icon').length,
        bad: headings
          .filter((h) => {
            const link = h.firstElementChild;
            return (
              h.children.length !== 1 ||
              link?.localName !== 'a' ||
              link.getAttribute('href') !== `#${h.id}` ||
              link.textContent !== h.textContent ||
              link.querySelector('svg, span, path')
            );
          })
          .map((h) => h.id),
      };
    });
    expect(stats.count).toBeGreaterThan(5);
    expect(stats.wrappers).toBe(0);
    expect(stats.bad).toEqual([]);
  });

  test('the heading is still a heading named by its text, and its link is named by the same text', async ({ page }) => {
    await page.goto(LONG);
    await expect(page.getByRole('heading', { name: 'Declare the tools', exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Declare the tools', exact: true })).toHaveAttribute(
      'href',
      '#declare-the-tools',
    );
  });

  test('keyboard: Tab reaches the link, Enter follows it, the heading is :target', async ({ page }) => {
    await page.goto(LONG);
    const link = page.locator('#declare-the-tools > a');
    await page.locator('#why-pin-tools > a').focus();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('href'));
    expect(focused).toMatch(/^#/); // the next focusable thing is a permalink or a link in the section: order unchanged
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#declare-the-tools$/);
    expect(await page.locator('#declare-the-tools').evaluate((h) => h.matches(':target'))).toBe(true);
  });

  test('the glyph shows on keyboard focus, and on hover; at rest it is hidden where there is hover', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'touch devices always show it; this host reports hover');
    await page.goto(LONG);
    const glyph = (sel: string) => page.locator(sel).evaluate((a) => Number(getComputedStyle(a, '::after').opacity));
    expect(await glyph('#declare-the-tools > a')).toBe(0);
    await page.locator('#declare-the-tools').hover();
    await expect.poll(() => glyph('#declare-the-tools > a')).toBe(1);
    await page.mouse.move(2, 2);
    await page.keyboard.press('Tab');
    await page.locator('#why-pin-tools > a').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => glyph('#why-pin-tools > a')).toBe(1);
    const ring = await page.locator('#why-pin-tools > a').evaluate((a) => getComputedStyle(a).outlineStyle);
    expect(ring).not.toBe('none');
  });

  test('a jump to a heading lands its text where the scroll padding is (the h2 rule sits above it)', async ({
    page,
  }) => {
    for (const id of ['declare-the-tools', 'choosing-a-tag']) {
      await page.goto(`${LONG}#${id}`);
      await settle(page);
      const { top, pad } = await page.evaluate((id) => {
        const a = document.querySelector(`#${id} > a`)!;
        return {
          top: a.getBoundingClientRect().top,
          pad: parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
        };
      }, id);
      expect(Math.abs(top - pad), id).toBeLessThanOrEqual(2);
    }
  });

  test('JS off: the permalinks are there and work', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`http://localhost:${process.env['E2E_PORT'] ?? '4322'}${LONG}`);
    await page.locator('#declare-the-tools > a').click();
    await expect(page).toHaveURL(/#declare-the-tools$/);
    await context.close();
  });

  test('axe reports no violations on a page of permalinks and both outlines', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'a 390 px code block scrolls without a stop: not about permalinks');
    await page.goto(LONG);
    await settle(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});
