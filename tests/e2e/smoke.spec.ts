// Playwright specs against the built example (`astro preview`, base `/docs/`,
// see playwright.config.ts).
import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// The C-057 Lighthouse-audited example pages (must match .lighthouserc.cjs's
// AUDITED_URLS): splash, a long doc, the code-components page, the static
// 404 page.
const PAGES = ['/docs/', '/docs/probe/long/', '/docs/components/code/', '/docs/404.html'];

// The route a page's canonical names. The static 404 file is served as
// `/docs/404.html`, but its route (trailingSlash 'always') is `/docs/404/`;
// that is what Starlight emits and what C-017's "trailing-slash URLs" asks
// for, so the canonical must never name the `.html` file.
const route = (path: string) => path.replace(/404\.html$/, '404/');

// C-017: built pages carry a canonical `https://ocx.sh<path>` link and the
// path itself ends with a trailing slash (site config: trailingSlash 'always').
for (const path of PAGES) {
  test(`C-017 ${path} canonical link is https://ocx.sh<path> and the path has a trailing slash`, async ({ page }) => {
    await page.goto(path);
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
    await expect(canonical).toHaveAttribute('href', `https://ocx.sh${route(path)}`);

    // Every same-origin link the page renders is a trailing-slash URL (or a
    // file, e.g. /sitemap-index.xml). Fragments and queries are stripped.
    const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const bare = href.replace(/[?#].*$/, '');
      expect(bare, `internal link ${href} on ${path}`).toMatch(/(\/|\.[a-z0-9]+)$/);
    }
  });
}

// C-057: every Lighthouse-listed example page loads (200, no console errors)
// under the preview server.
for (const path of PAGES) {
  test(`C-057 ${path} loads`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
}

test('C-057 an unknown path 404s under astro preview, with Starlight 404 content', async ({ page }) => {
  const response = await page.goto('/docs/this-page-does-not-exist/');
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText(/not found/i);
  // Starlight's page frame, not a bare server error page.
  await expect(page.locator('header.header')).toBeVisible();
});

// C-120: the built component index links every page in the components directory (read from the
// source tree, so a new page without a card fails here).
test('C-120 the component index links every component page as a card', async ({ page }) => {
  const dir = new URL('../../examples/starlight/src/content/docs/components/', import.meta.url);
  const slugs = readdirSync(dir)
    .filter((f) => /\.mdx?$/.test(f) && !f.startsWith('index.'))
    .map((f) => f.replace(/\.mdx?$/, ''));
  expect(slugs.length).toBeGreaterThan(10);
  await page.goto('/docs/components/');
  for (const slug of slugs) {
    const card = page.locator(`main .showcase-index a[href="/docs/components/${slug}/"]`);
    await expect(card, slug).toHaveCount(1);
    await expect(card, slug).not.toBeEmpty();
  }
});

// C-120: the overview's filter field narrows the cards as you type and clear restores them.
test('C-120 the component index filters as you type', async ({ page }) => {
  await page.goto('/docs/components/');
  const cards = page.locator('main .showcase-index > li:visible');
  const status = page.locator('main [data-component-filter] [data-count]');
  const input = page.getByRole('searchbox', { name: 'Filter components' });
  const total = await cards.count();
  await expect(status).toHaveText(`${total} components`);
  await input.fill('dialog');
  await expect(page.locator('main .showcase-index a[href="/docs/components/dialog/"]')).toBeVisible();
  await expect(page.locator('main .showcase-index a[href="/docs/components/button/"]')).toBeHidden();
  await expect(status).toHaveText(`${await cards.count()} components`);
  await input.fill('zzz');
  await expect(cards).toHaveCount(0);
  await expect(status).toHaveText('No component matches');
  await page.locator('main [data-component-filter] .ocx-ui-search-field__clear').click();
  await expect(cards).toHaveCount(total);
  await expect(status).toHaveText(`${total} components`);
});
