// Every Deferred in both built sites: the skeleton's box and the loaded content's box agree within 1 px
// at phone, tablet and desktop widths, and loading shifts nothing. A Deferred whose skeleton is guessed
// rather than built from the content fails here, on the page that has it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from '@playwright/test';

const ROOT = join(import.meta.dirname, '../..');
const SITE_URL = `http://localhost:${process.env['E2E_SITE_PORT'] ?? '4323'}`;
const WIDTHS = [375, 768, 1440];
/** The one story that exists to fail. */
const BROKEN = '/docs/stories/deferred/error/';

const pagesWithDeferred = (dist: string, prefix: string): string[] =>
  existsSync(dist)
    ? readdirSync(dist, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.html') && !/^(frag|_shell)[\\/]/.test(f))
        .filter((f) => /data-trigger="(?:idle|input)"/.test(readFileSync(join(dist, f), 'utf8')))
        .map(
          (f) =>
            `${prefix}${relative('', f)
              .split('\\')
              .join('/')
              .replace(/index\.html$/, '')}`,
        )
        .filter((p) => p !== BROKEN)
    : [];

const SITES = [
  { name: 'example', base: undefined, pages: pagesWithDeferred(join(ROOT, 'examples/starlight/dist'), '/docs/') },
  { name: 'root site', base: SITE_URL, pages: pagesWithDeferred(join(ROOT, 'site/dist'), '/') },
];

test('the example site has Deferred pages to measure', () => {
  expect(SITES[0]?.pages.length).toBeGreaterThan(0);
});

for (const { name, base, pages } of SITES)
  for (const path of pages)
    for (const width of WIDTHS)
      test(`${name} ${path} at ${width}px: skeleton box equals loaded box, no layout shift`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(() => {
          const w = window as unknown as { __shifts: { value: number; startTime: number }[] };
          w.__shifts = [];
          new PerformanceObserver((list) => {
            w.__shifts.push(...(list.getEntries() as unknown as { value: number; startTime: number }[]));
          }).observe({ type: 'layout-shift', buffered: true });
        });
        // Hold the fragment back so the skeleton is measured alone, then let the content land.
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        await page.route('**/frag/**', async (route) => {
          await gate;
          await route.continue();
        });
        await page.goto(base ? new URL(path, base).href : path);
        // A `panel` box in an inactive tab loads on selection (components-deferred.spec.ts), not on its own.
        const boxes = page.locator('[data-ocx-deferred]:not([data-trigger="panel"])');
        const count = await boxes.count();
        expect(count).toBeGreaterThan(0);
        const before = await boxes.evaluateAll((els) =>
          els.map((el) => el.querySelector('[data-swap-skeleton]')!.getBoundingClientRect().height),
        );
        // Only the swap is under test: a shift before it (the font swapping in on the first paint) is the page's.
        const from = await page.evaluate(() => performance.now());
        release();
        // An `input` box waits for the visitor: the first key press is that input.
        await page.keyboard.press('Shift');
        await expect(boxes.and(page.locator('[data-loaded]'))).toHaveCount(count, { timeout: 15_000 });
        // A grid cell stretches both children to the larger one, so the content's own size is its children's extent.
        const after = await boxes.evaluateAll((els) =>
          els.map((el) => {
            // A script or link left in the cell has no box: it would pull the extent down to the page's origin.
            const kids = [...el.querySelector('[data-deferred-content]')!.children]
              .filter((c) => getComputedStyle(c).display !== 'none')
              .map((c) => c.getBoundingClientRect());
            return {
              src: (el as HTMLElement).dataset['src'],
              box: el.getBoundingClientRect().height,
              content: Math.max(...kids.map((k) => k.bottom)) - Math.min(...kids.map((k) => k.top)),
            };
          }),
        );
        after.forEach(({ src, box, content }, i) => {
          expect(
            Math.abs(content - before[i]!),
            `${src}: content ${content} vs skeleton ${before[i]}`,
          ).toBeLessThanOrEqual(1);
          expect(Math.abs(box - before[i]!), `${src}: box ${box} vs skeleton ${before[i]}`).toBeLessThanOrEqual(1);
        });
        const shifts = await page.evaluate(
          (t) =>
            (window as unknown as { __shifts: { value: number; startTime: number }[] }).__shifts.filter(
              (e) => e.startTime >= t,
            ),
          from,
        );
        expect(shifts).toEqual([]);
      });
