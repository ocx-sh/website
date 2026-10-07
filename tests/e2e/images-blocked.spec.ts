// AGENTS.md › assets never flicker: every image has a reserved box, so a page
// lays out identically whether its images load or not.
import { expect, test, type Page } from '@playwright/test';

// Not dependency-explorer: no images, and its rows render after a fetch.
const PAGES = [
  '/docs/',
  '/docs/probe/long/',
  '/docs/components/code/',
  '/docs/shell/',
  '/docs/shell/neutral/',
  // Components show their demos as story pages (C-125); the doc page only frames them.
  '/docs/stories/feature-section/default/',
  '/docs/stories/platform-icons/default/',
  '/docs/stories/terminal/default/',
  '/docs/stories/terminal/open/',
  '/docs/stories/tooltip/default/',
  '/docs/stories/tree/default/',
];

/** Tag and rounded box of every rendered element under <body>, in document order. The
 * mobile TOC's inside is skipped: its current-heading label follows scroll timing. */
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

for (const path of PAGES) {
  test(`layout is the same with images blocked (${path})`, async ({ page, context }) => {
    const loaded = await layout(page, path);
    let blocked = 0;
    await context.route('**/*', (r) => {
      if (r.request().resourceType() !== 'image') return r.continue();
      blocked++;
      return r.abort();
    });
    expect(await layout(page, path)).toEqual(loaded);
    // Non-vacuous: the showcase image really was refused, not served from cache.
    if (path.includes('feature-section')) expect(blocked).toBeGreaterThan(0);
  });
}
