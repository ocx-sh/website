// Shell layout (plain Astro pages without Starlight): the chrome mounts from chrome.mjs alone.
import { expect, test, type Page } from '@playwright/test';

const OCX = '/docs/shell/';
const NEUTRAL = '/docs/shell/neutral/';
const isMobile = (testInfo: { project: { name: string } }) => testInfo.project.name === 'mobile';

async function open(page: Page, path: string) {
  const errors: string[] = [];
  // Script errors only: the ocx-mode favicon and the other sections' pages (prefetched by the mega
  // menu) are routes of other sites, so the example preview answers them with a 404.
  page.on(
    'console',
    (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()),
  );
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(path);
  return errors;
}

test.describe('ocx mode', () => {
  test.beforeEach(({ page: _page }, testInfo) =>
    test.skip(isMobile(testInfo), 'desktop width; mobile has its own test'),
  );

  test('no console errors; hovering the nav starts the machine and the mega menu opens', async ({ page }) => {
    const errors = await open(page, OCX);
    const root = page.locator('.ocx-header [data-zag-root="navigation-menu"]');
    await page.locator('nav.ocx-header__nav').hover();
    await expect(root).toHaveAttribute('data-zag-state', 'live');
    await page.locator('.ocx-header__nav button[data-ocx-section="ecosystem"]').click();
    await expect
      .poll(() => page.locator('#ocx-ecosystem-menu').evaluate((el) => el.matches(':popover-open')))
      .toBe(true);
    expect(errors).toEqual([]);
  });

  test('D-163: boxes and their ::before/::after are border-box', async ({ page }) => {
    await open(page, OCX);
    const sizing = await page.evaluate(() => {
      const el = document.body.appendChild(document.createElement('div'));
      return ['', '::before', '::after'].map((p) => getComputedStyle(el, p || null).boxSizing);
    });
    expect(sizing).toEqual(['border-box', 'border-box', 'border-box']);
  });

  test('the theme toggle flips data-theme and persists starlight-theme', async ({ page }) => {
    await open(page, OCX);
    const before = await page.evaluate(() => document.documentElement.dataset['theme']);
    await page.locator('[data-ocx-theme]').first().click();
    const after = before === 'dark' ? 'light' : 'dark';
    await expect(page.locator('html')).toHaveAttribute('data-theme', after);
    expect(await page.evaluate(() => localStorage.getItem('starlight-theme'))).toBe(after);
  });

  test('ocx:toast shows a toast', async ({ page }) => {
    await open(page, OCX);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('ocx:toast', { detail: { title: 'Hello' } })));
    await expect(page.locator('[data-zag-root="toast"] [data-part="root"][data-state="open"]')).toHaveCount(1);
  });
});

test('at 390px the menu popover lists the sections', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'mobile project only');
  await open(page, OCX);
  await page.locator('button.ocx-header__menu').click();
  await expect(page.locator('#ocx-header-menu')).toBeVisible();
  await expect(page.locator('#ocx-header-menu a')).not.toHaveCount(0);
});

test('neutral mode: brand and links present, no ecosystem menu, aria-current right', async ({ page }) => {
  await open(page, NEUTRAL);
  await expect(page.locator('.ocx-mega')).toHaveCount(0);
  await expect(page.locator('.ocx-header__brand')).toContainText('example');
  await expect(page.locator('.ocx-header__nav a[href="/docs/shell/neutral/"]')).toHaveAttribute('aria-current', 'page');
  // D-126: "/docs/shell/" is a prefix of the current path too, but only the longest match is current.
  await expect(page.locator('.ocx-header__nav a')).toHaveCount(2);
  await expect(page.locator('.ocx-header__nav a[aria-current]')).toHaveCount(1);
  await expect(page.locator('.ocx-header__nav a[href="/docs/shell/"]')).not.toHaveAttribute('aria-current', /.*/);
});

const WIDE = '/docs/shell/wide/';
const FULL = '/docs/shell/full/';

test.describe('desktop layout', () => {
  test.beforeEach(({ page: _page }, testInfo) => test.skip(isMobile(testInfo), 'desktop width'));

  test('D-005 D-110: main is 824px on prose, the page maximum on wide, the whole viewport on full', async ({
    page,
  }) => {
    const width = async (path: string) => {
      await open(page, path);
      return page.locator('main').evaluate((m) => ({ main: m.getBoundingClientRect().width, view: innerWidth }));
    };
    const prose = await width(NEUTRAL);
    expect(prose.main).toBeLessThanOrEqual(824);
    const wide = await width(WIDE);
    expect(wide.main).toBeGreaterThan(824);
    expect(wide.main).toBeLessThanOrEqual(1400);
    const full = await width(FULL);
    expect(full.main).toBe(full.view);
  });

  test('D-128: on a short page the footer ends at the viewport bottom', async ({ page }) => {
    await open(page, NEUTRAL);
    const gap = await page.evaluate(
      () => innerHeight - document.querySelector('.ocx-shell__footer')!.getBoundingClientRect().bottom,
    );
    expect(Math.abs(gap)).toBeLessThanOrEqual(1);
  });

  test('D-126 D-137: nested nav marks one link current; external links open in a new tab with the icon', async ({
    page,
  }) => {
    await open(page, WIDE);
    await expect(page.locator('.ocx-header__nav a[aria-current]')).toHaveText(['Wide']);
    for (const where of ['.ocx-header__nav', '.ocx-footer']) {
      const link = page.locator(`${where} a[href="https://example.com/source/"]`);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      await expect(link.locator('svg[data-icon="external"]')).toBeVisible();
    }
  });

  test('D-141: a header with no nav has no menu button', async ({ page }) => {
    await open(page, FULL);
    await expect(page.locator('.ocx-header__menu')).toHaveCount(0);
  });
});

test.describe('scheme', () => {
  test.beforeEach(({ page: _page }, testInfo) => test.skip(isMobile(testInfo), 'desktop width'));

  test('D-127: data-theme and the dark class travel together, before and after a click', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('starlight-theme', 'dark'));
    await open(page, OCX);
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.locator('[data-ocx-theme]').first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  });

  test('D-132: a 0.5.x vitepress-theme-appearance choice is honoured on the first visit', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => localStorage.setItem('vitepress-theme-appearance', 'dark'));
    await open(page, OCX);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('D-133: with no stored choice the page follows a live OS change', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page, OCX);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });

  test('D-133: a click back to the OS scheme stores auto', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page, OCX);
    await page.locator('[data-ocx-theme]').first().click(); // light -> dark: pinned
    expect(await page.evaluate(() => localStorage.getItem('starlight-theme'))).toBe('dark');
    await page.locator('[data-ocx-theme]').first().click(); // dark -> light, the OS scheme
    expect(await page.evaluate(() => localStorage.getItem('starlight-theme'))).toBe('auto');
  });

  test('the glyph is the state and is visible at first paint, before any script syncs it', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, OCX);
    const visible = (icon: string) =>
      page
        .locator(`[data-ocx-theme] [data-icon="${icon}"]`)
        .first()
        .evaluate((el) => getComputedStyle(el).opacity === '1' && getComputedStyle(el).visibility === 'visible');
    // Unsync it as the page would be before the script ran: no glyph is `current`, the SSR state is light.
    await page.evaluate(() => {
      for (const g of document.querySelectorAll('.ocx-ui-cycle-button__current'))
        g.classList.remove('ocx-ui-cycle-button__current');
      document.querySelector('[data-ocx-theme] [data-icon="sun"]')?.classList.add('ocx-ui-cycle-button__current');
    });
    expect(await visible('moon')).toBe(true);
    expect(await visible('sun')).toBe(false);
  });
});

test.describe('catalog chrome', () => {
  test.beforeEach(({ page: _page }, testInfo) => test.skip(isMobile(testInfo), 'desktop width'));

  test('D-138: a home link with match "prefix" is current under it', async ({ page }) => {
    await open(page, '/docs/shell/prefix/');
    await expect(page.locator('.ocx-header__nav a[aria-current]')).toHaveText(['Catalog']);
  });

  test("D-139: ocx chrome shows the page's own header link; it alone is current", async ({ page }) => {
    await open(page, '/docs/shell/extras/');
    const link = page.locator('.ocx-header__nav a[href="/docs/shell/extras/"]');
    await expect(link).toHaveText('Extras');
    await expect(link).toHaveAttribute('title', 'This page');
    await expect(page.locator('.ocx-header__nav [aria-current]')).toHaveCount(1);
    await expect(link).toHaveAttribute('aria-current', 'page');
  });

  test("D-135: the footer appends the page's own link last, with its tooltip", async ({ page }) => {
    await open(page, '/docs/shell/extras/');
    const last = page.locator('.ocx-footer__links a').last();
    await expect(last).toHaveAttribute('href', '/docs/shell/extras/data.json');
    await expect(last).toHaveAttribute('title', 'Not the index wire format');
    expect(await page.locator('.ocx-footer__links a').count()).toBeGreaterThan(1);
  });

  test("D-158: a configured icon is the page's only rel=icon", async ({ page }) => {
    await open(page, '/docs/shell/extras/');
    await expect(page.locator('link[rel="icon"]')).toHaveCount(1);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/docs/shell/extras/icon.svg');
    await open(page, OCX);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /favicon\.svg$/);
  });
});

test.describe('footer stamp', () => {
  test.beforeEach(({ page: _page }, testInfo) => test.skip(isMobile(testInfo), 'desktop width'));

  // A page may append a node to the footer after load (the catalog's "updated 5m ago"). The licence
  // and the links are already painted: neither may move, so CLS stays 0.
  const appendStamp = (page: Page) =>
    page.evaluate(async () => {
      const footer = document.querySelector('.ocx-footer')!;
      const rects = () =>
        [...footer.querySelectorAll('.ocx-footer__links, .ocx-footer__license')].map((el) => {
          const r = el.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height].map(Math.round).join(',');
        });
      let shift = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) shift += (e as unknown as { value: number }).value;
      }).observe({ type: 'layout-shift' });
      const before = rects();
      const stamp = document.createElement('span');
      stamp.textContent = 'updated just now';
      footer.append(stamp);
      await new Promise((r) => setTimeout(r, 300));
      return { before, after: rects(), shift };
    });

  for (const [mode, path] of [
    ['ocx', OCX],
    ['neutral', NEUTRAL],
  ] as const)
    test(`D-136 an appended footer stamp moves nothing already painted: ${mode} mode`, async ({ page }) => {
      await open(page, path);
      const { before, after, shift } = await appendStamp(page);
      expect(before.length).toBeGreaterThan(0);
      expect(after).toEqual(before);
      expect(shift).toBe(0);
    });

  test('D-136 control: without the footer order rules the appended stamp does move the licence', async ({ page }) => {
    await open(page, OCX);
    await page.addStyleTag({
      content: '.ocx-footer__links{margin-inline-end:0 !important}.ocx-footer>*{order:0 !important}',
    });
    const { before, after } = await appendStamp(page);
    expect(after).not.toEqual(before);
  });
});

test('the footer rule is a line: beside the footer box it paints nothing', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'desktop width: the footer keeps the column inset');
  await open(page, OCX);
  const footer = page.locator('.ocx-footer');
  await footer.scrollIntoViewIfNeeded();
  const box = (await footer.boundingBox())!;
  expect(box.x, 'no strip beside the footer to look at').toBeGreaterThan(8);
  // The strip left of the box, below the rule.
  const shot = () => page.screenshot({ clip: { x: 0, y: box.y, width: box.x, height: box.height } });
  const painted = await shot();
  await footer.evaluate((el) => (el.style.visibility = 'hidden'));
  expect((await shot()).equals(painted), 'the footer paints beside its box').toBe(true);
});
