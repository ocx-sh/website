// The folding outline (TableOfContents.astro, `foldOutline`): on the desktop outline the section being read is open and
// follows the scroll, a section set by hand keeps that state, the controls are real disclosures (keyboard, names, folded
// rows out of the tab order, 24px targets), first paint is final (no shift at load, a jump opens its section before
// paint), and without JS every row shows. The phone outline never folds; its list is parsed in on the first open.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settle } from './helpers/settle.ts';

// Five sections, seven subsections under four of them (13 rows with Overview).
const PAGE = '/docs/probe/outline/';
const SECTIONS = ['Prepare the archive', 'Push the package', 'Describe it', 'Verify the result'];

const button = (page: Page, title: string) =>
  page.locator('starlight-toc').getByRole('button', { name: `Subsections of ${title}`, exact: true });
const list = (page: Page, title: string) => button(page, title).locator('xpath=following-sibling::ul');
const to = (page: Page, id: string) => page.evaluate((i) => document.getElementById(i)?.scrollIntoView(), id);
const expanded = (page: Page) =>
  Promise.all(SECTIONS.map((title) => button(page, title).getAttribute('aria-expanded')));

test.describe('desktop outline', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');
  test.use({ viewport: { width: 1400, height: 800 } });

  test('a section with subsections has a button and starts folded; the others, and short outlines, have none', async ({
    page,
  }) => {
    await page.goto(PAGE);
    await expect(page.locator('starlight-toc button:visible')).toHaveCount(SECTIONS.length);
    expect(await expanded(page)).toEqual(['false', 'false', 'false', 'false']);
    for (const title of SECTIONS) await expect(list(page, title)).toBeHidden();
    await expect(page.locator('starlight-toc a:visible')).toHaveCount(6); // Overview and the five section titles
    // A section's title stays a link to its heading.
    await expect(page.locator('starlight-toc').getByRole('link', { name: 'Push the package' })).toHaveAttribute(
      'href',
      '#push-the-package',
    );
    for (const short of ['/docs/components/dialog-presets/', '/docs/probe/terminal/']) {
      await page.goto(short); // 7 and 4 rows
      await expect(page.locator('starlight-toc a').first()).toBeVisible();
      await expect(page.locator('starlight-toc button')).toHaveCount(0);
    }
  });

  test('the section being read opens and follows the scroll', async ({ page }) => {
    await page.goto(PAGE);
    await to(page, 'write-the-metadata');
    await expect(button(page, 'Prepare the archive')).toHaveAttribute('aria-expanded', 'true');
    await expect(list(page, 'Prepare the archive')).toBeVisible();
    await expect(page.locator('starlight-toc a[aria-current="true"]')).toHaveAttribute('href', '#write-the-metadata');
    await to(page, 'pick-the-tag');
    await expect(button(page, 'Push the package')).toHaveAttribute('aria-expanded', 'true');
    await expect(button(page, 'Prepare the archive')).toHaveAttribute('aria-expanded', 'false');
    await expect(list(page, 'Prepare the archive')).toBeHidden();
    await to(page, '_top');
    await expect.poll(() => expanded(page)).toEqual(['false', 'false', 'false', 'false']);
  });

  test('a section opened by hand stays open; one closed by hand stays closed, its title carrying the mark', async ({
    page,
  }) => {
    await page.goto(PAGE);
    await button(page, 'Describe it').click();
    await expect(button(page, 'Describe it')).toHaveAttribute('aria-expanded', 'true');
    await to(page, 'lay-out-the-tree');
    await expect(button(page, 'Prepare the archive')).toHaveAttribute('aria-expanded', 'true');
    await to(page, 'pick-the-tag');
    await expect(button(page, 'Push the package')).toHaveAttribute('aria-expanded', 'true');
    expect(await expanded(page)).toEqual(['false', 'true', 'true', 'false']);

    await button(page, 'Push the package').click(); // the section being read, closed by hand
    await expect(button(page, 'Push the package')).toHaveAttribute('aria-expanded', 'false');
    await to(page, 'push-the-package');
    await to(page, 'authenticate');
    await expect(page.locator('starlight-toc a[aria-current="true"]')).toHaveAttribute('href', '#authenticate');
    await expect(button(page, 'Push the package')).toHaveAttribute('aria-expanded', 'false');
    // The folded section's title wears the current row's colour and bar; another title does not.
    const look = (href: string) =>
      page
        .locator(`starlight-toc a[href="${href}"]`)
        .evaluate((a) => [getComputedStyle(a).color, getComputedStyle(a).borderInlineStartColor].join());
    await settle(page);
    expect(await look('#push-the-package')).not.toBe(await look('#announce-it'));
    await button(page, 'Push the package').click(); // open: the row itself carries the mark again
    await settle(page);
    expect(await look('#push-the-package')).toBe(await look('#announce-it'));
  });

  test('keyboard: Tab reaches the title, then its button, then skips the folded rows; Enter and Space toggle', async ({
    page,
  }) => {
    await page.goto(PAGE);
    const prepare = button(page, 'Prepare the archive');
    await page.locator('starlight-toc a[href="#prepare-the-archive"]').focus();
    await page.keyboard.press('Tab');
    await expect(prepare).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('starlight-toc a[href="#push-the-package"]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(prepare).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await expect(page.locator('starlight-toc a[href="#lay-out-the-tree"]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press(' ');
    await expect(prepare).toHaveAttribute('aria-expanded', 'false');
    await expect(prepare).toBeFocused();
  });

  test('a section holding the focus does not fold under it', async ({ page }) => {
    await page.goto(PAGE);
    await to(page, 'lay-out-the-tree');
    await expect(button(page, 'Prepare the archive')).toHaveAttribute('aria-expanded', 'true');
    await page.locator('starlight-toc a[href="#write-the-metadata"]').focus();
    await to(page, 'pick-the-tag');
    await expect(button(page, 'Push the package')).toHaveAttribute('aria-expanded', 'true');
    await expect(button(page, 'Prepare the archive')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('starlight-toc a[href="#write-the-metadata"]')).toBeFocused();
  });

  // At the top; after a jump, which opens its section before paint; and on a screen taller than the page, where the
  // spy's first pass lands in the last section at load: that section stays folded (its title marked) until the reader moves.
  for (const [name, hash, height, last] of [
    ['at the top', '', 800, 'false'],
    ['after a jump, which opens its section', '#check-the-digest', 800, 'true'],
    ['with the spy landing in a folded section', '', 4800, 'false'],
  ] as const) {
    test(`first paint is final ${name}: the outline never shifts at load`, async ({ page }) => {
      await page.setViewportSize({ width: 1400, height });
      // Every layout shift with a node inside the outline, from the first paint on (buffered).
      await page.addInitScript(() => {
        const w = window as unknown as { tocShifts: string[] };
        w.tocShifts = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            for (const source of (entry as unknown as { sources: { node: Node | null }[] }).sources) {
              const node = source.node;
              const el = node instanceof Element ? node : node?.parentElement;
              if (el?.closest('starlight-toc')) w.tocShifts.push(el.outerHTML.slice(0, 80));
            }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(PAGE + hash);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      if (height > 800) {
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
        await expect(page.locator('starlight-toc a[aria-current="true"]')).toHaveAttribute(
          'href',
          '#run-the-smoke-test',
        );
      }
      expect(await expanded(page)).toEqual(['false', 'false', 'false', last]);
      expect(await page.evaluate(() => (window as unknown as { tocShifts: string[] }).tocShifts)).toEqual([]);
    });
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe: no violations on the outline, folded and opened, target-size included (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(PAGE);
      // target-size (WCAG 2.5.8, off in axe's defaults, on in Lighthouse's) over the buttons: the outline's link rows are
      // 23.6px tall, under 24px, since before the fold (Lighthouse audits the phone layout, where they are hidden).
      const audits = [
        () => new AxeBuilder({ page }).include('starlight-toc').analyze(),
        () => new AxeBuilder({ page }).include('starlight-toc button').withRules(['target-size']).analyze(),
      ];
      for (const step of ['folded', 'opened']) {
        if (step === 'opened') for (const title of SECTIONS) await button(page, title).click();
        await settle(page);
        const all = await audits[0]?.();
        const target = await audits[1]?.();
        const named = (vs: { id: string; nodes: { target: unknown[] }[] }[]) =>
          vs.map((v) => `${step} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
        expect(named([...(all?.violations ?? []), ...(target?.violations ?? [])])).toEqual([]);
        // target-size ran over every button (a rule that matched nothing passes nothing).
        expect(target?.passes.find((p) => p.id === 'target-size')?.nodes.length).toBe(SECTIONS.length);
      }
    });
  }
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('every row shows and no button does, on the desktop outline and in the phone list', async ({
    page,
    isMobile,
  }) => {
    await page.goto(PAGE);
    await expect(page.locator('starlight-toc button')).toHaveCount(SECTIONS.length);
    for (const title of SECTIONS)
      await expect(page.locator(`starlight-toc button[aria-label="Subsections of ${title}"]`)).toBeHidden();
    if (!isMobile) {
      await page.setViewportSize({ width: 1400, height: 800 });
      await expect(page.locator('starlight-toc a:visible')).toHaveCount(13);
    } else {
      await page.locator('mobile-starlight-toc summary').click();
      await expect(page.locator('mobile-starlight-toc a:visible')).toHaveCount(13);
    }
  });
});

test.describe('phone outline', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('its list is one element until the first open, then every row, flat, with the current one marked', async ({
    page,
  }) => {
    await page.goto(PAGE);
    const toc = page.locator('mobile-starlight-toc');
    await expect(toc.locator('.display-current')).toHaveText('Overview');
    expect(await toc.evaluate((el) => el.querySelectorAll('.dropdown *').length)).toBe(1); // the <noscript>
    await toc.locator('summary').click();
    await expect(toc.locator('details')).toHaveJSProperty('open', true);
    await expect(toc.locator('a:visible')).toHaveCount(13);
    await expect(toc.locator('a[aria-current="true"]')).toHaveAttribute('href', '#_top');
    await expect(toc.locator('button')).toHaveCount(0);
  });

  test('a tap before the outline script ran still gets the rows once it runs', async ({ page }) => {
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route(/TableOfContents\.astro_astro_type_script/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(PAGE, { waitUntil: 'commit' });
    const toc = page.locator('mobile-starlight-toc');
    await toc.locator('summary').click(); // the native open: nothing to show yet
    await expect(toc.locator('details')).toHaveJSProperty('open', true);
    await expect(toc.locator('a')).toHaveCount(0);
    release();
    await expect(toc.locator('a:visible')).toHaveCount(13);
  });
});
