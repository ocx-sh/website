// WP13.1 Terminal: the asciinema cast player on its story pages: a collapsed terminal
// (/docs/stories/terminal/default/) and an open one with cols/rows given (.../open/).
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';
import { settle } from './helpers/settle.ts';

const STORY = '/docs/stories/terminal/';
const PAGE = `${STORY}default/`; // collapsed
const OPEN_PAGE = `${STORY}open/`; // open, cols and rows given
const COLLAPSED_CAST = '/docs/casts/fixture/getting-started-install.cast';
const OPEN_CAST = '/docs/casts/fixture/getting-started-index.cast';
// Vite chunk names do not carry "asciinema": the player's assets are the JS/CSS requested only after the trigger.
const isAsset = (r: Request) => /\.(m?js|css)$/.test(new URL(r.url()).pathname);
const assetUrls = (seen: Request[]) => new Set(seen.filter(isAsset).map((r) => r.url()));
/** JS and CSS first requested after `before` was taken; both kinds must appear (player JS + its vendor CSS). */
async function expectNewPlayerAssets(page: Page, seen: Request[], before: Set<string>) {
  await expect(page.locator('.ap-player').first()).toBeVisible();
  const fresh = [...assetUrls(seen)].filter((u) => !before.has(u));
  expect(
    fresh.some((u) => u.endsWith('.js')),
    `player JS loaded lazily: ${fresh.join(', ')}`,
  ).toBe(true);
  expect(
    fresh.some((u) => u.endsWith('.css')),
    `player CSS loaded lazily: ${fresh.join(', ')}`,
  ).toBe(true);
}

const collapsed = (page: Page) =>
  page.locator('.ocx-terminal').filter({ has: page.locator('button.ocx-terminal__chrome') });
const open = (page: Page) =>
  page.locator('.ocx-terminal').filter({ hasNot: page.locator('button.ocx-terminal__chrome') });
const toggle = (page: Page) => collapsed(page).locator('button.ocx-terminal__chrome');

/** Record every request the page makes, from before navigation. */
function recordRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (r) => seen.push(r));
  return seen;
}

test('WP13.1 Terminal: prefetches its cast on load, before any click (2210983da)', async ({ page }) => {
  for (const [path, cast] of [
    [PAGE, COLLAPSED_CAST],
    [OPEN_PAGE, OPEN_CAST],
  ] as const) {
    const seen = recordRequests(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(
      seen.map((r) => new URL(r.url()).pathname).filter((p) => p.endsWith('.cast')),
      path,
    ).toContain(cast);
  }
});

test('WP13.1 Terminal: base-URL resolution — casts are requested under /docs/ and answer 200 (WP13.1)', async ({
  page,
}) => {
  const responses: [string, number][] = [];
  page.on('response', (r) => {
    if (r.url().endsWith('.cast')) responses.push([new URL(r.url()).pathname, r.status()]);
  });
  for (const path of [PAGE, OPEN_PAGE]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(responses.length).toBeGreaterThanOrEqual(2);
  for (const [path, status] of responses) {
    expect(path).toMatch(/^\/docs\/casts\//);
    expect(status).toBe(200);
  }
  await expect(page.locator('.ocx-terminal[data-src^="/docs/docs/"]')).toHaveCount(0);
});

test('WP13.1 Terminal: no asciinema-player JS/CSS is requested before the first expand (Lighthouse)', async ({
  page,
}) => {
  const seen = recordRequests(page);
  await page.goto(PAGE);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.ap-player')).toHaveCount(0);
  const before = assetUrls(seen);
  await toggle(page).click();
  await expectNewPlayerAssets(page, seen, before);
});

test('WP13.1 Terminal: an open terminal loads its player on first hover/focus, not on load, and does not autoplay (DOC-EX-15)', async ({
  page,
}) => {
  const seen = recordRequests(page);
  await page.goto(OPEN_PAGE);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.ap-player')).toHaveCount(0);
  const before = assetUrls(seen);
  await open(page).hover();
  await expectNewPlayerAssets(page, seen, before);
  await expect(open(page).locator('.ap-player')).toBeVisible();
  // Not playing: the theme's start poster stays up and the clock stays at zero.
  await page.waitForTimeout(1500);
  await expect(open(page).locator('.ocx-terminal__start')).toBeVisible();
  await expect(open(page).locator('.ocx-terminal__current')).toHaveText(/^0?0:00$/);
});

test('WP13.1 Terminal: the player parses the pinned-version fixture cast (DOC-EX-14)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(PAGE);
  await toggle(page).click();
  const c = collapsed(page);
  await expect(c.locator('.ap-player')).toBeVisible();
  await expect(c.locator('.ap-overlay-error')).toHaveCount(0);
  // The recording's own first output ("$ ocx package install …") reaches the terminal.
  await expect(c.locator('.ap-term')).toContainText('$ ocx', { timeout: 5000 });
  expect(errors).toEqual([]);
});

test('WP13.1 Terminal: mouse click toggles aria-expanded and the player area (WP13.1)', async ({ page }) => {
  await page.goto(PAGE);
  const button = toggle(page);
  const area = collapsed(page).locator('.ocx-terminal__player');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(area).toBeHidden();
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(area).toBeVisible();
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(area).toBeHidden();
});

for (const key of ['Enter', 'Space'] as const) {
  test(`WP13.1 Terminal: keyboard ${key} on the focused chrome toggles aria-expanded (WP13.1)`, async ({ page }) => {
    await page.goto(PAGE);
    const button = toggle(page);
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press(key);
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(collapsed(page).locator('.ocx-terminal__player')).toBeVisible();
    await page.keyboard.press(key);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });
}

test("WP13.1 Terminal: the chrome button's keyboard focus ring is the theme focus token (WP13.1)", async ({ page }) => {
  await page.goto(PAGE);
  await toggle(page).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(toggle(page)).toBeFocused();
  const [style, colour, token] = await toggle(page).evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--ocx-color-focus)';
    document.body.append(probe);
    const t = getComputedStyle(probe).color;
    probe.remove();
    const s = getComputedStyle(el);
    return [s.outlineStyle, s.outlineColor, t];
  });
  expect(style).not.toBe('none');
  expect(colour).toBe(token);
});

test('WP13.1 Terminal: expanding autoplays; collapsing pauses and rewinds to 0:00 (146611f12)', async ({ page }) => {
  await page.goto(PAGE);
  const c = collapsed(page);
  await toggle(page).click();
  const elapsed = c.locator('.ocx-terminal__current');
  await expect(elapsed).not.toHaveText(/^0?0:00$/, { timeout: 5000 });
  await toggle(page).click();
  await expect(elapsed).toHaveText(/^0?0:00$/);
  await page.waitForTimeout(1200);
  await expect(elapsed).toHaveText(/^0?0:00$/);
});

test('WP13.1 Terminal: under prefers-reduced-motion expanding does not autoplay (DOC-EX-17)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  await toggle(page).click();
  const c = collapsed(page);
  await expect(c.locator('.ap-player')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(c.locator('.ocx-terminal__current')).toHaveText(/^0?0:00$/);
});

test('WP13.1 Terminal: under prefers-reduced-motion the chevron and chrome hover do not transition (DOC-EX-17)', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const durations = await toggle(page).evaluate((b) =>
    [b, b.querySelector('.ocx-terminal__chevron')!].map((e) => getComputedStyle(e).transitionDuration),
  );
  expect(durations).toEqual(['0s', '0s']);
});

test('WP13.1 Terminal: not-content — no Starlight prose margin between chrome and player or inside the player (L2)', async ({
  page,
}) => {
  await page.goto(PAGE);
  await toggle(page).click();
  const c = collapsed(page);
  await expect(c.locator('.ocx-terminal__controls')).toHaveCount(1);
  // One evaluate: expand smooth-scrolls, so two separate reads can straddle a scroll frame.
  const gap = await c.evaluate(
    (root) =>
      root.querySelector('.ocx-terminal__player')!.getBoundingClientRect().top -
      root.querySelector('.ocx-terminal__chrome')!.getBoundingClientRect().bottom,
  );
  expect(Math.abs(gap)).toBeLessThanOrEqual(1);
});

// asciinema-player's own bar is off (`controls: false`); our bar replaces it, so DOC-EX-16's intent
// (accessible, labelled transport controls stay available) is met by our own accessible-name checks
// here instead of the upstream `.ap-control-bar` markup the mechanical grep in that rule expects.
test('WP13.1 Terminal: the custom control bar replaces asciinema-player’s own and stays accessible (DOC-EX-16)', async ({
  page,
}) => {
  await page.goto(PAGE);
  await toggle(page).click();
  const c = collapsed(page);
  await expect(c.locator('.ap-player')).toBeVisible();
  await expect(c.locator('.ap-control-bar')).toHaveCount(0);
  const controls = c.locator('.ocx-terminal__controls');
  await expect(controls).toBeVisible();
  const play = controls.locator('.ocx-terminal__play');
  await expect(play).toHaveAttribute('aria-label', 'Play');
  await expect(controls.locator('.ocx-terminal__seek')).toHaveAttribute('aria-label', 'Seek');
  await expect(controls.locator('.ocx-terminal__fullscreen')).toHaveAttribute('aria-label', 'Full screen');
  await play.click();
  await expect(play).toHaveAttribute('aria-label', 'Pause');
});

test('WP13.1 Terminal: player wears the ocx theme and the mono token font (WP13.1)', async ({ page }) => {
  await page.goto(PAGE);
  await toggle(page).click();
  const themed = collapsed(page).locator('.asciinema-player-theme-ocx');
  await expect(themed).toHaveCount(1);
  const [fg, bg] = await themed.evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.getPropertyValue('--term-color-foreground').trim(), s.getPropertyValue('--term-color-background').trim()];
  });
  expect(fg).not.toBe('');
  expect(bg).not.toBe('');
  const [termFont, mono] = await collapsed(page)
    .locator('.ap-term')
    .evaluate((el) => [
      getComputedStyle(el).fontFamily,
      getComputedStyle(document.documentElement).getPropertyValue('--ocx-font-mono').trim(),
    ]);
  expect(mono).not.toBe('');
  expect(termFont.split(',')[0]?.replace(/["']/g, '').trim()).toBe(mono.split(',')[0]?.replace(/["']/g, '').trim());
});

test('WP13.1 Terminal: a missing cast shows visible text instead of a blank player (WP13.1)', async ({ page }) => {
  await page.route('**/getting-started-install.cast', (r) => r.fulfill({ status: 404, body: 'not found' }));
  await page.goto(PAGE);
  await toggle(page).click();
  await expect(collapsed(page).locator('.ocx-terminal__player')).not.toHaveText(/^\s*$/);
});

test('WP13.1 Terminal: CLS is 0 on load and while the open player loads (Lighthouse)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
        if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(OPEN_PAGE, { waitUntil: 'domcontentloaded' });
  // Only terminal-caused shifts count: a cold web-font swap shifts text (~0.0007), not ours.
  await page.evaluate(async () => {
    await document.fonts.ready;
    (window as unknown as { __cls: number }).__cls = 0;
  });
  const reserved = await open(page)
    .locator('.ocx-terminal__player')
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(reserved, 'open terminal reserves its player height before the player loads').toBeGreaterThan(100);
  await open(page).hover(); // the player loads on first interaction; a hover is not a recent input for CLS
  await expect(open(page).locator('.ap-player')).toBeVisible();
  await page.waitForTimeout(500);
  const after = await open(page)
    .locator('.ocx-terminal__player')
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.abs(after - reserved), 'player height matches the reserved height').toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
});

for (const theme of ['light', 'dark'] as const) {
  test(`WP13.1 Terminal: axe reports no violations, both terminals rendered (${theme})`, async ({ page }) => {
    await page.goto(PAGE);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await settle(page); // axe must read final colours, not a theme crossfade
    await toggle(page).click();
    await expect(page.locator('.ap-player')).toHaveCount(1);
    const first = await new AxeBuilder({ page }).include('#story').analyze();
    await page.goto(OPEN_PAGE);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await settle(page); // axe must read final colours, not a theme crossfade
    await open(page).hover();
    await expect(page.locator('.ap-player')).toHaveCount(1);
    const second = await new AxeBuilder({ page }).include('#story').analyze();
    expect(
      [...first.violations, ...second.violations].map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      ),
    ).toEqual([]);
  });
}

test('Terminal: control bar sits at the bottom, seek focus ring is inset, fullscreen toggles', async ({ page }) => {
  await page.goto(PAGE);
  await toggle(page).click();
  const c = collapsed(page);
  const controls = c.locator('.ocx-terminal__controls');
  await expect(controls).toBeVisible();
  const below = await c.evaluate(
    (root) =>
      root.querySelector('.ocx-terminal__controls')!.getBoundingClientRect().top >=
      root.querySelector('.ap-player')!.getBoundingClientRect().bottom - 1,
  );
  expect(below).toBe(true);
  const [offset, inset] = await controls.locator('.ocx-terminal__seek').evaluate((el) => {
    el.focus({ focusVisible: true });
    return [
      getComputedStyle(el).outlineOffset,
      getComputedStyle(document.documentElement).getPropertyValue('--ocx-focus-offset-inset').trim(),
    ];
  });
  expect(parseFloat(offset)).toBeLessThan(0);
  expect(inset).not.toBe('');
  const fs = controls.locator('.ocx-terminal__fullscreen');
  if (await fs.isVisible()) {
    await fs.click();
    await expect.poll(() => c.evaluate((root) => document.fullscreenElement === root)).toBe(true);
    // The bar stays on screen in fullscreen, below the whole terminal (it once fell off the bottom).
    await expect(fs).toBeInViewport({ ratio: 1 });
    await expect(c.locator('.ap-player')).toBeInViewport({ ratio: 0.99 });
    await fs.click();
    await expect.poll(() => c.evaluate(() => document.fullscreenElement === null)).toBe(true);
  }
});
