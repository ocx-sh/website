// ShellSession `play` and the scroll-driven components (ScrollStage, ScrollProgress, ScrollFade, FeatureSection
// `reveal`): the box never resizes while it plays, reduced motion shows the final state, and scrolling moves the
// custom properties the markup is drawn from. Desktop project only.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settle } from './helpers/settle.ts';

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

const story = (slug: string, name = 'default') => `/docs/stories/${slug}/${name}/`;
const SESSION = '.ocx-shell-session[data-ocx-play]';
const text = (page: Page) => page.locator(`${SESSION} .code`).evaluateAll((els) => els.map((e) => e.textContent));
const prop = (page: Page, selector: string, name: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, n) => (el as HTMLElement).style.getPropertyValue(n), name);

test.describe('ShellSession play', () => {
  test('types the first command, shows its output after it, and never resizes the box', async ({ page }) => {
    await page.goto(story('shell-session', 'play'));
    const before = await page.locator(SESSION).boundingBox();
    await expect.poll(async () => (await text(page))[0]).toBe('ocx lock');
    await expect.poll(async () => (await text(page))[1]).toBe('locked 3 tools in ocx.lock');
    // Mid-loop sizes: sample while it plays.
    for (let i = 0; i < 12; i++) {
      expect((await page.locator(SESSION).boundingBox())?.height).toBe(before?.height);
      await page.waitForTimeout(250);
    }
    expect(await page.locator(`${SESSION} [data-cur]`).count()).toBeLessThanOrEqual(1);
  });

  test('reduced motion shows the final state and never starts the player', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(story('shell-session', 'play'));
    await settle(page);
    expect(await text(page)).toEqual([
      'ocx lock',
      'locked 3 tools in ocx.lock',
      'ocx exec -- node --version',
      'v24.9.0',
    ]);
    await expect(page.locator(SESSION)).not.toHaveAttribute('data-zag-state', /.+/);
  });

  test('pauses while the tab is hidden', async ({ page }) => {
    await page.goto(story('shell-session', 'play'));
    await expect(page.locator(SESSION)).toHaveAttribute('data-zag-state', 'live');
    await expect.poll(async () => (await text(page))[0]).toMatch(/^ocx/);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const frozen = await text(page);
    await page.waitForTimeout(600);
    expect(await text(page)).toEqual(frozen);
  });
});

test.describe('scroll-driven components', () => {
  test('ScrollProgress fills with the scroll position', async ({ page }) => {
    await page.goto(story('scroll-progress'));
    await expect.poll(() => prop(page, '.ocx-scroll-progress', '--ocx-prog')).toBe('0');
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(async () => Number(await prop(page, '.ocx-scroll-progress', '--ocx-prog'))).toBeGreaterThan(0.95);
  });

  test('ScrollFade fades away and drifts as the page scrolls', async ({ page }) => {
    await page.goto(story('scroll-fade'));
    await expect.poll(() => prop(page, '.ocx-fade', '--ocx-fade-o')).toBe('1');
    await page.evaluate(() => scrollTo(0, innerHeight));
    await expect.poll(() => prop(page, '.ocx-fade', '--ocx-fade-o')).toBe('0');
    expect(Number(await prop(page, '.ocx-fade', '--ocx-fade-y'))).toBeGreaterThan(100);
  });

  test('ScrollReveal rises into view as the page scrolls', async ({ page }) => {
    await page.goto(story('scroll-reveal'));
    await expect.poll(() => prop(page, '.ocx-scroll-reveal', '--ocx-reveal')).toBe('0');
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => prop(page, '.ocx-scroll-reveal', '--ocx-reveal')).toBe('1');
  });

  test('ScrollStage stays pinned while its items fly in, are struck, and the finale appears', async ({ page }) => {
    await page.goto(story('scroll-stage'));
    const pin = page.locator('.ocx-stage__pin');
    await expect.poll(() => prop(page, '.ocx-stage__items > :last-child', '--ocx-e')).toBe('0');
    await page.evaluate(() =>
      scrollTo(0, (document.querySelector('.ocx-stage')!.getBoundingClientRect().height - innerHeight) * 0.4),
    );
    await expect
      .poll(async () => Number(await prop(page, '.ocx-stage__items > :last-child', '--ocx-e')))
      .toBeGreaterThan(0.99);
    // Stuck to the top of the canvas (no header on a story).
    expect((await pin.boundingBox())?.y).toBe(0);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => prop(page, '.ocx-stage__items > *', '--ocx-s')).toBe('1');
    await expect.poll(() => prop(page, '[data-stage-finale]', '--ocx-f')).toBe('1');
  });

  test('reduced motion: nothing is pinned or written, everything is there', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(story('scroll-stage'));
    await settle(page);
    expect(await page.locator('.ocx-stage__pin').evaluate((el) => getComputedStyle(el).position)).toBe('static');
    expect(await prop(page, '.ocx-stage__items > *', '--ocx-e')).toBe('');
    await expect(page.locator('[data-stage-finale]')).toBeVisible();
    await page.goto(story('scroll-fade'));
    expect(await prop(page, '.ocx-fade', '--ocx-fade-o')).toBe('');
  });

  test('FeatureSection reveal follows the scroll and does not move the layout', async ({ page }) => {
    await page.goto(story('feature-section', 'eyebrow-more-reveal'));
    const section = page.locator('.ocx-feature[data-scroll]');
    await expect(section.locator('.ocx-feature__eyebrow')).toHaveText('01 · one lock');
    await expect(section.locator('.ocx-feature__more a')).toBeVisible();
    await expect.poll(() => prop(page, '.ocx-feature', '--ocx-reveal')).toBe('1');
    await expect(section).not.toHaveAttribute('data-pending');
  });

  for (const slug of [
    'scroll-stage',
    'scroll-progress',
    'scroll-fade',
    'scroll-reveal',
    'key-value-table',
    'tile-grid',
  ]) {
    test(`${slug}: axe reports no violations`, async ({ page }) => {
      await page.goto(story(slug));
      if (slug === 'scroll-stage') {
        // Axe reads the pixels as drawn: check where every item has arrived and none is struck yet.
        await page.evaluate(() =>
          scrollTo(0, (document.querySelector('.ocx-stage')!.getBoundingClientRect().height - innerHeight) * 0.3),
        );
        await expect
          .poll(async () => Number(await prop(page, '.ocx-stage__items > :last-child', '--ocx-e')))
          .toBeGreaterThan(0.99);
      }
      await settle(page);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
});
