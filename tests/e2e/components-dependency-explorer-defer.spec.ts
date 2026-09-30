// DependencyExplorer starts its module at idle after load (or on first input), outside the
// first-paint window Lighthouse charges; a reload sent before that mount is held and replayed.
import { expect, test, type Route } from '@playwright/test';

const PAGE = '/docs/stories/dependency-explorer/default/';
const MODULE = /\/dependency-explorer\.[^/]*\.js$/;

test('the explorer module starts after the load event, with no input', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('.ocx-deps').first().locator('table')).not.toHaveAttribute('aria-busy');
  const [start, load] = await page.evaluate((src) => {
    const re = new RegExp(src);
    const mod = performance.getEntriesByType('resource').find((e) => re.test(new URL(e.name).pathname));
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return [mod?.startTime ?? -1, nav?.loadEventStart ?? Infinity];
  }, MODULE.source);
  expect(start).toBeGreaterThanOrEqual(load);
});

test('an ocx:deps:load sent before the explorer mounts is replayed after it', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(MODULE, async (route: Route) => {
    await gate;
    await route.continue();
  });
  await page.goto(PAGE);
  const empty = {
    generated: '2026-09-27',
    binaries: { ocx: { summary: { total: 0, uniqueLicenses: 0, licenses: {} }, components: [] } },
  };
  await page.evaluate(
    (data) =>
      document.querySelector('.ocx-deps')?.dispatchEvent(new CustomEvent('ocx:deps:load', { detail: { data } })),
    empty,
  );
  release();
  await expect(page.locator('.ocx-deps').first().locator('.ocx-deps__count')).toHaveText('Showing 0 of 0 components');
});

// The showcase's own wiring (state buttons, event log) is inline, not module requests before first
// paint: past ~16 of those Lighthouse's simulation queued LCP a round trip later (perf 0.99).
test('the showcase controls and event log add no module script before first paint', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('script[src*="DepsControls"], script[src*="EventLog"]')).toHaveCount(0);
  await page.locator('[data-deps="empty"]').click();
  await expect(page.locator('.ocx-deps').first().locator('.ocx-deps__count')).toHaveText('Showing 0 of 0 components');
});
