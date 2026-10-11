// C-301 Skeleton (D-R4 to D-R6): each composite reserves the block size of the component it stands
// in for (the swap stories, ±1px), the sweep runs by default, stops under reduced motion and with
// `animated={false}`, is hidden in forced colours, and every skeleton story passes axe in both schemes.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from './tokens.ts';
import { settle } from './helpers/settle.ts';

const story = (name: string) => `/docs/stories/skeleton/${name}/`;
const SKELETON = '#story .ocx-ui-skeleton';
const LINE = '.ocx-ui-skeleton__line';
// Composite → the story holding its pair and the real component's box it swaps with. The pairs
// split over two stories so neither page loads every component (Lighthouse performance).
const COUNTERPART = {
  card: ['swap', '.ocx-card'],
  list: ['swap', '[data-part="content"]'],
  table: ['swap', '.ocx-data-table__scroll'],
  code: ['swap-code', '.expressive-code .frame'],
  // A titled fence adds EC's 36px header; a `sh` fence (terminal frame) has none in this theme.
  title: ['swap-code', '.expressive-code .frame'],
  shell: ['swap-code', '.expressive-code .frame'],
  terminal: ['swap-code', '.ocx-terminal'],
} as const;

/** Running skeleton sweeps on the page: CSS animations on a bar's ::after. */
const sweeps = (page: Page) =>
  page.evaluate(
    (line) =>
      document.getAnimations().filter((a) => {
        const effect = a.effect as KeyframeEffect | null;
        return (
          effect?.pseudoElement === '::after' &&
          effect.target?.matches(line) &&
          (a as CSSAnimation).animationName === 'ocx-ui-skeleton-sweep'
        );
      }).length,
    LINE,
  );

test.describe('C-301 Skeleton swap: a composite reserves its counterpart’s block size', () => {
  for (const [variant, [name, real]] of Object.entries(COUNTERPART)) {
    test(`C-301 Skeleton: the ${variant} skeleton is as tall as the real one, within 1px`, async ({ page }) => {
      await page.goto(story(name));
      const pair = page.locator(`[data-swap="${variant}"]`);
      const skeleton = pair.locator('[data-role="skeleton"] > .ocx-ui-skeleton');
      const counterpart = pair.locator(`[data-role="real"] ${real}`).first();
      await expect(skeleton).toBeVisible();
      await expect(counterpart).toBeVisible();
      const [a, b] = await Promise.all([skeleton.boundingBox(), counterpart.boundingBox()]);
      expect(a && b, `${variant} boxes`).toBeTruthy();
      expect(
        Math.abs((a?.height ?? 0) - (b?.height ?? 0)),
        `${variant}: ${a?.height} vs ${b?.height}`,
      ).toBeLessThanOrEqual(1);
    });
  }

  test('C-301 Skeleton: the shell skeleton is untitled: a code block with no header bar', async ({ page }) => {
    await page.goto(story('swap-code'));
    expect(await page.locator('[data-swap="shell"] .ocx-ui-skeleton__chrome').count()).toBe(0);
    expect(await page.locator('[data-swap="title"] .ocx-ui-skeleton__chrome').count()).toBe(1);
  });

  test('C-301 Skeleton: a circle is the Avatar size and a rect takes its ratio', async ({ page }) => {
    await page.goto(story('variants'));
    const circles = page.locator(`${SKELETON}[data-variant="circle"] ${LINE}`);
    for (const [i, token] of ['--ocx-control-sm', '--ocx-control-lg', '--ocx-control-2xl'].entries()) {
      const box = await circles.nth(i).boundingBox();
      const size = await resolve(page, 'inline-size', `var(${token})`);
      expect(`${box?.width}px ${box?.height}px`).toBe(`${size} ${size}`);
    }
    const rect = await page.locator(`${SKELETON}[data-variant="rect"] ${LINE}`).nth(1).boundingBox();
    expect((rect?.width ?? 0) / (rect?.height ?? 1)).toBeCloseTo(3, 1);
  });
});

// A code block's height comes from its source (lines × code line height + padding, + the 36px title
// bar): no font can change it, so blocking the web fonts moves nothing.
test.describe('C-301 Skeleton size lock', () => {
  const PAIRS = ['code', 'title', 'shell'] as const;
  const heights = (page: Page) =>
    page.evaluate((pairs) => {
      const h = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().height ?? NaN;
      return pairs.flatMap((p) => [
        h(`[data-swap="${p}"] [data-role="skeleton"] > .ocx-ui-skeleton`),
        h(`[data-swap="${p}"] [data-role="real"] .expressive-code .frame`),
      ]);
    }, PAIRS);

  test('C-301 Skeleton: code, titled and shell blocks and their skeletons keep their height with web fonts blocked or loaded', async ({
    page,
  }) => {
    const blocked = (r: { abort: () => Promise<void> }) => r.abort();
    await page.route('**/*.woff2', blocked);
    await page.goto(story('swap-code'));
    await expect(page.locator('[data-swap="shell"] .expressive-code .frame')).toBeVisible();
    const without = await heights(page);
    await page.unroute('**/*.woff2', blocked);

    await page.goto(story('swap-code'));
    await expect(page.locator('[data-swap="shell"] .expressive-code .frame')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const withFonts = await heights(page);

    expect(without.every(Number.isFinite)).toBe(true);
    for (const [i, h] of withFonts.entries())
      expect(Math.abs(h - (without[i] ?? NaN)), `box ${i}`).toBeLessThanOrEqual(0.5);
  });

  test('C-301 Skeleton: a swap fades the content in over the skeleton with no layout shift', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
          if (!e.hadRecentInput) w.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/data/dependencies.json', async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/docs/stories/dependency-explorer/default/');
    const stats = page.locator('.ocx-deps__stat-value.ocx-swap');
    await expect(stats).toHaveCount(3);
    await settle(page);
    const before = await stats.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    await page.evaluate(() => ((window as unknown as { __cls: number }).__cls = 0));
    release();
    await expect(page.locator('.ocx-deps__stat-value[data-loaded]')).toHaveCount(3);
    const skeleton = stats.first().locator('.ocx-ui-skeleton');
    await expect(skeleton).toHaveCSS('visibility', 'hidden'); // after the fade
    await expect(skeleton).toHaveCSS('opacity', '0');
    await expect(stats.first().locator('.ocx-deps__stat-text')).toHaveCSS('opacity', '1');
    expect(await stats.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))).toEqual(before);
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('C-301 Skeleton: with reduced motion the swap is instant', async ({ page }) => {
      await page.goto('/docs/stories/dependency-explorer/default/');
      const stat = page.locator('.ocx-deps__stat-value[data-loaded]').first();
      await expect(stat).toBeVisible();
      const durations = await stat
        .locator('.ocx-ui-skeleton')
        .evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(durations.split(', ').every((d) => d === '0s')).toBe(true);
    });
  });
});

test.describe('C-301 Skeleton sweep', () => {
  test('C-301 Skeleton: the sweep runs by default, linear, and moves with translate', async ({ page }) => {
    await page.goto(story('variants'));
    await expect.poll(() => sweeps(page)).toBeGreaterThan(0);
    const line = page.locator(`${SKELETON} ${LINE}`).first();
    const style = await line.evaluate((el) => {
      const cs = getComputedStyle(el, '::after');
      return { fn: cs.animationTimingFunction, duration: cs.animationDuration, iterations: cs.animationIterationCount };
    });
    expect(style.fn).toBe('linear');
    expect(style.iterations).toBe('infinite');
    expect(style.duration).toBe(await resolve(page, 'transition-duration', 'calc(var(--ocx-duration-slow) * 5)'));
    const moved = async () => line.evaluate((el) => getComputedStyle(el, '::after').translate);
    const first = await moved();
    await expect.poll(moved).not.toBe(first);
  });

  test('C-301 Skeleton: animated=false leaves that skeleton still', async ({ page }) => {
    await page.goto(story('states'));
    const off = page.locator(`${SKELETON}[data-animated="false"]`);
    await expect(off).toHaveCount(1);
    expect(
      await off
        .locator(LINE)
        .first()
        .evaluate((el) => getComputedStyle(el, '::after').animationName),
    ).toBe('none');
    const on = page.locator(`${SKELETON}:not([data-animated])`).first();
    expect(
      await on
        .locator(LINE)
        .first()
        .evaluate((el) => getComputedStyle(el, '::after').animationName),
    ).toBe('ocx-ui-skeleton-sweep');
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('C-301 Skeleton: with reduced motion there are no animations and the bars still reserve their box', async ({
      page,
    }) => {
      await page.goto(story('variants'));
      await expect(page.locator(SKELETON).first()).toBeVisible();
      expect(await sweeps(page)).toBe(0);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      expect(
        await page
          .locator(`${SKELETON} ${LINE}`)
          .first()
          .evaluate((el) => getComputedStyle(el, '::after').animationName),
      ).toBe('none');
    });
  });

  test.describe('forced colours', () => {
    test.use({ forcedColors: 'active' });

    test('C-301 Skeleton: in forced colours the bars are GrayText and the sweep is hidden', async ({ page }) => {
      await page.goto(story('variants'));
      const line = page.locator(`${SKELETON} ${LINE}`).first();
      await expect(line).toBeVisible();
      expect(await line.evaluate((el) => getComputedStyle(el, '::after').display)).toBe('none');
      expect(await line.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
        await resolve(page, 'color', 'GrayText'),
      );
    });
  });
});

test.describe('C-301 Skeleton a11y', () => {
  for (const name of ['default', 'states', 'variants', 'swap', 'swap-code']) {
    for (const theme of ['light', 'dark']) {
      test(`C-301 Skeleton: axe reports no violations on the ${name} story (${theme})`, async ({ page }) => {
        await page.goto(story(name));
        await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
        await settle(page); // axe must read final colours, not a theme crossfade
        await expect(page.locator(SKELETON).first()).toBeVisible();
        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      });
    }
  }

  test('C-301 Skeleton: every skeleton is aria-hidden and carries no role', async ({ page }) => {
    await page.goto(story('variants'));
    const all = page.locator(SKELETON);
    expect(await all.count()).toBeGreaterThan(8);
    expect(
      await all.evaluateAll(
        (els) => els.filter((el) => el.getAttribute('aria-hidden') !== 'true' || el.hasAttribute('role')).length,
      ),
    ).toBe(0);
  });
});
