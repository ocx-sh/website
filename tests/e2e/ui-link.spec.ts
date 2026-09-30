// C-264 Link on its story pages (stories/link/{default,states,states-2}): axe per state in both schemes, ink contrast
// on the page background, the hover underline inking, and the external / newTab / disabled markup.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { computed } from './tokens.ts';

const STATES_STORY = '/docs/stories/link/states/';
const STORIES = ['/docs/stories/link/default/', STATES_STORY, '/docs/stories/link/states-2/'];

/** The `<a>` inside the State labelled exactly `label` (first one). */
const link = (page: Page, label: string) =>
  page
    .locator('.showcase-state')
    .filter({
      has: page.locator('.showcase-state__label', { hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`) }),
    })
    .locator('a.ocx-ui-link')
    .first();

const setTheme = (page: Page, theme: string) =>
  page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);

/** WCAG contrast of a link's ink over the page background, both read as computed rgb(a). */
const contrast = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r = 0, g = 0, b = 0]: number[]) => {
      const [R = 0, G = 0, B = 0] = [r, g, b].map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * R + 0.7152 * G + 0.0722 * B;
    };
    const el = document.querySelector(s) as HTMLElement;
    let bg = 'rgba(0, 0, 0, 0)';
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (rgb(c)[3] !== 0) {
        bg = c;
        break;
      }
    }
    const [hi = 0, lo = 0] = [lum(rgb(getComputedStyle(el).color)), lum(rgb(bg))].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  }, sel);

const STATES = [
  'underline=always',
  'underline=hover',
  'underline=none',
  'tone=neutral',
  'neutral, underline=hover',
  'external (auto)',
  'external=false',
  'external, newTab',
  'newTab',
  'disabled',
  'disabled, neutral',
];

test.describe('C-264 Link', () => {
  for (const theme of ['light', 'dark']) {
    test(`Link: axe reports no violations across every state (${theme})`, async ({ page }) => {
      for (const route of STORIES) {
        await page.goto(route);
        await setTheme(page, theme);
        const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
        expect(violations.map((v) => `${route} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual(
          [],
        );
      }
    });

    test(`Link: accent and neutral ink reach 4.5:1 on the page background (${theme})`, async ({ page }) => {
      await page.goto(STATES_STORY);
      await setTheme(page, theme);
      for (const label of ['underline=always', 'tone=neutral']) {
        const a = link(page, label);
        await expect(a).toBeVisible();
        await a.evaluate((el) => el.setAttribute('data-probe', ''));
        expect(await contrast(page, 'a[data-probe]'), label).toBeGreaterThanOrEqual(4.5);
        await a.evaluate((el) => el.removeAttribute('data-probe'));
      }
    });
  }

  test('Link: every state of the showcase renders', async ({ page }) => {
    await page.goto(STATES_STORY);
    for (const label of STATES) await expect(link(page, label), label).toBeVisible();
  });

  test('Link: underline modes at rest (always underlined, hover and none plain)', async ({ page }) => {
    await page.goto(STATES_STORY);
    expect(await computed(link(page, 'underline=always'), 'text-decoration-line')).toBe('underline');
    expect(await computed(link(page, 'underline=hover'), 'text-decoration-line')).toBe('none');
    expect(await computed(link(page, 'underline=none'), 'text-decoration-line')).toBe('none');
  });

  test('Link: hover inks the underline to the text colour; underline=hover shows it; none never does', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'hover is a desktop state');
    await page.goto(STATES_STORY);
    const always = link(page, 'underline=always');
    const rest = await computed(always, 'text-decoration-color');
    await always.hover();
    await expect.poll(async () => computed(always, 'text-decoration-color')).toBe(await computed(always, 'color'));
    expect(await computed(always, 'text-decoration-color')).not.toBe(rest);

    const onHover = link(page, 'underline=hover');
    await onHover.hover();
    expect(await computed(onHover, 'text-decoration-line')).toBe('underline');

    const none = link(page, 'underline=none');
    await none.hover();
    expect(await computed(none, 'text-decoration-line')).toBe('none');

    const neutral = link(page, 'tone=neutral');
    const muted = await computed(neutral, 'color');
    await neutral.hover();
    await expect.poll(async () => computed(neutral, 'color')).not.toBe(muted);
  });

  test('Link: keyboard focus shows a square outset ring and Enter follows the link', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard is a desktop path');
    await page.goto(STATES_STORY);
    const a = link(page, 'underline=always');
    await a.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(a).toBeFocused();
    expect(await computed(a, 'outline-style')).toBe('solid');
    expect(await computed(a, 'border-radius')).toBe('0px');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#states$/);
  });

  test('Link: the external icon is named and an off-site link gets it without opening a new tab', async ({ page }) => {
    await page.goto(STATES_STORY);
    const auto = link(page, 'external (auto)');
    await expect(auto.locator('svg[data-icon="external"]')).toHaveAttribute('aria-label', '(external)');
    await expect(auto).not.toHaveAttribute('target', /.*/);
    await expect(link(page, 'external=false').locator('svg')).toHaveCount(0);
    await expect(link(page, 'underline=always').locator('svg')).toHaveCount(0);
  });

  test('Link: newTab sets target and rel and names the new tab for assistive tech', async ({ page }) => {
    await page.goto(STATES_STORY);
    const a = link(page, 'newTab');
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(a.locator('.ocx-ui-link__sr')).toHaveText('(opens in a new tab)');
    // Visually hidden yet exposed to AT: a 1px clipped box, never display:none (Playwright still calls that "visible").
    const sr = a.locator('.ocx-ui-link__sr');
    const box = await sr.boundingBox();
    expect(box && box.width <= 1 && box.height <= 1).toBe(true);
    expect(await computed(sr, 'clip-path')).not.toBe('none');
  });

  test('Link: a disabled link has no href, is not focusable and reads as subtle', async ({ page }) => {
    await page.goto(STATES_STORY);
    const a = link(page, 'disabled');
    await expect(a).not.toHaveAttribute('href', /.*/);
    await expect(a).toHaveAttribute('role', 'link');
    await expect(a).toHaveAttribute('aria-disabled', 'true');
    // Not tabIndex: Chromium reports 0 for an <a> without href even though it takes no focus.
    expect(await a.evaluate((el) => (el.focus(), document.activeElement === el))).toBe(false);
    expect(await computed(a, 'cursor')).toBe('not-allowed');
    expect(await computed(a, 'color')).not.toBe(await computed(link(page, 'underline=always'), 'color'));
  });

  test('Link: the icon never wraps alone in a paragraph', async ({ page }) => {
    await page.goto('/docs/stories/link/states-2/');
    const end = page.locator('#story .ocx-ui-link__end').first();
    await expect(end).toBeVisible();
    expect(await computed(end, 'white-space')).toBe('nowrap');
  });
});
