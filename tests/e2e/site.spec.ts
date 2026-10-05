// The root site over the combined stage (playwright.config.ts `site` project): every HTML page of
// `site/dist` has its canonical, the header, a quiet console and the same layout with images blocked.
import { expect, test, type Page } from '@playwright/test';
import { sitePages } from '../budgets.mjs';

const pages = sitePages();

// The static 404 file is served as `/404.html`; its route, and so its canonical, is `/404/`.
const route = (path: string) => path.replace(/404\.html$/, '404/');

/** Tag and rounded box of every rendered element under <body>, in document order. */
async function layout(page: Page, path: string) {
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() =>
    [...document.querySelectorAll('body *:not(mobile-starlight-toc *)')].flatMap((e) => {
      const r = e.getBoundingClientRect();
      // Unrendered nodes (closed search dialog, filled in lazily) carry no layout.
      return r.width || r.height ? [`${e.tagName} ${[r.x, r.y, r.width, r.height].map(Math.round).join(',')}`] : [];
    }),
  );
}

test.use({ reducedMotion: 'reduce' });

test('the site has pages to check', () => {
  expect(pages).toEqual(expect.arrayContaining(['/', '/apps/', '/install/', '/integrations/']));
});

for (const path of pages) {
  test(`${path} has its canonical, the header and no console error`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await page.waitForLoadState('networkidle');

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
    await expect(canonical).toHaveAttribute('href', `https://ocx.sh${route(path)}`);
    expect(route(path)).toMatch(/\/$/);
    await expect(page.locator('.ocx-header')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test(`layout is the same with images blocked (${path})`, async ({ page, context }) => {
    const loaded = await layout(page, path);
    await context.route('**/*', (r) => (r.request().resourceType() === 'image' ? r.abort() : r.continue()));
    expect(await layout(page, path)).toEqual(loaded);
  });
}
