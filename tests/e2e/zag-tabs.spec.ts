// Tabs and ToggleGroup on Zag (C-130c/d/e/g/h, C-150, C-151, C-153, S-105), on the built
// story pages (Tabs and ToggleGroup, C-125). Desktop chromium: the leak helper and the pixel comparison need CDP and one viewport.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoLeak } from './helpers/leak.ts';
import { settle } from './helpers/settle.ts';

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

const STORY = '/docs/stories/tabs/';
const TABS = `${STORY}default/`;
const SYNCED = `${STORY}synced-with-the-demo/`;
const PLAIN = `${STORY}plain-labels-not-synced/`;
const OVERFLOW = `${STORY}more-tabs-than-fit/`;
const TOGGLE = '/docs/stories/toggle-group/default/';
const TOGGLE_STATES = '/docs/stories/toggle-group/states/';
const KEY = 'starlight-synced-tabs__shell';
const CHUNK = { tabs: /\/tabs\.zag\.[^/]*\.js$/, toggle: /\/toggle-group\.zag\.[^/]*\.js$/ };

// Each story page holds one group, except SYNCED: the demo group, then a second with the same syncKey.
const demo = (page: Page) => page.locator('#story [data-zag-root="tabs"]').first();
const synced = (page: Page) => page.locator('[data-zag-root="tabs"][data-sync-key="shell"]');
const plain = (page: Page) => page.locator('#story [data-zag-root="tabs"]');
const overflowing = plain;
const tab = (root: Locator, label: string) => root.getByRole('tab', { name: label, exact: true });
const selectedLabels = (page: Page) =>
  synced(page).evaluateAll((roots) =>
    roots.map((r) => r.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()),
  );

async function live(root: Locator) {
  await root.hover();
  await expect(root).toHaveAttribute('data-zag-state', 'live');
}

/**
 * C-130c: the region with its chunk blocked vs. after live, focus dropped. The machine starts from a
 * synthetic `pointerenter` (the mount trigger), not a real hover: the pointer would leave a hover ink
 * fade (C-302) behind that a slow runner still paints when the pointer moves away.
 */
async function expectFirstPaintFinal(page: Page, path: string, chunk: RegExp, root: (p: Page) => Locator) {
  await page.route(chunk, (r) => r.abort());
  await page.goto(path);
  const before = await root(page).screenshot({ animations: 'disabled', caret: 'hide' });
  await page.unroute(chunk);
  await page.goto(path);
  await root(page).dispatchEvent('pointerenter');
  await expect(root(page)).toHaveAttribute('data-zag-state', 'live');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const after = await root(page).screenshot({ animations: 'disabled', caret: 'hide' });
  expect(after.equals(before), 'pixel-exact first paint').toBe(true);
}

test.describe('Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('keep')) localStorage.clear();
    });
  });

  test('C-130c first paint is final: SSR (chunk blocked) equals the live default state', async ({ page }) => {
    await expectFirstPaintFinal(page, TABS, CHUNK.tabs, demo);
  });

  for (const [name, path] of [
    ['plain', PLAIN],
    ['overflowing', OVERFLOW],
  ] as const)
    test(`C-130c first paint is final: the ${name} story`, async ({ page }) => {
      await expectFirstPaintFinal(page, path, CHUNK.tabs, plain);
    });

  test('C-130d APG tabs: arrows, Home, End with automatic activation; a key before live is kept', async ({ page }) => {
    await page.goto(PLAIN);
    const root = plain(page);
    const labels = await root.getByRole('tab').allTextContents();
    await tab(root, labels[0]!.trim()).focus();
    await page.keyboard.press('ArrowRight'); // may arrive before the machine is live
    await expect(root).toHaveAttribute('data-zag-state', 'live');
    const expectSelected = async (i: number) => {
      const t = root.getByRole('tab').nth(i);
      await expect(t).toHaveAttribute('aria-selected', 'true');
      await expect(t).toBeFocused();
      await expect(root.getByRole('tabpanel')).toHaveCount(1);
      await expect(root.locator(':scope > [data-part="content"]:not([hidden])')).toHaveAttribute(
        'aria-labelledby',
        (await t.getAttribute('id'))!,
      );
    };
    await expectSelected(1);
    await page.keyboard.press('End');
    await expectSelected(labels.length - 1);
    await page.keyboard.press('ArrowRight');
    await expectSelected(0);
    await page.keyboard.press('ArrowLeft');
    await expectSelected(labels.length - 1);
    await page.keyboard.press('Home');
    await expectSelected(0);
    await page.keyboard.press('Tab');
    await expect(root.getByRole('tabpanel')).toBeFocused();
  });

  test('C-130e axe is clean with the demo live and with a second tab selected', async ({ page }) => {
    await page.goto(TABS);
    for (const pick of [undefined, 'PowerShell']) {
      await live(demo(page));
      if (pick) await tab(demo(page), pick).click();
      // The trigger colours and the panel fade in (C-302): axe reads the end state.
      await settle(page);
      const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  });

  for (const path of [PLAIN, OVERFLOW, SYNCED])
    test(`C-130e axe is clean with every group live: ${path}`, async ({ page }) => {
      await page.goto(path);
      for (const root of await page.locator('[data-zag-root="tabs"]').all()) await live(root);
      const { violations } = await new AxeBuilder({ page }).include('[data-zag-root="tabs"]').analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });

  test('C-130g a change surfaces as ocx:tabs:change {value} in the event log', async ({ page }) => {
    await page.goto(TABS);
    await live(demo(page));
    await tab(demo(page), 'Nushell').click();
    await expect(page.locator('#story [role="log"] li').first()).toHaveText('ocx:tabs:change {"value":"nushell"}');
  });

  test('a switch crossfades both panels in a box that never changes height; hidden panels stay out of reach', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
          if (!e.hadRecentInput) w.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${STORY}panels-of-different-lengths/`);
    await page.evaluate(() => document.fonts.ready);
    const root = demo(page);
    const panels = root.locator(':scope > [data-part="content"]');
    const height = async () => (await root.boundingBox())!.height;
    const before = await height();
    const cls0 = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    // Both panels are laid out in one cell: equal boxes, whichever is shown.
    const boxes = await panels.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(boxes[0]).toBe(boxes[1]);

    await live(root);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
    await tab(root, 'Four lines').click();
    const running = () =>
      panels.evaluateAll((els) =>
        els.map((e) =>
          (e.querySelector('pre code') as HTMLElement)
            .getAnimations()
            .some((a) => a instanceof CSSTransition && a.transitionProperty === 'opacity' && a.playState === 'running'),
        ),
      );
    // A lone code frame: the text of both panels fades, the panels (frames) stay at opacity 1.
    await expect.poll(running).toEqual([true, true]);
    expect(await panels.evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity))).toEqual(['1', '1']);
    expect(await height(), 'during').toBe(before);
    await settle(page);
    await cdp.detach();
    expect(await height(), 'after').toBe(before);
    await tab(root, 'One line').click();
    await settle(page);
    expect(await height(), 'back').toBe(before);
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(cls0);

    // The hidden panel is laid out but unreachable: no a11y node, no tab stop, no visibility.
    await expect(root.getByRole('tabpanel')).toHaveCount(1);
    const hidden = panels.filter({ hasNot: page.locator(':scope:not([hidden])') });
    await expect(hidden).toHaveCount(1);
    expect(await hidden.evaluate((e) => getComputedStyle(e).visibility)).toBe('hidden');

    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await settle(page);
      const { violations } = await new AxeBuilder({ page }).include('[data-zag-root="tabs"]').analyze();
      expect(
        violations.map((v) => v.id),
        theme,
      ).toEqual([]);
    }

    // Reduced motion: the switch runs no transition at all.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await tab(root, 'Four lines').click();
    expect(await running()).toEqual([false, false]);
    expect(await height()).toBe(before);
  });

  test('a switch on prose panels crossfades both whole panels', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(PLAIN);
    const root = plain(page);
    await live(root);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
    await root.getByRole('tab').nth(1).click();
    const panels = root.locator(':scope > [data-part="content"]');
    const fading = () =>
      panels.evaluateAll(
        (els) =>
          els.filter((e) =>
            e.getAnimations().some((a) => a instanceof CSSTransition && a.transitionProperty === 'opacity'),
          ).length,
      );
    await expect.poll(fading).toBe(2);
    await settle(page);
    await cdp.detach();
  });

  test('C-151 S-105 a choice switches every synced group, persists, and restores on load without JS', async ({
    page,
  }) => {
    await page.goto(SYNCED);
    await expect(synced(page)).toHaveCount(2);
    await live(demo(page));
    await page.evaluate(() => {
      const seen: unknown[] = [];
      Object.assign(window, { seen });
      document.addEventListener('ocx:tabs:change', (e) => seen.push((e as CustomEvent).detail));
    });
    await tab(demo(page), 'cmd').click();
    await expect.poll(() => selectedLabels(page)).toEqual(['cmd', 'cmd']);
    // The idle peer followed in the DOM and still announced it.
    expect(await page.evaluate(() => (window as unknown as { seen: unknown[] }).seen)).toEqual([
      { value: 'cmd' },
      { value: 'cmd' },
    ]);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('cmd');
    // Reload with every module script blocked: only the inline restore script runs.
    await page.evaluate(() => sessionStorage.setItem('keep', '1'));
    await page.route(/\.js$/, (r) => r.abort());
    await page.reload();
    expect(await selectedLabels(page)).toEqual(['cmd', 'cmd']);
    await expect(synced(page).first().getByRole('tabpanel')).toContainText('cmd');
  });

  test('C-151 a live peer follows in its machine: focus keeps the synced tab, arrows go on from it', async ({
    page,
  }) => {
    await page.goto(SYNCED);
    const [a, b] = [synced(page).nth(0), synced(page).nth(1)];
    await live(a);
    await b.scrollIntoViewIfNeeded();
    await live(b);
    await a.scrollIntoViewIfNeeded();
    await tab(a, 'cmd').click();
    await expect.poll(() => selectedLabels(page)).toEqual(['cmd', 'cmd']);
    await tab(b, 'cmd').focus(); // a repaint from b's machine: a stale value would jump back
    await expect(tab(b, 'cmd')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(tab(b, 'Elvish')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => selectedLabels(page)).toEqual(['Elvish', 'Elvish']);
  });

  test('C-151 a throwing localStorage still switches the groups, and nothing is restored', async ({ page }) => {
    const errors: Error[] = [];
    page.on('pageerror', (e) => errors.push(e));
    // Denied for the tabs key only: other page code (theme toggle) gets an in-memory store.
    await page.addInitScript(() => {
      const map = new Map<string, string>();
      const deny = (key: string) => {
        if (key.startsWith('starlight-synced-tabs__')) throw new DOMException('denied', 'SecurityError');
      };
      const storage = {
        getItem: (key: string) => (deny(key), map.get(key) ?? null),
        setItem: (key: string, value: string) => (deny(key), void map.set(key, value)),
        removeItem: (key: string) => void map.delete(key),
        clear: () => map.clear(),
      };
      Object.defineProperty(window, 'localStorage', { value: storage });
    });
    await page.goto(SYNCED);
    await live(demo(page));
    await tab(demo(page), 'Elvish').click();
    await expect.poll(() => selectedLabels(page)).toEqual(['Elvish', 'Elvish']);
    await page.reload();
    expect(await selectedLabels(page)).toEqual(['Shell', 'Shell']);
    expect(errors).toEqual([]);
  });

  test('C-151 the clicked tab keeps its viewport position when a group above switches', async ({ page }) => {
    // A viewport shorter than the story, so the page has room to scroll and keep the tab in place.
    await page.setViewportSize({ width: 1280, height: 160 });
    await page.goto(SYNCED);
    const second = synced(page).nth(1);
    await second.scrollIntoViewIfNeeded();
    await live(second);
    const heightBefore = (await demo(page).boundingBox())!.height;
    const target = tab(second, 'PowerShell');
    const y = (await target.boundingBox())!.y;
    await target.click();
    await expect(target).toHaveAttribute('aria-selected', 'true');
    await expect(tab(demo(page), 'PowerShell')).toHaveAttribute('aria-selected', 'true');
    expect((await demo(page).boundingBox())!.height, 'panels share one cell: no height change').toBe(heightBefore);
    expect(Math.abs((await target.boundingBox())!.y - y)).toBeLessThanOrEqual(1);
  });

  test('the tab list never grows a vertical scrollbar, at 390px and desktop, when tabs overrun the width', async ({
    page,
  }) => {
    await page.goto(OVERFLOW);
    const list = overflowing(page).locator('[data-part="list"]');
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const [scrollH, clientH] = await list.evaluate((el) => [el.scrollHeight, el.clientHeight]);
      expect(scrollH, `${width}px: list scrollHeight vs clientHeight`).toBeLessThanOrEqual(clientH);
    }
    // It does overflow horizontally at 390px — the point of the fixture — with a thin scrollbar, not none.
    await page.setViewportSize({ width: 390, height: 800 });
    const [scrollW, clientW] = await list.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scrollW).toBeGreaterThan(clientW);
  });

  // Two halves: a synced pick leaves a group without `data-sync-key` alone (SYNCED, live peers beside
  // it), and a group emitted without a syncKey has no restore script (PLAIN, stored values present).
  test('C-151 a synced pick leaves a group without syncKey alone', async ({ page }) => {
    await page.goto(SYNCED);
    // Turn the second group into an unsynced one before either machine starts.
    await synced(page)
      .nth(1)
      .evaluate((el) => el.removeAttribute('data-sync-key'));
    const [a, b] = [demo(page), page.locator('[data-zag-root="tabs"]:not([data-sync-key])').last()];
    await expect(b).not.toHaveAttribute('data-sync-key');
    await live(a);
    await tab(a, 'cmd').click();
    await expect(tab(a, 'cmd')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(b, 'Shell')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(b, 'cmd')).toHaveAttribute('aria-selected', 'false');
  });

  test('C-151 a group without syncKey ignores the stored synced choice on load', async ({ page }) => {
    await page.addInitScript((k) => {
      localStorage.setItem(k, 'Windows');
      localStorage.setItem('starlight-synced-tabs__undefined', 'Windows');
    }, KEY);
    await page.goto(PLAIN);
    await expect(plain(page).getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');
    await expect(tab(plain(page), 'Windows')).toHaveAttribute('aria-selected', 'false');
  });

  test('C-130h tabs.zag leaks nothing over 20 change cycles', async ({ page }) => {
    await page.goto(PLAIN);
    const root = plain(page);
    await live(root);
    const [a, b] = [root.getByRole('tab').nth(0), root.getByRole('tab').nth(1)];
    await expectNoLeak(page, async () => {
      await b.click();
      await a.click();
    });
  });
});

test.describe('ToggleGroup', () => {
  const group = (page: Page) => page.locator('#story [data-zag-root="toggle-group"]');

  test('C-130c first paint is final: SSR (chunk blocked) equals the live default state', async ({ page }) => {
    await expectFirstPaintFinal(page, TOGGLE, CHUNK.toggle, group);
  });

  test('C-130d group keys: focus enters on the first option, arrows move and wrap, Space presses', async ({ page }) => {
    await page.goto(TOGGLE);
    const root = group(page);
    await root.focus(); // the group's Tab stop, before the machine is live
    await expect(root).toHaveAttribute('data-zag-state', 'live');
    const radios = root.getByRole('radio');
    await expect(radios.first()).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(radios.last()).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(radios.nth(2)).toBeFocused();
    await page.keyboard.press(' ');
    await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true');
    await expect(root.locator('[aria-checked="true"]')).toHaveCount(1);
  });

  test('C-130e C-130g axe is clean, and a change surfaces as ocx:toggle-group:change {value}', async ({ page }) => {
    await page.goto(TOGGLE);
    await live(group(page));
    await group(page).getByRole('radio', { name: 'linux' }).click();
    await expect(page.locator('#story [role="log"] li').first()).toHaveText(
      'ocx:toggle-group:change {"value":["linux"]}',
    );
    const scan = async () => {
      const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
      return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    };
    expect(await scan()).toEqual([]);
    await page.goto(TOGGLE_STATES);
    expect(await scan()).toEqual([]);
  });

  test('C-271 icon-only group: named cells, arrows move and Space presses, axe is clean', async ({ page }) => {
    await page.goto(TOGGLE_STATES);
    const root = page.locator('.showcase-states [aria-label="Theme"][data-zag-root="toggle-group"]');
    await live(root);
    const [light, dark] = [root.getByRole('radio', { name: 'Light' }), root.getByRole('radio', { name: 'Dark' })];
    await expect(light).toHaveAttribute('data-icon-only', '');
    await expect(light.locator('svg.ocx-icon')).toHaveCount(1);
    await expect(dark).toHaveAttribute('aria-checked', 'true');
    await light.focus();
    await page.keyboard.press('ArrowRight');
    await expect(dark).toBeFocused();
    await page.keyboard.press('ArrowRight'); // wraps
    await expect(light).toBeFocused();
    await page.keyboard.press(' ');
    await expect(light).toHaveAttribute('aria-checked', 'true');
    await expect(root.locator('[aria-checked="true"]')).toHaveCount(1);
    const { violations } = await new AxeBuilder({ page }).include('.showcase-states').analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('C-130h toggle-group.zag leaks nothing over 20 change cycles', async ({ page }) => {
    await page.goto(TOGGLE_STATES);
    // A group outside the demo: the event log's own entries are not the component's nodes.
    const root = page.locator('.showcase-states [data-zag-root="toggle-group"][role="radiogroup"]').first();
    await live(root);
    const [a, b] = [root.getByRole('radio').nth(0), root.getByRole('radio').nth(2)];
    await expectNoLeak(page, async () => {
      await b.click();
      await a.click();
    });
  });
});
