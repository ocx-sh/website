// Sidebar on a plain Astro page (Shell layout, no Starlight): /docs/shell/sidebar/ and its story.
import { AxeBuilder } from '@axe-core/playwright';
import { settle } from './helpers/settle.ts';
import { expect, test } from '@playwright/test';

test('renders beside the content with the current page marked, and loads no script of its own', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/docs/shell/sidebar/');
  const nav = page.getByRole('navigation', { name: 'Documentation' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Sidebar page' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Install' })).not.toHaveAttribute('aria-current', /.*/);
  await expect(nav.getByRole('heading', { name: 'Getting started' }).getByRole('link')).toHaveAttribute(
    'href',
    '/docs/shell/sidebar/',
  );
  expect(await nav.locator('script').count()).toBe(0);
  expect(await nav.locator('[data-zag-root]').count()).toBe(0);
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  expect(errors).toEqual([]);
});

test('every link is at least 24px tall (WCAG 2.5.8) and the sidebar uses the sidebar tokens', async ({ page }) => {
  await page.goto('/docs/shell/sidebar/');
  const heights = await page
    .locator('.ocx-ui-sidebar a')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(24);
  const current = page.locator('.ocx-ui-sidebar a[aria-current="page"]');
  const [color, bg] = await current.evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]);
  expect(color).not.toBe(bg);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
});

test('stories: default and states render and pass axe', async ({ page }) => {
  for (const story of ['default', 'states']) {
    await page.goto(`/docs/stories/sidebar/${story}/`);
    await expect(page.locator('.ocx-ui-sidebar').first()).toBeVisible();
    await settle(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(
      violations.map((v) => v.id),
      story,
    ).toEqual([]);
  }
});

test('stays readable on a narrow viewport: no horizontal page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/docs/shell/sidebar/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
