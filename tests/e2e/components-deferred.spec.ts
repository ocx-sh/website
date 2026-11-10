// Deferred on its story pages (stories/deferred/{default,error}): the fragment starts after the load
// event, nothing shifts, a stylesheet is linked once, a failure keeps the box and Retry recovers, and
// without JS the skeleton and a link remain.
import { expect, test, type Page } from '@playwright/test';

const DEFAULT = '/docs/stories/deferred/default/';
const ERROR = '/docs/stories/deferred/error/';
const FRAGMENT = /\/frag\/shell-session\/$/;

/** Collects layout shifts (value, ignoring those after a recent input) from the first paint on. */
const watchShifts = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
        if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
const shifts = (page: Page) => page.evaluate(() => (window as unknown as { __cls: number }).__cls);
const loaded = (page: Page) => page.locator('[data-ocx-deferred][data-loaded]');

test('the fragment is requested after the load event, with no input', async ({ page }) => {
  await page.goto(DEFAULT);
  await expect(loaded(page)).toHaveCount(1);
  const [start, load] = await page.evaluate((src) => {
    const re = new RegExp(src);
    const res = performance.getEntriesByType('resource').find((e) => re.test(new URL(e.name).pathname));
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return [res?.startTime ?? -1, nav?.loadEventStart ?? Infinity];
  }, FRAGMENT.source);
  expect(start).toBeGreaterThanOrEqual(load);
});

test('the content replaces the skeleton in the same box: no layout shift, same block size', async ({ page }) => {
  await watchShifts(page);
  await page.goto(DEFAULT);
  const box = page.locator('[data-ocx-deferred]');
  const before = (await box.boundingBox())!;
  await expect(loaded(page)).toHaveCount(1);
  await expect(page.locator('.ocx-shell-session')).toBeVisible();
  const after = (await box.boundingBox())!;
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
  expect(await shifts(page)).toBe(0);
  await expect(box).not.toHaveAttribute('aria-busy');
  await expect(page.locator('[data-swap-skeleton]')).toBeHidden();
});

test('its stylesheet and script are added once, even when two parts load the same fragment', async ({ page }) => {
  await page.goto(DEFAULT);
  await expect(loaded(page)).toHaveCount(1);
  await page.evaluate(() => {
    // A second fragment from the same page: adopt must find everything it needs already linked.
    const host = document.querySelector('[data-ocx-deferred]')!;
    const clone = host.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-loaded');
    clone.querySelector('[data-deferred-content]')!.replaceChildren();
    clone.dataset['state'] = 'idle';
    host.after(clone);
    clone.dispatchEvent(new CustomEvent('ocx:inserted', { bubbles: true })); // mounts it like any inserted root
  });
  await expect(loaded(page)).toHaveCount(2);
  const heads = await page.locator('link[rel=stylesheet][href*="/ec."]').count();
  expect(heads).toBe(1);
  await expect(page.locator('script[type=module][src*="/ec."]')).toHaveCount(1);
});

test('a fragment that fails keeps the box and offers Retry, which loads it', async ({ page }) => {
  await watchShifts(page);
  await page.goto(ERROR); // another origin: refused without a request, so the page stays free of console errors
  const box = page.locator('[data-ocx-deferred]');
  await expect(box).toHaveAttribute('data-state', 'error');
  await expect(page.locator('[data-deferred-error]')).toBeVisible();
  await expect(box).not.toHaveAttribute('aria-busy');
  await expect(box).not.toHaveAttribute('data-loaded');
  const height = (await box.boundingBox())!.height;
  await box.evaluate((el) => (el.dataset['src'] = `${location.origin}/docs/frag/shell-session/`));
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(box).toHaveAttribute('data-state', 'loaded');
  await expect(page.locator('.ocx-shell-session')).toBeVisible();
  expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(height - 1);
  expect(await shifts(page)).toBe(0);
});

test('a loader chunk that cannot be fetched still shows the error and Retry, and Retry reloads and loads the content', async ({
  page,
}) => {
  const block = (route: { abort: () => Promise<void> }) => route.abort();
  await page.route(/\/deferred\.[\w-]+\.js$/, block);
  await page.goto(DEFAULT);
  const box = page.locator('[data-ocx-deferred]');
  await expect(box).toHaveAttribute('data-state', 'error');
  await expect(page.getByText('Could not load this.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.locator('[data-swap-skeleton]')).toBeHidden();
  await page.unroute(/\/deferred\.[\w-]+\.js$/, block);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(box).toHaveAttribute('data-state', 'loaded');
  await expect(page.locator('.ocx-shell-session')).toBeVisible();
});

test('a fragment answering 404 is an error too', async ({ page }) => {
  await page.route('**/frag/shell-session/', (route) => route.fulfill({ status: 404, body: 'nope' }));
  await page.goto(DEFAULT);
  await expect(page.locator('[data-ocx-deferred]')).toHaveAttribute('data-state', 'error');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the swap is instant', async ({ page }) => {
    await page.goto(DEFAULT);
    await expect(loaded(page)).toHaveCount(1);
    const durations = await page
      .locator('[data-ocx-deferred] > *')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).transitionDuration));
    for (const d of durations) expect(parseFloat(d)).toBe(0);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the skeleton stays and a link to the fragment shows', async ({ page }) => {
    await page.goto(DEFAULT);
    await expect(page.locator('[data-ocx-deferred]')).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('[data-ocx-deferred] [data-swap-skeleton]')).toBeVisible();
    const link = page.getByRole('link', { name: 'Shell session' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /\/frag\/shell-session\/$/);
  });
});

test('trigger input: nothing is fetched before the first input, one scroll loads it', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => FRAGMENT.test(new URL(r.url()).pathname) && requested.push(r.url()));
  await page.goto('/docs/stories/deferred/on-input/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  expect(requested).toEqual([]);
  await expect(loaded(page)).toHaveCount(0);
  await expect(page.locator('[data-ocx-deferred] [data-swap-skeleton]')).toBeVisible();
  await page.mouse.wheel(0, 300);
  await expect(loaded(page)).toHaveCount(1);
  expect(requested).toHaveLength(1);
});

test('trigger panel: the inactive tab loads when it is picked, not before', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => FRAGMENT.test(new URL(r.url()).pathname) && requested.push(r.url()));
  await page.goto('/docs/stories/deferred/in-a-tab/');
  await page.waitForLoadState('networkidle');
  expect(requested).toEqual([]);
  await page.getByRole('tab', { name: 'Loaded' }).click();
  await expect(loaded(page)).toHaveCount(1);
  await expect(page.locator('.ocx-shell-session')).toBeVisible();
  expect(requested).toHaveLength(1);
});
