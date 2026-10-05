// C-112 budget e2e and S-107: every gated page stays within its class budget
// (tests/budgets.mjs) before and after every Zag root is touched; a breach
// names page, metric, value and budget. Also proves the C-114 leak helper
// red and green on probes built inside this spec (never shipped, never a
// committed page).
import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { budgetOf, classOf, examplePages, HTML_GZ_MAX, PAGEFIND_GZ_MAX, sitePages } from '../budgets.mjs';
import { expectNoLeak } from './helpers/leak.ts';
import { activate, MANUAL_ROOT, startManual, tagRoots, ZAG_ROOT } from './helpers/zag.ts';

// CDP (heap, GC) is chromium-only; one desktop pass is the gate.
test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

/**
 * Pagefind's UI (`@pagefind/default-ui`), which Vite bundles as `/_astro/ui-core.<hash>.js`: counted
 * as Pagefind, not chrome. The test asserts exactly one such chunk, holding `PagefindUI`, once search
 * ran, so a renamed chunk fails instead of moving back into `postJsGz` unnoticed.
 */
const PAGEFIND_UI = /\/_astro\/ui-core\.[\w-]+\.js$/;
const isPagefind = (url: string) => {
  const path = new URL(url).pathname;
  return path.includes('/pagefind/') || PAGEFIND_UI.test(path);
};

/**
 * Gzip bytes of every script body the page fetched so far plus its inline
 * scripts, split into Pagefind's (`/pagefind/` URLs and its UI chunk) and everything else.
 * A body that cannot be read throws rather than counting as 0 bytes.
 */
function scriptMeter(page: Page) {
  const sizes = new Map<string, Promise<number>>();
  const uiChunks: boolean[] = []; // one entry per Pagefind UI chunk: does it hold `PagefindUI`?
  page.on('response', (r) => {
    if (r.request().resourceType() !== 'script' || (r.status() >= 300 && r.status() < 400)) return;
    const size = r.body().then(
      (b) => {
        if (PAGEFIND_UI.test(new URL(r.url()).pathname)) uiChunks.push(b.includes('PagefindUI'));
        return gzipSync(b).length;
      },
      (err: unknown) => Promise.reject(new Error(`script body unreadable: ${r.url()}`, { cause: err })),
    );
    size.catch(() => {}); // surfaced when the meter is read; keeps an early failure from going unhandled
    sizes.set(r.url(), size);
  });
  return async () => {
    const inline = await page
      .locator('script:not([src])')
      .evaluateAll((ss) =>
        ss
          .filter((s) => !s.getAttribute('type') || /module|javascript/.test(s.getAttribute('type') ?? ''))
          .map((s) => s.textContent ?? ''),
      );
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const external = await Promise.all([...sizes].map(async ([url, size]) => ({ url, gz: await size })));
    const pagefind = sum(external.filter((s) => isPagefind(s.url)).map((s) => s.gz));
    const all = sum(external.map((s) => s.gz)) + sum(inline.map((t) => gzipSync(t).length));
    return { own: all - pagefind, pagefind, uiChunks: [...uiChunks] };
  };
}

const sumOf = (s: { own: number; pagefind: number }) => s.own + s.pagefind;

// Example pages run in the `chromium` project (the example preview, base `/docs/`), the root site's
// pages in the `site` project (the combined stage, `site/dist` at `/`): each page in exactly one.
const gated = [
  ...examplePages().map((path) => ({ path, project: 'chromium' })),
  ...sitePages().map((path) => ({ path, project: 'site' })),
];

for (const { path, project } of gated) {
  const cls = classOf(path);
  const budget = budgetOf(path);

  test(`C-112 ${path} stays within the ${cls} budget`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== project, `${path} is gated in the ${project} project`);
    const within = (metric: string, value: number, cap: number, unit: string) => {
      test.info().annotations.push({ type: 'budget', description: `${path} ${metric}=${value}` });
      expect.soft(value, `${path}: ${metric} = ${value} ${unit}, budget ${cap} ${unit}`).toBeLessThanOrEqual(cap);
    };
    // The example merges other sections' Pagefind bundles (absent locally, as in the search-dialog
    // spec): serve them from this section's own bundle so a query can complete. The root site merges
    // none today (legacy sections are filtered out); a section merged later is served the same way.
    const own = project === 'site' ? '/pagefind/' : '/docs/pagefind/';
    await page.route(
      (u) => u.pathname.includes('/pagefind/') && !u.pathname.startsWith(project === 'site' ? own : '/docs/'),
      async (r) => {
        const u = new URL(r.request().url());
        u.pathname = `${own}${u.pathname.split('/pagefind/')[1] ?? ''}`;
        await r.fulfill({ response: await r.fetch({ url: u.href }) });
      },
    );
    const scripts = scriptMeter(page);
    const response = await page.goto(path);
    if (!response) throw new Error(`${path}: no document response`);
    within('htmlGz', gzipSync(await response.body()).length, HTML_GZ_MAX, 'B');
    await page.waitForLoadState('networkidle');
    within('preJsGz', sumOf(await scripts()), budget.preJsGz, 'B');

    // Every widget a reader can touch: interaction and visible roots by hover and
    // focus, manual roots by their outside start signal.
    for (const root of await tagRoots(page, `${ZAG_ROOT}:not(${MANUAL_ROOT})`, 'self')) {
      await activate(root);
      await expect(root).toHaveAttribute('data-zag-state', 'live');
    }
    for (const root of await tagRoots(page, MANUAL_ROOT, 'manual')) {
      if (await startManual(page, root)) await expect(root).toHaveAttribute('data-zag-state', 'live');
      else test.info().annotations.push({ type: 'zag-roots', description: `${path}: manual root not rendered here` });
    }
    // A real search: Pagefind's scripts (UI chunk, pagefind.js, worker) count toward pagefindGz; the
    // index, fragments and wasm it fetches are not scripts and count toward no JS metric. Story pages
    // (C-125) have no chrome, so no search.
    const chrome = cls !== 'story';
    if (chrome) {
      await page.keyboard.press('ControlOrMeta+k');
      await page.locator('#starlight__search .pagefind-ui__search-input').fill('install');
      await expect(page.locator('#starlight__search .pagefind-ui__result').first()).toBeVisible({ timeout: 20_000 });
      await page.waitForLoadState('networkidle');
      await page.keyboard.press('Escape');
    }
    const post = await scripts();
    expect(post.uiChunks, `${path}: exactly one Pagefind UI chunk (ui-core.*.js) holding PagefindUI`).toEqual(
      chrome ? [true] : [],
    );
    within('postJsGz', post.own, budget.postJsGz, 'B');
    within('pagefindGz', post.pagefind, PAGEFIND_GZ_MAX, 'B');

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const heap = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? Number.NaN;
    await cdp.detach();
    within('heapMB', Math.round((heap / 2 ** 20) * 100) / 100, budget.heapMB, 'MiB');
    // Body elements, as Lighthouse's dom-size counts them, so one budget means the same in both gates.
    within(
      'domElements',
      await page.evaluate(() => document.body.querySelectorAll('*').length),
      budget.domElements,
      'elements',
    );
  });
}

// C-114: the helper goes red on each metric it guards and green on a clean cycle.
test.describe('C-114 leak helper probes', () => {
  const probe = async (page: Page, leak: string) => {
    await page.setContent('<!doctype html><title>leak probe</title><main></main>');
    await page.evaluate(`window.keep = []; window.cycle = () => {
      const el = document.createElement('button');
      el.addEventListener('click', () => {});
      document.querySelector('main').append(el);
      el.click();
      el.remove();
      ${leak}
    };`);
    return async () => {
      await page.evaluate('window.cycle()');
    };
  };

  test('green: a cycle that cleans up passes', async ({ page }) => {
    await expectNoLeak(page, await probe(page, ''));
  });

  test('red: a window listener per cycle fails on JSEventListeners', async ({ page }) => {
    await expect(expectNoLeak(page, await probe(page, "addEventListener('resize', () => {});"))).rejects.toThrow(
      /JSEventListeners/,
    );
  });

  test('red: retained detached nodes fail on Nodes', async ({ page }) => {
    const leak = "for (let i = 0; i < 5; i++) keep.push(document.createElement('div'));";
    await expect(expectNoLeak(page, await probe(page, leak))).rejects.toThrow(/Nodes/);
  });

  test('red: retained heap fails on JSHeapUsedSize', async ({ page }) => {
    const leak = 'keep.push(new Array(50000).fill(0).map(Math.random));';
    await expect(expectNoLeak(page, await probe(page, leak))).rejects.toThrow(/JSHeapUsedSize/);
  });
});
