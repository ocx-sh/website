// C-300 Logo and the Header's brand (D-R3) and motion rows (D-R7): the box is the width/height
// attributes, no image can shift it, axe is clean in both schemes, and the ecosystem chevron turns
// with a token transition that reduced motion makes instant.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const STORIES = ['/docs/stories/iconography/logo/default/', '/docs/stories/iconography/logo/states/'];
const trigger = (page: Page) => page.locator('.ocx-header__nav button[data-ocx-section="ecosystem"]');
const chevron = (page: Page) => trigger(page).locator('svg');
const isOpen = (page: Page) => page.locator('#ocx-ecosystem-menu').evaluate((el) => el.matches(':popover-open'));

/** Motion probe (plan › Motion probe): animations under `sel` naming `prop`, or any when prop is ''. */
const animations = (page: Page, sel: string, prop: string) =>
  page.evaluate(
    ([sel, prop]) =>
      document.getAnimations().filter((a) => {
        const fx = a.effect as KeyframeEffect | null;
        if (!(fx?.target instanceof Element) || !fx.target.closest(sel)) return false;
        const named = (a as CSSTransition).transitionProperty ?? fx.getKeyframes().flatMap(Object.keys).join(' ');
        return !prop || named.includes(prop);
      }).length,
    [sel, prop] as const,
  );

test.describe('Logo', () => {
  test('each mark box equals its width/height attributes with CSS applied', async ({ page }) => {
    await page.goto(STORIES[1]!);
    const boxes = await page.locator('#story .ocx-logo > svg').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return [
          el.getAttribute('width'),
          `${Math.round(r.width)}`,
          el.getAttribute('height'),
          `${Math.round(r.height)}`,
        ];
      }),
    );
    expect(boxes.map((b) => b[0])).toEqual(expect.arrayContaining(['14', '20', '38', '84']));
    for (const [w, bw, h, bh] of boxes) expect([bw, bh]).toEqual([w, h]);
  });

  for (const path of STORIES)
    test(`identical layout with images blocked (${path})`, async ({ page, context }) => {
      const layout = async () => {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        return page.locator('#story *').evaluateAll((els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect();
            return [r.x, r.y, r.width, r.height].map(Math.round).join();
          }),
        );
      };
      const loaded = await layout();
      await context.route('**/*', (r) => (r.request().resourceType() === 'image' ? r.abort() : r.continue()));
      expect(await layout()).toEqual(loaded);
    });

  for (const scheme of ['light', 'dark'] as const)
    test(`axe reports no violations on the stories (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of STORIES) {
        await page.goto(path);
        const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
        expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      }
    });
});

test.describe('Header', () => {
  test('the brand keeps its box: a 20px mark and a 0.7× mono wordmark', async ({ page }) => {
    await page.goto('/docs/');
    const brand = page.getByRole('link', { name: 'ocx home' });
    const mark = await brand.locator('svg').boundingBox();
    expect([mark?.width, mark?.height]).toEqual([20, 20]);
    const word = await brand.locator('span').evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.fontSize, s.lineHeight, s.textTransform, s.fontFamily.toLowerCase().includes('mono')];
    });
    expect(word).toEqual(['14px', '14px', 'lowercase', true]);
  });

  test.describe('ecosystem chevron motion', () => {
    test.skip(({ isMobile }) => isMobile, 'the section nav is hidden at ≤ 640px');

    test('no animation on a fresh load', async ({ page }) => {
      await page.goto('/docs/');
      await page.evaluate(() => document.fonts.ready);
      expect(await animations(page, '.ocx-header', '')).toBe(0);
    });

    test('opening the mega menu turns the chevron with a rotate transition', async ({ page }) => {
      await page.goto('/docs/');
      // Every frame from before the click (it starts the machine, then replays): the transition is short.
      const seen = page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            let n = 0;
            const tick = () => {
              const hit = document.getAnimations().some((a) => (a as CSSTransition).transitionProperty === 'rotate');
              if (hit || ++n > 300) resolve(hit);
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
      );
      await trigger(page).click();
      expect(await seen).toBe(true);
      await expect.poll(() => isOpen(page)).toBe(true);
      await expect(page.locator('.ocx-header__sections')).toHaveAttribute('data-zag-state', 'live');
      await expect(chevron(page)).toHaveCSS('rotate', '180deg');
    });

    test('with reduced motion the chevron is turned at once', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/docs/');
      await trigger(page).click();
      await expect.poll(() => isOpen(page)).toBe(true);
      expect(await chevron(page).evaluate((el) => getComputedStyle(el).rotate)).toBe('180deg');
      expect(await animations(page, '.ocx-header__nav', 'rotate')).toBe(0);
    });
  });
});
