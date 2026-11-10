// Deferral contract: every component's `default` story, served as a fragment (frag/stories/<id>/), is
// inserted into a Deferred host and must come alive there: every Zag root that can start does start and
// reaches `live` (none errors), and the page ends with no duplicate id. This is the proof that any
// component can be deferred; a component script that scans only the first document fails here.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const STORIES = join(import.meta.dirname, '../../examples/starlight/src/stories');
const HOST = '/docs/stories/deferred/default/';
const HOST_FRAGMENT = '**/frag/shell-session/';
const ids = readdirSync(STORIES, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((slug) => readdirSync(join(STORIES, slug)).includes('default.mdx'))
  // The host itself, and the page chrome: SiteHeader mounts from the every-page chrome script (mountChrome), never from a fragment.
  .filter((slug) => slug !== 'deferred' && slug !== 'shell')
  .sort();

test('there are default stories to exercise', () => {
  expect(ids.length).toBeGreaterThan(40);
});

for (const slug of ids)
  test(`${slug}/default comes alive inside a Deferred`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(HOST_FRAGMENT, async (route) => {
      const real = await route.fetch({ url: new URL(`/docs/frag/stories/${slug}/default/`, page.url()).href });
      await route.fulfill({ response: real });
    });
    await page.goto(HOST);
    await expect(page.locator('[data-ocx-deferred]')).toHaveAttribute('data-state', 'loaded', { timeout: 15_000 });
    const duplicates = await page.evaluate(() => {
      const seen = new Set<string>();
      return [...document.querySelectorAll('[id]')].flatMap((el) =>
        seen.has(el.id) ? [el.id] : (seen.add(el.id), []),
      );
    });
    // Insert the same fragment into a second box: its scripts are on the page already, so only the
    // `ocx:inserted` mount can bring the new roots to life (a script that scanned once would not).
    await page.evaluate(() => {
      const host = document.querySelector('[data-ocx-deferred]')!;
      const clone = host.cloneNode(true) as HTMLElement;
      clone.removeAttribute('data-loaded');
      clone.dataset['state'] = 'idle';
      clone.querySelector('[data-deferred-content]')!.replaceChildren();
      host.after(clone);
      clone.dispatchEvent(new CustomEvent('ocx:inserted', { bubbles: true }));
    });
    await expect(page.locator('[data-ocx-deferred][data-loaded]')).toHaveCount(2, { timeout: 15_000 });
    const content = page.locator('[data-deferred-content]');
    // Start every root that waits for input: a pointerenter wakes an interaction root.
    // A component's module may still be loading when the fragment lands, so nudge until each root has started (a nudge before its script mounted reaches no listener).
    await page.waitForFunction(
      () => {
        const roots = [...document.querySelectorAll<HTMLElement>('[data-deferred-content] [data-zag-root]')].filter(
          (r) => r.dataset['zagTrigger'] !== 'manual',
        );
        for (const root of roots)
          if (root.dataset['zagState'] === 'idle') {
            root.scrollIntoView({ block: 'center' });
            root.dispatchEvent(new Event('pointerenter'));
          }
        return roots.every((r) => r.dataset['zagState'] === 'live' || r.dataset['zagState'] === 'error');
      },
      undefined,
      { timeout: 10_000 },
    );
    const states = await content
      .locator('[data-zag-root]:not([data-zag-trigger="manual"])')
      .evaluateAll((roots) => roots.map((r) => (r as HTMLElement).dataset['zagState'] ?? 'none'));
    expect(
      states.filter((s) => s !== 'live'),
      'roots that did not reach live',
    ).toEqual([]);
    expect(duplicates).toEqual([]);
    expect(errors).toEqual([]);
  });
