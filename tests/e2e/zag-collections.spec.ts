// Z8 collections on their story pages (C-125): C-200 TreeView (tree-view.zag), C-201 Toc (toc.zag,
// the only `visible` trigger), C-202 Pagination (pagination.zag), and C-130 (c) first paint,
// (d) keyboard, (e) axe, (g) events in the log, (h) no leak.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoLeak } from './helpers/leak.ts';
import { repaint } from './helpers/repaint.ts';
import { settle } from './helpers/settle.ts';
import { activate, MANUAL_ROOT, ZAG_ROOT } from './helpers/zag.ts';

// The `default` story of each, and the `states` stories the specs below reach for (naming contract).
const PAGE = {
  tree: '/docs/stories/tree-view/default/',
  toc: '/docs/stories/toc/default/',
  pagination: '/docs/stories/pagination/default/',
};
const STATES = {
  tree: '/docs/stories/tree-view/states/',
  toc: '/docs/stories/toc/states/',
  pagination: '/docs/stories/pagination/states/',
};
const CHUNK = { tree: /tree-view\.zag/, toc: /toc\.zag/, pagination: /pagination\.zag/ };

// CDP (leaks) is chromium-only, and the keyboard paths are desktop; one desktop pass is the gate.
test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

const live = (root: Locator) => expect(root).toHaveAttribute('data-zag-state', 'live');
const log = (page: Page) => page.locator('[data-showcase-log="#story"] ol');
/** Event logs keep up to 50 entries by design; a leak cycle must not count them. */
const dropLogs = (page: Page) =>
  page.locator('[data-showcase-log]').evaluateAll((els) => els.forEach((e) => e.remove()));

/** Screenshot of `pick(page)` with the component's chunk blocked, and again after it went live. */
async function firstPaint(page: Page, path: string, chunk: RegExp, pick: (p: Page) => Locator) {
  await page.route(chunk, (r) => r.abort());
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  const before = await pick(page).screenshot({ animations: 'disabled' });
  await page.unroute(chunk);
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  const root = pick(page);
  await activate(root);
  await live(root);
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // A full paint: a live TreeView clips its open branches (the disclosure motion), and Chromium
  // anti-aliases the tree's corner a shade differently when it repaints only the removed focus ring.
  await repaint(page);
  const after = await root.screenshot({ animations: 'disabled' });
  expect(Buffer.compare(before, after), `${path}: first paint differs from the live default state`).toBe(0);
}

test.describe('C-200 TreeView', () => {
  const demo = (page: Page) => page.locator('#story [data-zag-root="tree-view"]');
  const control = (page: Page, value: string) =>
    demo(page).locator(`[data-value="${value}"] > [data-part="branch-control"]`);
  const node = (page: Page, value: string) => demo(page).locator(`[role="treeitem"][data-value="${value}"]`);

  test('C-130c first paint is final: SSR with the chunk blocked equals the live default state', async ({ page }) => {
    await firstPaint(page, PAGE.tree, CHUNK.tree, demo);
  });

  test('C-130d APG tree keys: arrows, Right/Left expand and collapse, Home/End, Enter selects, typeahead', async ({
    page,
  }) => {
    await page.goto(PAGE.tree);
    await control(page, 'packages').focus();
    // The key pressed while the chunk loads is replayed once the machine is live (C-104).
    await page.keyboard.press('ArrowDown');
    await live(demo(page));
    await expect(control(page, 'cmake')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(node(page, 'cmake')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(node(page, 'cmake-3.31')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(control(page, 'cmake')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(node(page, 'cmake')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('End');
    await expect(node(page, 'config')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(node(page, 'config')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(control(page, 'packages')).toBeFocused();
    await page.keyboard.press('i');
    await expect(control(page, 'index')).toBeFocused();
    // One tab stop: Tab leaves the tree.
    await page.keyboard.press('Tab');
    await expect(demo(page).locator(':focus')).toHaveCount(0);
  });

  test('C-130g a click logs ocx:tree-view:select and :expand', async ({ page }) => {
    await page.goto(PAGE.tree);
    await control(page, 'index').click();
    await expect(node(page, 'index')).toHaveAttribute('aria-expanded', 'true');
    await expect(log(page)).toContainText('ocx:tree-view:select {"value":["index"]}');
    await expect(log(page)).toContainText('ocx:tree-view:expand {"value":["packages","index"]}');
  });

  test('C-130h tree-view.zag: expand/collapse cycles leak nothing', async ({ page }) => {
    await page.goto(PAGE.tree);
    await dropLogs(page);
    const branch = node(page, 'index');
    await expectNoLeak(page, async () => {
      await control(page, 'index').click();
      await expect(branch).toHaveAttribute('aria-expanded', 'true');
      await control(page, 'index').click();
      await expect(branch).toHaveAttribute('aria-expanded', 'false');
    });
  });
});

test.describe('C-202 Pagination', () => {
  const demo = (page: Page) => page.locator('#story [data-zag-root="pagination"]');
  const current = (root: Locator) => root.locator('[aria-current="page"]');

  test('C-130c first paint is final: SSR with the chunk blocked equals the live default state', async ({ page }) => {
    await firstPaint(page, PAGE.pagination, CHUNK.pagination, demo);
  });

  test('C-130d keyboard: Tab reaches the controls, Enter and Space activate, a disabled prev is skipped', async ({
    page,
  }) => {
    await page.goto(PAGE.pagination);
    const next = demo(page).locator('[data-part="next-trigger"]');
    await next.focus();
    // Pressed before the machine is live: replayed after start (C-104).
    await page.keyboard.press('Enter');
    await live(demo(page));
    await expect(current(demo(page))).toHaveText('6');
    await page.keyboard.press('Space');
    await expect(current(demo(page))).toHaveText('7');
    await expect(log(page)).toContainText('ocx:pagination:change {"page":7}');

    await page.goto(STATES.pagination);
    const first = page.locator('[data-zag-root="pagination"]').first();
    await expect(first.locator('[data-part="prev-trigger"]')).toBeDisabled();
    await first.locator('[data-part="item"]').first().focus();
    await page.keyboard.press('Shift+Tab');
    await expect(first.locator('[data-part="prev-trigger"]')).not.toBeFocused();
  });

  test('C-202 links mode: Enter follows the templated href and the window follows', async ({ page }) => {
    await page.goto(STATES.pagination);
    const links = page.locator('[data-zag-root="pagination"][data-ocx-href]').first();
    await links.locator('[data-index="4"]').focus();
    await live(links);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#page-4$/);
    await expect(current(links)).toHaveText('4');
    await expect(links.locator('[data-part="prev-trigger"]')).toHaveAttribute('href', '#page-3');
  });

  test('C-202 links mode: an early click navigates once (no replay)', async ({ page }) => {
    // Hold the chunk so the click certainly lands before the machine is live.
    await page.route(CHUNK.pagination, async (r) => {
      await new Promise((f) => setTimeout(f, 500));
      await r.continue();
    });
    await page.goto(STATES.pagination);
    const links = page.locator('[data-zag-root="pagination"][data-ocx-href]').first();
    const link = links.locator('[data-index="4"]');
    await link.evaluate((a) => {
      (window as unknown as { clicks: number }).clicks = 0;
      a.addEventListener('click', () => (window as unknown as { clicks: number }).clicks++);
    });
    await link.click();
    await live(links);
    await expect(page).toHaveURL(/#page-4$/);
    expect(await page.evaluate(() => (window as unknown as { clicks: number }).clicks)).toBe(1);
  });

  test('C-130h pagination.zag: page changes that swap slots between page and ellipsis leak nothing', async ({
    page,
  }) => {
    await page.goto(STATES.pagination);
    const root = page.locator('[data-zag-root="pagination"]').first();
    await expectNoLeak(page, async () => {
      await root.locator('[data-index="5"]').click();
      await expect(root.locator('[data-part="ellipsis"]')).toHaveCount(2);
      await root.locator('[data-index="1"]').click();
      await expect(root.locator('[data-part="ellipsis"]')).toHaveCount(1);
    });
  });
});

test.describe('C-201 Toc', () => {
  const demo = (page: Page) => page.locator('#story [data-zag-root="toc"]');
  const entry = (root: Locator, id: string) => root.locator(`[data-part="link"][data-value="${id}"]`);
  const scrollTo = (page: Page, id: string) =>
    page.evaluate((i) => document.getElementById(i)?.scrollIntoView({ block: 'start' }), id);

  // The states story stacks its two cells below 600px of width; the second sits under a 200px view.
  test('C-113 visible trigger: idle off-screen with no input, live once scrolled into view', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 200 });
    await page.goto(STATES.toc);
    const below = page.locator('[data-zag-root="toc"]').last();
    await expect(below).toHaveAttribute('data-zag-trigger', 'visible');
    await page.waitForTimeout(2000);
    await expect(below).toHaveAttribute('data-zag-state', 'idle');
    await below.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await live(below);
  });

  test('C-201 scroll-spy: the heading in view marks its entry and fires ocx:toc:change', async ({ page }) => {
    // At 720px the story fits without scrolling; at 160px it scrolls, and 'props' sits above the final
    // screen, so the mid-page spy (not the end-of-page rule) marks it.
    await page.setViewportSize({ width: 1280, height: 160 });
    await page.goto(PAGE.toc);
    await page.evaluate(() => {
      const w = window as unknown as { changes: unknown[] };
      w.changes = [];
      document.addEventListener('ocx:toc:change', (e) => w.changes.push((e as CustomEvent).detail));
    });
    await demo(page).scrollIntoViewIfNeeded();
    await live(demo(page));
    await scrollTo(page, 'props');
    await expect(entry(demo(page), 'props')).toHaveAttribute('data-active', '');
    await expect(entry(demo(page), 'props')).toHaveAttribute('aria-current', 'location');
    await expect(entry(demo(page), 'overview')).not.toHaveAttribute('data-active');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { changes: { value: string[] }[] }).changes.at(-1)?.value))
      .toContain('props');
    // In-flow Toc: autoScroll is off, so marking an entry never scrolls the page back to it.
    await scrollTo(page, 'keyboard');
    const y = await page.evaluate(() => scrollY);
    await expect(entry(demo(page), 'keyboard')).toHaveAttribute('data-active', '');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => scrollY)).toBe(y);
  });

  // Exception (C-201): entries whose heading is in view gain data-active only once live; SSR
  // cannot know the scroll position. The default state checked here is "no heading in view".
  test('C-130c first paint is final: SSR with the chunk blocked equals the live default state', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 300 });
    await firstPaint(page, STATES.toc, CHUNK.toc, (p) => p.locator('[data-zag-root="toc"]').last());
  });

  test('C-130d keyboard: Tab reaches each entry, Enter jumps to its heading', async ({ page }) => {
    await page.goto(PAGE.toc);
    await entry(demo(page), 'props').focus();
    await page.keyboard.press('Tab');
    await expect(entry(demo(page), 'events')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#events$/);
  });

  test('C-130h toc.zag: scroll-spy cycles leak nothing', async ({ page }) => {
    // 400 x 200: the states story scrolls (it fits without scrolling at 720).
    await page.setViewportSize({ width: 400, height: 200 });
    await page.goto(STATES.toc);
    const nested = page.locator('[data-zag-root="toc"]').first();
    await nested.scrollIntoViewIfNeeded();
    await live(nested);
    await expectNoLeak(page, async () => {
      await scrollTo(page, 'keyboard');
      await expect(entry(nested, 'keyboard')).toHaveAttribute('data-active', '');
      await scrollTo(page, 'props');
      await expect(entry(nested, 'props')).toHaveAttribute('data-active', '');
    });
  });
});

const ALL = {
  ...PAGE,
  'tree states': STATES.tree,
  'toc states': STATES.toc,
  'pagination states': STATES.pagination,
};

test.describe('C-130e axe and images', () => {
  for (const theme of ['light', 'dark'])
    for (const [name, path] of Object.entries(ALL))
      test(`C-130e axe reports no violations on the ${name} page, SSR and live (${theme})`, async ({ page }) => {
        await page.goto(path);
        await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
        await settle(page); // axe must read final colours, not a theme crossfade
        const check = async (when: string) => {
          // Colours fade on the theme flip and on state changes (C-302): axe reads the end state.
          await settle(page);
          const { violations } = await new AxeBuilder({ page }).include('main').analyze();
          expect(
            violations.map((v) => `${when} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
          ).toEqual([]);
        };
        await check('ssr');
        for (const root of await page.locator(`${ZAG_ROOT}:not(${MANUAL_ROOT})`).all()) {
          await activate(root);
          await live(root);
        }
        // Interacted states: a branch opened and a node selected, a page moved.
        if (name === 'tree') await page.locator('#story [data-value="index"] > [data-part="branch-control"]').click();
        if (name === 'pagination') await page.locator('#story [data-part="next-trigger"]').click();
        await check('live');
      });

  test('C-130c no images on the collection pages, so blocking images changes nothing', async ({ page }) => {
    for (const path of Object.values(ALL)) {
      await page.goto(path);
      await expect(page.locator('main img, main picture')).toHaveCount(0);
    }
  });
});
