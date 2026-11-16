// A collapsed sidebar group without the current page ships empty and loads its links on the first touch of
// its trigger (frag/sidebar/<key>/, chrome.mjs). The current page's group stays inline. Desktop only.
import { expect, test, type Page } from '@playwright/test';

test.skip(({ isMobile }) => isMobile, 'desktop sidebar (≥ 50em) only');

const PAGE = '/docs/components/button/';
const PANE = '#starlight__sidebar';
const FORMS = `${PANE} [data-zag-root="collapsible"]:has(> [data-part="trigger"]:text-is("Forms"))`;
const current = (page: Page) => page.locator(`${PANE} a[aria-current="page"][href="${PAGE}"]`);

/** Layout shift of the page so far, and the current link's box. */
const probe = (page: Page, href = PAGE) =>
  page.evaluate((href) => {
    const shifts = performance.getEntriesByType('layout-shift') as unknown as { value: number }[];
    const a = document
      .querySelector(`#starlight__sidebar a[aria-current="page"][href="${href}"]`)!
      .getBoundingClientRect();
    return { cls: shifts.reduce((n, s) => n + s.value, 0), top: a.top, left: a.left };
  }, href);

test('stubs ship empty, nothing is fetched before a touch, and the first touch fills the group', async ({ page }) => {
  const frags: string[] = [];
  page.on('request', (r) => r.url().includes('/frag/sidebar/') && frags.push(r.url()));
  await page.goto(PAGE);
  await page.waitForLoadState('networkidle');
  await expect(page.locator(`${FORMS} > [data-defer]`)).toHaveCount(1);
  await expect(page.locator(`${FORMS} > [data-defer] a`)).toHaveCount(0);
  expect(frags, 'no fragment before interaction').toEqual([]);

  await page.locator(`${FORMS} > [data-part="trigger"]`).hover();
  await expect(page.locator(`${FORMS} a`).first()).toBeAttached();
  expect(frags).toHaveLength(1);
  await page.locator(`${FORMS} > [data-part="trigger"]`).click();
  await expect(page.getByRole('link', { name: 'Combobox', exact: true })).toBeVisible();
  await expect(page.locator(`${FORMS} > [data-defer]`)).toHaveCount(0);
});

test('zero shift: the current page keeps its place through load, a touch and an expansion', async ({ page }) => {
  await page.goto(PAGE);
  await page.waitForLoadState('networkidle');
  const before = await probe(page);
  expect(before.cls, 'layout shift at load').toBe(0);
  await page.locator(`${FORMS} > [data-part="trigger"]`).click();
  await expect(page.getByRole('link', { name: 'Combobox', exact: true })).toBeVisible();
  const after = await probe(page);
  expect(after.cls).toBe(0);
  expect(after.left).toBe(before.left);
  expect(after.top, 'the group above the current one did not move; the Forms group is below it').toBe(before.top);
  await expect(current(page)).toHaveAttribute('href', PAGE);
});

test('a deferred group the visitor opened reopens on the next page, loaded into reserved space', async ({ page }) => {
  await page.goto(PAGE);
  await page.locator(`${FORMS} > [data-part="trigger"]`).click();
  await expect(page.getByRole('link', { name: 'Combobox', exact: true })).toBeVisible();
  // No saved links (a first visit to the group in this tab) and slow fragments: the group is open and empty for a
  // moment, which is when a shift would show.
  await page.evaluate(() =>
    Object.keys(sessionStorage).forEach((k) => k.startsWith('ocx-frag:') && sessionStorage.removeItem(k)),
  );
  await page.route('**/frag/sidebar/**', async (route) => {
    await new Promise((r) => setTimeout(r, 600));
    await route.continue();
  });
  await page.goto('/docs/components/link/');
  const next = page.locator(
    `${PANE} [data-zag-root="collapsible"]:has(> [data-part="trigger"]:text-is("Overlays")) > [data-part="trigger"]`,
  );
  await expect(page.locator(`${FORMS} > [data-part="trigger"]`)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(`${FORMS} > [data-defer]`)).toHaveCount(1);
  const before = (await next.boundingBox())!.y;
  await expect(page.getByRole('link', { name: 'Combobox', exact: true })).toBeVisible();
  expect(
    Math.abs((await next.boundingBox())!.y - before),
    'the group below Forms moved when its links arrived',
  ).toBeLessThan(1);
  expect((await probe(page, '/docs/components/link/')).cls).toBeLessThan(0.001);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('every link stays reachable through the All pages link', async ({ page }) => {
    await page.goto(PAGE);
    const all = page.getByRole('link', { name: 'All pages' });
    await expect(all).toBeVisible();
    await all.click();
    await expect(page).toHaveURL(/\/frag\/sidebar\/_all\/$/);
    // A link of a stubbed group, visible (the list is open in the fragment).
    await expect(page.getByRole('link', { name: 'Combobox', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Button', exact: true })).toBeVisible();
  });
});

test('another open group keeps its links through a page change: no frame shows it open and empty', async ({ page }) => {
  const group = (name: string) =>
    `${PANE} [data-zag-root="collapsible"]:has(> [data-part="trigger"]:text-is("${name}"))`;
  await page.goto(PAGE);
  await page.waitForLoadState('networkidle');
  for (const name of ['Forms', 'Overlays']) await page.locator(`${group(name)} > [data-part="trigger"]`).click();
  const link = page.locator(`${group('Overlays')} a`).first();
  await expect(link).toBeVisible();
  const href = (await link.getAttribute('href'))!;
  // Slow fragments and a frame-by-frame record of the Forms group on the next page.
  await page.route('**/frag/sidebar/**', async (route) => {
    await new Promise((r) => setTimeout(r, 600));
    await route.continue();
  });
  await page.addInitScript((name) => {
    const w = window as unknown as { __frames: { open: boolean; links: number; h: number }[] };
    w.__frames = [];
    const tick = () => {
      const g = [...document.querySelectorAll('#starlight__sidebar [data-zag-root="collapsible"]')].find(
        (el) => el.firstElementChild?.textContent?.trim() === name,
      );
      if (g) {
        const list = g.querySelector(':scope > [data-part="content"]') as HTMLElement;
        w.__frames.push({
          open: !list.hidden,
          links: list.querySelectorAll('a').length,
          h: g.getBoundingClientRect().height,
        });
      }
      requestAnimationFrame(tick);
    };
    tick();
  }, 'Forms');
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.locator(`${group('Forms')} a`).first()).toBeAttached();
  await page.waitForTimeout(300);
  const frames = await page.evaluate(
    () => (window as unknown as { __frames: { open: boolean; links: number; h: number }[] }).__frames,
  );
  expect(frames.length).toBeGreaterThan(0);
  expect(
    frames.filter((f) => f.open && f.links === 0),
    'frames with Forms open and empty',
  ).toEqual([]);
  expect(new Set(frames.map((f) => Math.round(f.h))).size, 'Forms changed height between frames').toBe(1);
});
