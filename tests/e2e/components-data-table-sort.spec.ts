import { expect, test } from '@playwright/test';

// The header shows one sort icon at a time, chosen by CSS from aria-sort (no JS decides it).
test('DataTable: the sort icon follows the header aria-sort', async ({ page }) => {
  await page.goto('/docs/stories/data-table/default/');
  const table = page.locator('#story [data-ocx-data-table]');
  const th = table.locator('th[data-ocx-key="size"]');
  const shown = () =>
    th
      .locator('svg')
      .evaluateAll((svgs) =>
        svgs.filter((svg) => getComputedStyle(svg).display !== 'none').map((svg) => svg.getAttribute('data-icon')),
      );
  expect(await shown()).toEqual(['sort']);
  await th.locator('button').click();
  await expect(th).toHaveAttribute('aria-sort', 'ascending');
  expect(await shown()).toEqual(['sort-asc']);
  await th.locator('button').click();
  await expect(th).toHaveAttribute('aria-sort', 'descending');
  expect(await shown()).toEqual(['sort-desc']);
});

// The filter is a SearchField (C-274): its clear button and Escape empty it like typing would, so
// the rows come back and the pager returns.
test('DataTable: the filter is a SearchField whose clear button and Escape re-filter', async ({ page }) => {
  await page.goto('/docs/stories/data-table/default/');
  const table = page.locator('#story [data-ocx-data-table]');
  const field = table.locator('.ocx-ui-search-field.ocx-data-table__filter');
  const filter = field.locator('input[data-ocx-filter]');
  const clear = field.locator('.ocx-ui-search-field__clear');
  const status = table.locator('[data-ocx-status]');
  await expect(field.getByRole('searchbox', { name: /^Filter / })).toBeVisible();
  await expect(clear).toBeHidden();
  await filter.fill('tool');
  await expect(status).toHaveText('5 of 17 rows');
  await expect(clear).toBeVisible();
  await expect(table.locator('[data-ocx-pager]')).toBeHidden();
  await clear.click();
  await expect(filter).toHaveValue('');
  await expect(filter).toBeFocused();
  await expect(status).toHaveText('17 rows');
  await expect(table.locator('[data-ocx-pager]')).toBeVisible();
  await filter.fill('cobol');
  await expect(table.locator('tr[data-ocx-empty]')).toBeVisible();
  await filter.press('Escape');
  await expect(table.locator('tr[data-ocx-empty]')).toBeHidden();
  await expect(status).toHaveText('17 rows');
});
