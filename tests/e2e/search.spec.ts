// C-308 merged search over the combined stage (playwright.config.ts `site` project): the root
// site's search merges the section bundles, and still answers when they are missing.
import { expect, test, type Page } from '@playwright/test';
import nav from '@ocx-sh/theme/nav.json' with { type: 'json' };
import { mergeTargets } from '@ocx-sh/theme/nav';
import legacy from '../../infra/bunny/legacy.json' with { type: 'json' };

const QUERY = 'install';
const search = (page: Page) => page.locator('#starlight__search');
const links = (page: Page) => search(page).locator('.pagefind-ui__result-link');
const hrefs = (page: Page) => links(page).evaluateAll((a) => a.map((l) => l.getAttribute('href') ?? ''));
// While legacy.json lists /docs/, the site build drops its bundle (site/legacy-search.mjs), so
// there is nothing to merge: (a) switches on when the docs migration deletes that entry.
const docsMerged = !legacy.entries.some((e) => e.paths.includes('/docs/'));
const inDocs = (href: string) => href.startsWith('/docs/');
// Merge targets still on a legacy origin: the build drops their bundles (site/legacy-search.mjs).
const legacyPaths = legacy.entries.flatMap((e) => e.paths.map((p) => p.replace(/\/?$/, '/')));
const legacySections = mergeTargets(nav, '/').filter((t) => legacyPaths.some((p) => t.path.startsWith(p)));

/** Opens the root page's search dialog and types the query. */
async function query(page: Page) {
  await page.goto('/');
  await page.locator('site-search [data-open-modal]').click();
  await expect(page.locator('site-search')).toHaveAttribute('data-zag-state', 'live');
  await search(page).locator('.pagefind-ui__search-input').fill(QUERY);
  await expect(links(page).first()).toBeVisible();
}

test('C-308 (a): one query returns hits from the root and from /docs/, the docs ones labelled', async ({ page }) => {
  test.skip(!docsMerged, '/docs/ is still a legacy section: the root search does not merge it');
  await query(page);
  // Results page by 5 and merge by rank: load more until both sections show.
  await expect
    .poll(async () => {
      const all = await hrefs(page);
      const more = search(page).locator('.pagefind-ui__button');
      if (!(all.some(inDocs) && all.some((h) => !inDocs(h))) && (await more.count())) await more.click();
      return [all.some(inDocs), all.some((h) => !inDocs(h))];
    })
    .toEqual([true, true]);

  // A merged section's label is its `section` filter; the root's own pages carry none.
  const docs = search(page).locator('input[name="section"][value="docs"]');
  await expect(docs).toHaveCount(1);
  await docs.check({ force: true });
  await expect.poll(async () => (await hrefs(page)).length).toBeGreaterThan(0);
  expect((await hrefs(page)).every(inDocs)).toBe(true);
});

// Guards the filter (site/legacy-search.mjs), not the runtime fallback: the build already drops every
// legacy bundle, so the mocks below match requests the page never makes. Each section legacy.json
// lists is mocked as unreachable (404 for /docs/, a 302 elsewhere); the stage serves a stub bundle
// for every other merge target (scripts/lhci-stage.mjs), so search works only if the filter holds.
test('C-308 (b) guards the filter: legacy bundles are never requested, root hits and no errors remain', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/docs/pagefind/**', (r) => r.fulfill({ status: 404, body: 'not found' }));
  for (const { path } of legacySections)
    await page.route(`**${path}pagefind/**`, (r) => r.fulfill({ status: 302, headers: { location: '/gone/' } }));
  await query(page);
  const found = await hrefs(page);
  expect(found.length).toBeGreaterThan(0);
  expect(found.some(inDocs)).toBe(false);
  // The filter's own check: no legacy section's bundle is requested (were one merged, its mock would kill search).
  for (const { path } of legacySections) expect(requested.filter((p) => p.startsWith(`${path}pagefind/`))).toEqual([]);
  expect(errors).toEqual([]);
});
