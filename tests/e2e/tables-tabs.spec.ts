// Markdown tables fit their column unless their words cannot, and shell tabs
// paint complete on first render (built example, see playwright.config.ts).
import { expect, test, type Page } from '@playwright/test';

/** Horizontal overflow (scrollWidth − clientWidth) of each table scroll region. */
const overflows = (page: Page) =>
  page.locator('.ocx-table-scroll').evaluateAll((els) => els.map((e) => e.scrollWidth - e.clientWidth));

test.describe('tables at 1280px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a 2-column and an 8-column table with long inline code fit without scrolling', async ({ page }) => {
    await page.goto('/docs/components/tables/');
    const [short, aligned, wide] = await overflows(page);
    expect(short).toBe(0);
    expect(aligned).toBe(0);
    expect(wide).toBe(0);
  });

  test('DataTable: sort, filter and paging re-arrange the server-rendered rows', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/docs/stories/data-table/default/');
    const table = page.locator('#story [data-ocx-data-table]');
    const names = () => table.locator('tr[data-ocx-row]:not([hidden]) td:first-child').allTextContents();
    expect(await names()).toEqual(['bazel', 'buf', 'clang', 'cmake', 'deno', 'gcc']);
    const size = table.locator('button[data-ocx-sort="size"]');
    await size.click();
    await expect(table.locator('th[data-ocx-key="size"]')).toHaveAttribute('aria-sort', 'ascending');
    await size.click();
    await expect(table.locator('th[data-ocx-key="size"]')).toHaveAttribute('aria-sort', 'descending');
    expect(await names()).toEqual(['clang', 'gcc', 'rust', 'gradle', 'python', 'go']);
    await table.locator('[data-part="next-trigger"]').click();
    await expect(table.locator('[aria-current="page"]')).toHaveText('2');
    expect(await names()).toEqual(['bazel', 'cmake', 'zig', 'deno', 'buf', 'uv']);
    const filter = table.locator('input[data-ocx-filter]');
    await filter.fill('tool');
    await expect(table.locator('[data-ocx-status]')).toHaveText('5 of 17 rows');
    await expect(table.locator('[data-ocx-pager]')).toBeHidden();
    await filter.fill('o');
    await expect(table.locator('[data-ocx-status]')).toHaveText('13 of 17 rows');
    await expect(table.locator('[data-ocx-slot]:not([hidden])')).toHaveText(['1', '2', '3']);
    await expect(table.locator('[aria-current="page"]')).toHaveText('1');
    await filter.fill('cobol');
    await expect(table.locator('tr[data-ocx-empty]')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test('shell tab icons are inline svg: no request, currentColor, a reserved box', async ({ page }) => {
  const svgs: string[] = [];
  page.on('request', (r) => {
    if (/\.svg(\?|$)/.test(r.url()) && !/logo/.test(r.url())) svgs.push(r.url());
  });
  await page.goto('/docs/stories/tabs/default/');
  const icons = page.locator('[role="tab"] > svg.ocx-icon');
  expect(await icons.count()).toBeGreaterThan(0);
  const boxes = await icons.evaluateAll((els) =>
    els.map((e) => [e.getBoundingClientRect().width, getComputedStyle(e).backgroundImage]),
  );
  for (const [w, bg] of boxes) {
    expect(w).toBeGreaterThan(0);
    expect(bg).toBe('none');
  }
  expect(svgs).toEqual([]);
});

test('code stylesheets load ahead of the content, so tabs never paint unframed', async ({ page }) => {
  // The story page hoists Expressive Code's in-content stylesheet into the head (StoryLayout).
  await page.goto('/docs/stories/tabs/default/');
  await expect(page.locator('#story .expressive-code').first()).toBeAttached();
  expect(await page.locator('body link[rel="stylesheet"]').count()).toBe(0);
  expect(await page.locator('head link[rel="stylesheet"][href*="/ec."]').count()).toBe(1);
});
