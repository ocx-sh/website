// C-301 Skeleton (D-R4 to D-R6): each composite reserves the block size of the component it stands
// in for (the swap stories, ±1px), the sweep runs by default, stops under reduced motion and with
// `animated={false}`, is hidden in forced colours, and every skeleton story passes axe in both schemes.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from './tokens.ts';

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
