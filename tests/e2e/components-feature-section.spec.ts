// WP13.4 FeatureSection on its story pages (the six "How it works" sections of the ocx home page):
// `default` is the first one, `states` the other five (flip on the first, third and fifth).
import { AxeBuilder } from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { settle } from './helpers/settle.ts';

const STORY = '/docs/stories/feature-section/';
const ONE = `${STORY}default/`; // one section, above the fold
const PAGE = `${STORY}states/`; // five sections, the last well below the fold
const sections = (page: Page) => page.locator('.ocx-feature');
const box = async (page: Page, i: number, part: 'text' | 'visual') => {
  const b = await sections(page).nth(i).locator(`.ocx-feature__${part}`).boundingBox();
  if (!b) throw new Error(`no box for section ${i} ${part}`);
  return b;
};

test.describe('WP13.4 FeatureSection', () => {
  test('WP13.4 FeatureSection: sections alternate — flip puts the visual left of the text on desktop (16954ea87)', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'desktop two-column layout');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(PAGE);
    await expect(sections(page)).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      const [text, visual] = [await box(page, i, 'text'), await box(page, i, 'visual')];
      const flipped = i % 2 === 0;
      if (flipped) await expect(sections(page).nth(i)).toHaveAttribute('data-flip', '');
      else await expect(sections(page).nth(i)).not.toHaveAttribute('data-flip');
      if (flipped) expect(visual.x + visual.width, `section ${i}`).toBeLessThanOrEqual(text.x + 1);
      else expect(text.x + text.width, `section ${i}`).toBeLessThanOrEqual(visual.x + 1);
      expect(Math.abs(text.y + text.height / 2 - (visual.y + visual.height / 2)), `section ${i} same row`).toBeLessThan(
        Math.max(text.height, visual.height),
      );
    }
  });

  test('WP13.4 FeatureSection: text takes 3fr and the visual 2fr; flip only swaps the sides (16954ea87)', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'desktop two-column layout');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const path of [ONE, PAGE]) {
      await page.goto(path);
      for (const i of path === ONE ? [0] : [0, 1]) {
        const [text, visual] = [await box(page, i, 'text'), await box(page, i, 'visual')];
        expect(text.width / visual.width, `${path} section ${i}`).toBeCloseTo(3 / 2, 1);
      }
    }
  });

  test('WP13.4 FeatureSection: an .feature-img visual is capped at 240px wide (16954ea87)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(ONE);
    const img = sections(page).first().locator('.ocx-feature__visual img.feature-img');
    await expect(img).toBeVisible();
    await expect(img).toHaveCSS('max-width', '240px');
    expect((await img.boundingBox())?.width).toBeLessThanOrEqual(240);
  });

  test('WP13.4 FeatureSection: on mobile every section stacks, text above visual, flip or not (16954ea87)', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile stacked layout');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(PAGE);
    for (let i = 0; i < 2; i++) {
      const [text, visual] = [await box(page, i, 'text'), await box(page, i, 'visual')];
      expect(text.y + text.height, `section ${i}`).toBeLessThanOrEqual(visual.y + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('WP13.4 FeatureSection: the above-the-fold section is never hidden (LCP) and still settles in via the IO callback', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
      const w = window as unknown as { __ocx: { atLoad?: { revealed: boolean; opacity: string }; moved: number } };
      w.__ocx = { moved: 0 };
      const count = (e: Event) => {
        if ((e.target as Element).closest?.('.ocx-feature') === document.querySelector('.ocx-feature')) w.__ocx.moved++;
      };
      document.addEventListener('transitionrun', count, true);
      document.addEventListener('animationstart', count, true);
      // Module scripts (the component's) have run by DOMContentLoaded; the IO callback has not.
      document.addEventListener('DOMContentLoaded', () => {
        const first = document.querySelector('.ocx-feature');
        if (first)
          w.__ocx.atLoad = { revealed: first.hasAttribute('data-revealed'), opacity: getComputedStyle(first).opacity };
      });
    });
    await page.goto(ONE);
    const first = sections(page).first();
    await expect(first).toBeInViewport();
    await expect(first).toHaveAttribute('data-revealed', '');
    await expect(first).toHaveCSS('opacity', '1');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __ocx: { moved: number } }).__ocx.moved))
      .toBeGreaterThan(0);
    const state = await page.evaluate(() => (window as unknown as { __ocx: unknown }).__ocx);
    expect(state).toMatchObject({ atLoad: { revealed: false } });
    expect(Number((state as { atLoad: { opacity: string } }).atLoad.opacity)).toBe(1);
    expect((state as { moved: number }).moved, 'a transition or animation ran on the first section').toBeGreaterThan(0);
  });

  test('WP13.4 FeatureSection: a below-the-fold section stays hidden until scrolled into view (43d3f2dc9)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(PAGE);
    await expect(sections(page).first()).toHaveAttribute('data-revealed', '');
    const last = sections(page).last();
    await expect(last).not.toBeInViewport();
    await expect(last).not.toHaveAttribute('data-revealed');
    expect(Number(await last.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(1);
    await last.scrollIntoViewIfNeeded();
    await expect(last).toHaveAttribute('data-revealed', '');
    await expect(last).toHaveCSS('opacity', '1');
  });

  test('WP13.4 FeatureSection: the reveal is one-shot — scrolling back up never hides a section again (43d3f2dc9)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(PAGE);
    const last = sections(page).last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toHaveAttribute('data-revealed', '');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(last).not.toBeInViewport();
    await page.waitForTimeout(300);
    await expect(last).toHaveAttribute('data-revealed', '');
    await expect(last).toHaveCSS('opacity', '1');
  });

  test.describe('no JavaScript', () => {
    test.use({ javaScriptEnabled: false });
    test('WP13.4 FeatureSection: without JavaScript every section is fully visible (WP13.4)', async ({ page }) => {
      await page.goto(PAGE);
      await expect(sections(page)).toHaveCount(5);
      for (const s of await sections(page).all()) {
        await expect(s).toHaveCSS('opacity', '1');
        await expect(s.locator('h2')).toBeVisible();
      }
    });
  });

  test('WP13.4 FeatureSection: under prefers-reduced-motion every section is visible at once, no transform (WP13.4)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(PAGE);
    const last = sections(page).last();
    await expect(last).not.toBeInViewport();
    for (const s of await sections(page).all()) {
      await expect(s).toHaveCSS('opacity', '1');
      await expect(s).toHaveCSS('transform', 'none');
    }
  });

  for (const theme of ['light', 'dark']) {
    test(`WP13.4 FeatureSection: axe reports no violations on the story pages (${theme})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const path of [ONE, PAGE]) {
        await page.goto(path);
        await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
        await settle(page); // axe must read final colours, not a theme crossfade
        const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
        expect(violations.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual(
          [],
        );
      }
    });

    test(`WP13.4 FeatureSection: axe color-contrast passes without scrolling — below-fold sections stay unrevealed (${theme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(PAGE);
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      await settle(page); // axe must read final colours, not a theme crossfade
      await expect(sections(page).last()).not.toHaveAttribute('data-revealed'); // guard: still below the fold
      await expect(sections(page).first()).toHaveCSS('opacity', '1'); // let the reveal transition finish
      const { violations } = await new AxeBuilder({ page }).include('#story').withRules(['color-contrast']).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
});
