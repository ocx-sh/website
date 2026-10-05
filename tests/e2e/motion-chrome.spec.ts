// C-302 / D-R7 motion on the chrome (plan 'Refinement 2026-09-30', audit rows R6): the mega menu, a
// sidebar group, the TOC marker, a prose <details> and the theme switch (D-R9). Each test changes
// the state in the page, waits two frames and reads what runs (the plan's Motion probe, inline);
// under reduced motion the same change is final at once and nothing runs.
import { expect, test, type Page } from '@playwright/test';
import { settle } from './helpers/settle.ts';

const LONG = '/docs/probe/long/';

/** Runs the expression `act`, waits two frames, and names each transition/animation running in `scope`. */
async function probe(page: Page, scope: string, act: string): Promise<string[]> {
  if (act) await page.evaluate(act);
  return page.evaluate(async (s) => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const root = document.querySelector(s);
    return document.getAnimations().flatMap((x) => {
      const t = (x.effect as KeyframeEffect | null)?.target;
      if (!root || !t || !(root === t || root.contains(t))) return [];
      return [x instanceof CSSTransition ? x.transitionProperty : x instanceof CSSAnimation ? x.animationName : 'js'];
    });
  }, scope);
}

test('D-R7 first paint is final: a fresh content page runs no animation before any input', async ({ page }) => {
  await page.goto(LONG);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  expect(await probe(page, 'html', '')).toEqual([]);
});

test('R6 mega menu: opens and closes with a fade and slide; reduced motion snaps', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the header nav is hidden at ≤ 640px');
  const menu = '#ocx-ecosystem-menu';
  const click = `document.querySelector('.ocx-header__nav button[data-ocx-section="ecosystem"]').click()`;
  await page.goto('/docs/');
  await page.locator('nav.ocx-header__nav').hover();
  await expect(page.locator('.ocx-header [data-zag-root="navigation-menu"]')).toHaveAttribute('data-zag-state', 'live');
  await page.mouse.move(2, 600); // off the nav: hover-open/close must not race the clicks

  expect(await probe(page, menu, click)).toEqual(expect.arrayContaining(['opacity', 'translate']));
  expect(await page.locator(menu).evaluate((el) => el.matches(':popover-open'))).toBe(true);
  await settle(page); // closing mid-entry reverses it, and a loaded host reads after the short reversal ends
  // Exit: the panel stays rendered while it fades (display/overlay allow-discrete).
  expect(await probe(page, menu, click)).toEqual(expect.arrayContaining(['opacity']));
  expect(await page.locator(menu).evaluate((el) => el.matches(':popover-open'))).toBe(false);
  await expect(page.locator(menu)).toBeHidden();

  // Hub switch: the incoming panel crossfades in.
  await probe(page, menu, click);
  const tab = `document.querySelectorAll('${menu} .ocx-mega__tab')[1].click()`;
  expect(await probe(page, `${menu} .ocx-mega__body`, tab)).toEqual(expect.arrayContaining(['opacity']));

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await probe(page, menu, click)).toEqual([]);
  await expect(page.locator(menu)).toBeHidden();
});

test('R6 sidebar group: opens and closes by the disclosure pattern; reduced motion snaps', async ({ page }) => {
  test.skip(narrow(page), 'desktop sidebar (≥ 50em) only');
  const group = '#starlight__sidebar [data-zag-root="collapsible"]:has(> [data-part="content"][hidden])';
  await page.goto(LONG);
  const root = page.locator(group).first();
  const id = await root.getAttribute('data-zag-id');
  const scope = `#starlight__sidebar [data-zag-id="${id}"]`;
  const click = `document.querySelector('${scope} > [data-part="trigger"]').click()`;
  await root.hover();
  await expect(root).toHaveAttribute('data-zag-state', 'live');

  expect(await probe(page, scope, click)).toEqual(expect.arrayContaining(['height', 'opacity']));
  await settle(page); // closing mid-opening reverses it, and a loaded host reads after the short reversal ends
  expect(await probe(page, scope, click)).toEqual(expect.arrayContaining(['height', 'opacity']));

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await probe(page, scope, click)).toEqual([]);
  await expect(page.locator(`${scope} > [data-part="content"]`)).toBeVisible();
});

test('R6 TOC: the current marker fades to the next entry on scroll; reduced motion snaps', async ({ page }) => {
  test.skip(narrow(page), 'the desktop outline (right sidebar) only');
  await page.goto(LONG);
  const toc = 'starlight-toc';
  const to = (id: string) => `document.getElementById('${id}').scrollIntoView()`;
  // Chromium names the logical property by its physical side (LTR page).
  expect(await probe(page, toc, to('work-offline'))).toEqual(expect.arrayContaining(['color', 'border-left-color']));
  await expect(page.locator(`${toc} a[aria-current="true"]`)).not.toHaveAttribute('href', '#_top');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await probe(page, toc, `scrollTo(0, 0)`)).toEqual([]);
  await expect(page.locator(`${toc} a[aria-current="true"]`)).toHaveAttribute('href', '#_top');
});

test('R6 prose <details>: the content box grows and shrinks; reduced motion snaps', async ({ page }) => {
  await page.goto(LONG);
  // No fixture page carries a prose <details>: one goes into the content after load.
  await page.evaluate(async () => {
    const d = document.createElement('details');
    d.id = 'probe-details';
    d.innerHTML = '<summary>More</summary><p>Hidden until opened.</p>';
    document.querySelector('.sl-markdown-content')?.prepend(d);
    // Rendered closed first, as a page's own <details> is before anyone opens it.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  // Chromium reports ::details-content transitions neither in getAnimations() nor as events, so
  // the probe reads the box itself: `ms` after a toggle, under a 2s token (long enough that a busy
  // host cannot finish it early), a size strictly between closed and open means it is moving.
  const toggle = (ms: number, duration = '') =>
    page.locator('#probe-details').evaluate(
      async (d: HTMLDetailsElement, [wait, token]) => {
        d.style.setProperty('--ocx-duration-moderate', token);
        d.open = !d.open;
        await new Promise((r) => setTimeout(r, wait));
        await new Promise((r) => requestAnimationFrame(r));
        return parseFloat(getComputedStyle(d, '::details-content').blockSize);
      },
      [ms, duration] as const,
    );
  const opening = await toggle(300, '2s');
  await toggle(400);
  const full = await toggle(400);
  const closing = await toggle(300, '2s'); // from fully open: a reversed transition would be shortened
  for (const size of [opening, closing]) {
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(full);
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await toggle(0)).toBe(full);
  await expect(page.locator('#probe-details p')).toBeVisible();
});

test.describe('D-R9 theme switch', () => {
  /** Clicks the theme toggle; reports the flip, the view transition and any control transition. */
  const flip = (page: Page) =>
    page.evaluate(async () => {
      const html = document.documentElement;
      const before = html.dataset['theme'];
      document.querySelector<HTMLElement>('button[data-ocx-theme]')?.click();
      const atOnce = html.dataset['theme'] !== before;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const all = document.getAnimations();
      return {
        atOnce,
        flipped: html.dataset['theme'] !== before,
        crossfade: all.some((a) => ((a.effect as KeyframeEffect | null)?.pseudoElement ?? '').startsWith('::view-')),
        transitions: all.filter((a) => a instanceof CSSTransition).map((a) => a.transitionProperty),
      };
    });
  const switching = (page: Page) => page.evaluate(() => document.documentElement.hasAttribute('data-ocx-theme-switch'));

  test('a view transition crossfades the page; no control fades its own colours meanwhile', async ({ page }) => {
    await page.goto(LONG);
    expect(await flip(page)).toEqual({ atOnce: false, flipped: true, crossfade: true, transitions: [] });
    expect(await switching(page)).toBe(true);
    await expect.poll(() => switching(page)).toBe(false);
  });

  test('reduced motion: the switch is final at once, with no crossfade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(LONG);
    expect(await flip(page)).toEqual({ atOnce: true, flipped: true, crossfade: false, transitions: [] });
    expect(await switching(page)).toBe(false);
  });
});

/** The desktop-only rows skip on the mobile project (a 390px viewport). */
function narrow(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 800;
}
