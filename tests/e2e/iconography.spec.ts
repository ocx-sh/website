// Iconography: the searchable icon catalog, and icons in menu items and the href Button.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const CATALOG = '/docs/components/iconography/catalog/';

test.describe('icon catalog', () => {
  test('lists every icon server-side, then filters by name, group or keyword as you type', async ({ page }) => {
    await page.goto(CATALOG);
    const cards = page.locator('[data-icon-catalog] li');
    const visible = page.locator('[data-icon-catalog] li:not([hidden])');
    const count = page.locator('[data-icon-catalog] [data-count]');
    const total = await cards.count();
    expect(total).toBeGreaterThan(20);
    await expect(count).toHaveText(`${total} icons`);
    const search = page.getByRole('searchbox', { name: 'Search icons' });

    await search.fill('linux');
    await expect(visible).toHaveCount(1);
    await expect(visible.locator('code')).toHaveText('linux');
    await expect(count).toHaveText(`1 of ${total} icons`);

    await search.fill('delete'); // keyword of trash
    await expect(visible.locator('code')).toHaveText(['trash']);

    await search.fill('shell');
    expect(await visible.count()).toBeGreaterThanOrEqual(5);

    await search.fill('zzz');
    await expect(visible).toHaveCount(0);
    await expect(count).toHaveText('No icon matches');

    await search.fill('');
    await expect(visible).toHaveCount(total);
    expect((await new AxeBuilder({ page }).include('[data-icon-catalog]').analyze()).violations).toEqual([]);
  });

  test('every icon is inline SVG: nothing to load, nothing to flicker', async ({ page }) => {
    const images: string[] = [];
    page.on('request', (r) => r.resourceType() === 'image' && images.push(r.url()));
    await page.goto(CATALOG);
    const svgs = page.locator('[data-icon-catalog] li svg.ocx-icon');
    await expect(svgs).toHaveCount(await page.locator('[data-icon-catalog] li').count());
    expect(images.filter((u) => u.includes('icon'))).toEqual([]);
  });
});

test('the href Button uses the arrow-right icon, not a text arrow', async ({ page }) => {
  await page.goto('/docs/stories/button/default/');
  const link = page.locator('a.ocx-ui-button', { hasText: 'User guide' }).first();
  await expect(link.locator('svg[data-icon="arrow-right"]')).toBeVisible();
  await expect(link).not.toContainText('→');
});

test('menu items show their icons, aligned', async ({ page }) => {
  await page.goto('/docs/stories/action-menu/default/');
  const root = page.locator('#story .ocx-ui-action-menu');
  await root.getByRole('button', { name: 'Actions' }).click();
  const items = root.locator('[data-part="item"]');
  await expect(items.first().locator('svg[data-icon="copy"]')).toBeVisible();
  const lefts = await items.evaluateAll((els) =>
    els.map((el) => Math.round(el.querySelector('.ocx-ui-action-menu__icon')?.getBoundingClientRect().right ?? -1)),
  );
  expect(new Set(lefts).size).toBe(1);
});
