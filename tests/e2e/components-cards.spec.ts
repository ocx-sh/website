// Track D card family on its showcase page: one card design for Starlight Card, LinkCard and
// .ocx-card, and the DependencyExplorer's fact cards wear the same class.
import { expect, test } from '@playwright/test';
import { computed, resolve } from './tokens.ts';

const PAGE = '/docs/components/cards/';

test.describe('Cards', () => {
  test('Card and .ocx-card share box: padding, border and radius equal the tokens', async ({ page }) => {
    await page.goto(PAGE);
    const pad = await resolve(page, 'padding-top', 'var(--ocx-card-pad)');
    const border = await resolve(page, 'border-top-color', 'var(--ocx-color-border)');
    const radius = await resolve(page, 'border-top-left-radius', 'var(--ocx-radius-lg)');
    for (const card of [page.locator('article.card').first(), page.locator('div.ocx-card').first()]) {
      expect(await computed(card, 'padding-top')).toBe(pad);
      expect(await computed(card, 'border-top-color')).toBe(border);
      expect(await computed(card, 'border-top-left-radius')).toBe(radius);
      expect(await computed(card, 'box-shadow')).toBe('none');
    }
  });

  test('Card icon is a square neutral tile of control-md beside the title', async ({ page }) => {
    await page.goto(PAGE);
    const icons = page.locator('article.card .icon');
    const tile = await resolve(page, 'width', 'var(--ocx-control-md)');
    const fill = await resolve(page, 'background-color', 'var(--ocx-color-surface-subtle)');
    const n = await icons.count();
    expect(n).toBeGreaterThan(1);
    for (let i = 0; i < n; i++) {
      const box = await icons.nth(i).boundingBox();
      expect(`${box!.width}px`).toBe(tile);
      expect(box!.height).toBe(box!.width);
      expect(await computed(icons.nth(i), 'background-color')).toBe(fill);
      expect(await computed(icons.nth(i), 'border-top-left-radius')).toBe('0px');
    }
  });

  test('Link cards hover to the neutral hover border, never the accent', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'hover-only affordance; touch has no hover');
    await page.goto(PAGE);
    const hover = await resolve(page, 'border-top-color', 'var(--ocx-color-hover-border)');
    const accent = await resolve(page, 'border-top-color', 'var(--ocx-color-accent)');
    for (const card of [page.locator('.sl-link-card').first(), page.locator('a.ocx-card').first()]) {
      await card.hover();
      await expect.poll(() => computed(card, 'border-top-color')).toBe(hover);
      expect(await computed(card, 'border-top-color')).not.toBe(accent);
    }
  });

  test('DependencyExplorer fact cards are .ocx-card', async ({ page }) => {
    await page.goto('/docs/stories/dependency-explorer/default/');
    const stats = page.locator('.ocx-deps__stat');
    await expect(stats.first()).toBeVisible();
    for (const stat of await stats.all()) await expect(stat).toHaveClass(/\bocx-card\b/);
    const pad = await resolve(page, 'padding-top', 'var(--ocx-card-pad)');
    expect(await computed(stats.first(), 'padding-top')).toBe(pad);
  });
});
