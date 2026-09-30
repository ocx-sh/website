// C-302 motion contract (D-R7) for the collection and disclosure rows of the motion audit (R3):
// one test per row, on the built story pages (C-125). Each test checks three things:
//  - a fresh load runs no animation in the component (first paint is final);
//  - the interaction starts an animation on the audit row's property;
//  - under reduced motion the same interaction reaches its end state with no animation running.
import { expect, test, type Locator, type Page } from '@playwright/test';

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

const story = (path: string) => `/docs/stories/${path}/`;

/**
 * Motion probe (plan "Motion probe"): running animations whose property names `prop`, on `root` and
 * its subtree, or on `root` alone with `self`.
 */
const probe = (root: Locator, prop: string, self = false) =>
  root.evaluate(
    (el, [p, only]) => {
      const named = (a: Animation) =>
        a instanceof CSSTransition
          ? a.transitionProperty
          : ((a.effect as KeyframeEffect | null)?.getKeyframes().flatMap(Object.keys).join(' ') ?? '');
      const inside = (a: Animation) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        return target === el || (!only && target instanceof Element && el.contains(target));
      };
      return document.getAnimations().filter((a) => inside(a) && a.playState !== 'finished' && named(a).includes(p))
        .length;
    },
    [prop, self] as const,
  );

/** Waits for every running animation, so a read after it sees the end state. */
const settle = (page: Page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));

/** The computed `prop` of `target` (its `::before` when `pseudo` is set). */
const read = (target: Locator, prop: string, pseudo?: string) =>
  target.evaluate((el, [p, ps]) => getComputedStyle(el, ps ?? null).getPropertyValue(p ?? ''), [prop, pseudo] as const);

interface Row {
  path: string;
  root: (page: Page) => Locator;
  /** Runs the state change and returns the element whose `prop` changes. */
  act: (page: Page, root: Locator) => Promise<Locator>;
  prop: string;
  pseudo?: string;
  /** Blocked on the fresh-load check: a component that goes live without interaction (Toc, `visible`). */
  chunk?: RegExp;
}

async function check(page: Page, row: Row) {
  // Fresh load: nothing animates in the component.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  if (row.chunk) await page.route(row.chunk, (r) => r.abort());
  await page.goto(row.path);
  await page.evaluate(() => document.fonts.ready);
  expect(await probe(row.root(page), ''), 'fresh load').toBe(0);
  if (row.chunk) await page.unroute(row.chunk);

  // The interaction animates the audit row's property on the changed element (the probe reads that
  // element only: a hovered Expressive Code frame in a tab panel runs its own copy-button fade). The timeline runs
  // at a tenth of its speed, so a 0.1s transition is still running when the probe reads it.
  await page.goto(row.path);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
  const target = await row.act(page, row.root(page));
  await expect.poll(() => probe(target, row.prop, true), `${row.prop} animates`).toBeGreaterThan(0);
  await settle(page);
  const end = await read(target, row.prop, row.pseudo);
  await cdp.detach();

  // Reduced motion: the durations are 0s, so no transition is created and the end state holds at once.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(row.path);
  const again = await row.act(page, row.root(page));
  await expect.poll(() => read(again, row.prop, row.pseudo)).toBe(end);
  expect(await probe(again, row.prop, true), 'reduced motion').toBe(0);
}

async function live(root: Locator) {
  await root.hover();
  await expect(root).toHaveAttribute('data-zag-state', 'live');
}

test('Tabs: the selected trigger fades its colour and underline', async ({ page }) => {
  await check(page, {
    path: story('tabs/default'),
    root: (p) => p.locator('#story [data-zag-root="tabs"]').first(),
    act: async (_, root) => {
      await live(root);
      const tab = root.getByRole('tab').nth(1);
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      return tab;
    },
    prop: 'border-bottom-color',
  });
});

test('Tabs: the panel shown fades in', async ({ page }) => {
  await check(page, {
    path: story('tabs/default'),
    root: (p) => p.locator('#story [data-zag-root="tabs"]').first(),
    act: async (_, root) => {
      await live(root);
      await root.getByRole('tab').nth(1).click();
      const panel = root.locator(':scope > [data-part="content"]:not([hidden])');
      await expect(panel).toHaveCount(1);
      return panel;
    },
    prop: 'opacity',
  });
});

test('Pagination: a page item fades its hover colours', async ({ page }) => {
  await check(page, {
    path: story('pagination/default'),
    root: (p) => p.locator('#story [data-zag-root="pagination"]'),
    act: async (_, root) => {
      const item = root.locator('[data-part="item"]:not([data-selected])').first();
      await item.hover();
      return item;
    },
    prop: 'background-color',
  });
});

test('Toc: the active marker fades its colour and rule', async ({ page }) => {
  await check(page, {
    path: story('toc/default'),
    root: (p) => p.locator('#story [data-zag-root="toc"]'),
    // The Toc goes live when it scrolls into view (`visible`), with no interaction: the fresh-load check
    // blocks its chunk.
    chunk: /toc\.zag/,
    act: async (_, root) => {
      await expect(root).toHaveAttribute('data-zag-state', 'live');
      const link = root.locator('[data-part="link"]').last();
      await link.click();
      await expect(link).toHaveAttribute('data-active');
      return link;
    },
    // A transition on a logical property runs on its physical longhand (left, in this LTR page).
    prop: 'border-left-color',
  });
});

test('TreeView: a branch opens with the disclosure motion', async ({ page }) => {
  await check(page, {
    path: story('tree-view/default'),
    root: (p) => p.locator('#story [data-zag-root="tree-view"]'),
    act: async (_, root) => {
      await live(root);
      await root.locator('[data-value="layers"] > [data-part="branch-control"]').click();
      const content = root.locator('[data-value="layers"] > [data-part="branch-content"]');
      await expect(content).not.toHaveAttribute('hidden');
      return content;
    },
    prop: 'height',
  });
});

test('Accordion and Collapsible: the trigger fades its hover tint', async ({ page }) => {
  for (const name of ['accordion', 'collapsible'])
    await check(page, {
      path: story(`${name}/default`),
      root: (p) => p.locator(`#story [data-zag-root="${name}"]`).first(),
      act: async (_, root) => {
        const trigger = root.locator(`.ocx-${name}__trigger:not([data-state="open"])`).first();
        await trigger.hover();
        return trigger;
      },
      prop: 'background-color',
    });
});

test('List: row hover and the multi check box fade', async ({ page }) => {
  await check(page, {
    path: story('list/default'),
    root: (p) => p.locator('#story [data-zag-root="listbox"]').first(),
    act: async (_, root) => {
      const row = root.locator('[role="option"]:not([aria-selected="true"])').first();
      await row.hover();
      return row;
    },
    prop: 'background-color',
  });
  await check(page, {
    path: story('list/states'),
    root: (p) => p.locator('#story [data-zag-root="listbox"]').first(),
    act: async (_, root) => {
      await live(root);
      const row = root.locator('[role="option"][data-value="darwin"]');
      await row.click();
      await expect(row).toHaveAttribute('aria-selected', 'true');
      await page.mouse.move(0, 0);
      return row;
    },
    // The box's border (a longhand: shorthand transitions run per side); the row itself has none.
    prop: 'border-top-color',
    pseudo: '::before',
  });
});

test('DataTable: the sort glyphs crossfade and rows shown by a page fade in', async ({ page }) => {
  const table = (p: Page) => p.locator('#story [data-ocx-data-table]');
  await check(page, {
    path: story('data-table/default'),
    root: table,
    act: async (_, root) => {
      const th = root.locator('th[data-ocx-key="size"]');
      await th.locator('button').click();
      await expect(th).toHaveAttribute('aria-sort', 'ascending');
      return th.locator('svg[data-icon="sort-asc"]');
    },
    prop: 'opacity',
  });
  await check(page, {
    path: story('data-table/default'),
    root: table,
    act: async (_, root) => {
      await root.locator('[data-part="item"]').nth(1).click();
      const row = root.locator('tbody tr[data-ocx-row]:not([hidden])').first();
      // Page 2 of the source order starts at go.
      await expect(row).toHaveText(/^go/);
      return row;
    },
    prop: 'opacity',
  });
});

test('DataTable: a sort that only reorders rows does not animate them (D-R8)', async ({ page }) => {
  await page.goto(story('data-table/states-2'));
  const root = page.locator('#story [data-ocx-data-table]').first();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
  const th = root.locator('th[data-ocx-key="name"]');
  await th.locator('button').click();
  await expect(th).toHaveAttribute('aria-sort', 'ascending');
  await expect(root).toHaveAttribute('data-live', '');
  expect(await probe(root.locator('tbody'), '')).toBe(0);
});
