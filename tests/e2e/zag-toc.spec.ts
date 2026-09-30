// C-201 Toc on its `default` story page (C-125): the end-of-page scroll-spy edge case (Track J owner finding).
// The machine's IntersectionObserver never lights short trailing sections, so toc.zag.mjs's
// `watchTail` runs toc-probe.mjs: a probe line that slides to the viewport bottom over the final
// screen of scroll, activating every entry in order and the last one at the bottom. A clicked
// entry is the active one while the view sits where its jump left it (the jump rule).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { activate } from './helpers/zag.ts';

const PAGE = '/docs/stories/toc/default/';
// The story is ~760px tall: at 160px the page has room to scroll, so the final screen (the tail
// probe) is a small part of it, the way it is on a long docs page.
const SHORT = { width: 1280, height: 160 };

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

const toc = (page: Page) => page.locator('#story [data-zag-root="toc"]');
const activeLink = (root: Locator) => root.locator('[data-part="link"][data-active]');
const live = (root: Locator) => expect(root).toHaveAttribute('data-zag-state', 'live');

test.describe('story', () => {
  test.use({ viewport: SHORT });

  test('C-201 end of page: the last entry (Keyboard) lights up once the page bottoms out', async ({ page }) => {
    await page.goto(PAGE);
    const root = toc(page);
    await activate(root);
    await live(root);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect
      .poll(() => activeLink(root).evaluateAll((els) => els.map((e) => e.getAttribute('data-value'))))
      .toEqual(['keyboard']);
    await expect(root.locator('[data-part="link"][data-value="keyboard"]')).toHaveAttribute('aria-current', 'location');
  });

  // Owner finding: the tail must ease through the short trailing sections, not skip them.
  test('C-201 final screen: scrolling in small steps activates every trailing entry in order', async ({ page }) => {
    await page.goto(PAGE);
    const root = toc(page);
    await activate(root);
    await live(root);
    const items = await root
      .locator('[data-part="link"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-value')));
    const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const seen: string[] = [];
    for (let y = 0; y < max + 50; y += 50) {
      await page.evaluate((top) => window.scrollTo(0, top), Math.min(y, max));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const now = await activeLink(root).evaluateAll((els) => els.map((e) => e.getAttribute('data-value')));
      if (now.length === 1 && seen.at(-1) !== now[0]) seen.push(now[0]!);
    }
    // Consecutive from the first entry seen to the last: none skipped, ending on the last.
    expect(seen).toEqual(items.slice(items.indexOf(seen[0]!)));
    expect(seen.at(-1)).toBe(items.at(-1));
  });

  // Review finding: the probe's band starts just under `scroll-padding-top` (the sticky header), so a
  // heading reached through its link is inside it; in the final screen the jump rule keeps the
  // clicked entry active although the probe line has slid below its heading.
  test.describe('clicked entry is active', () => {
    const clickEntry = async (page: Page, id: string) => {
      await page.goto(PAGE);
      const root = toc(page);
      await activate(root);
      await live(root);
      await root.locator(`[data-part="link"][data-value="${id}"]`).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      return root;
    };

    test('C-201 mid-page entry: clicking Props lights Props', async ({ page }) => {
      const root = await clickEntry(page, 'props');
      await expect
        .poll(() => activeLink(root).evaluateAll((els) => els.map((e) => e.getAttribute('data-value'))))
        .toEqual(['props']);
    });

    test('C-201 final-screen entry: clicking Events lights Events, a later scroll hands back to the probe', async ({
      page,
    }) => {
      const root = await clickEntry(page, 'events');
      await expect
        .poll(() => activeLink(root).evaluateAll((els) => els.map((e) => e.getAttribute('data-value'))))
        .toEqual(['events']);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect
        .poll(() => activeLink(root).evaluateAll((els) => els.map((e) => e.getAttribute('data-value'))))
        .toEqual(['keyboard']);
    });
  });
});

test.describe('docs TOC clicks', () => {
  test.use({ viewport: { width: 1280, height: 450 } });

  test('docs TOC: a mid-page and two final-screen entries each become current when clicked', async ({ page }) => {
    await page.goto('/docs/probe/long/');
    const current = page.locator('starlight-toc a[aria-current="true"]');
    for (const hash of ['#run-through-the-toolchain', '#update-deliberately', '#batch-or-one-at-a-time']) {
      await page.locator(`starlight-toc a[href="${hash}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${hash}$`));
      await expect(current).toHaveAttribute('href', hash);
      await expect(current).toHaveCount(1);
    }
    // The next scroll that moves the heading hands back to the probe: the bottom lights the last entry.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(current).toHaveAttribute('href', '#summary');
  });
});

// Owner finding, docs pages: Starlight's own TOC (`starlight-toc`, not C-201) spies with a thin band
// near the top, which short trailing sections never reach. TableOfContents.astro's inline spy runs
// the same probe: the last entry (Summary) is current at the bottom, every entry before it in order.
test('docs TOC end of page: the last entry (Summary) is current at the bottom, none skipped on the way', async ({
  page,
}) => {
  await page.goto('/docs/probe/long/');
  const current = page.locator('starlight-toc a[aria-current="true"]');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(current).toHaveAttribute('href', '#summary');
  await expect(current).toHaveCount(1);
  const hrefs = await page.locator('starlight-toc a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const seen: (string | null)[] = [];
  for (let y = 0; y < max + 50; y += 50) {
    await page.evaluate((top) => window.scrollTo(0, top), Math.min(y, max));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const href = await current.getAttribute('href');
    if (seen.at(-1) !== href) seen.push(href);
  }
  expect(seen).toEqual(hrefs.slice(hrefs.indexOf(seen[0]!)));
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(current).not.toHaveAttribute('href', '#summary');
  await expect(current).toHaveCount(1);
});

test('docs TOC opened at the bottom: the last entry is current without scrolling', async ({ page }) => {
  await page.goto('/docs/probe/long/#summary');
  await expect(page.locator('starlight-toc a[aria-current="true"]')).toHaveAttribute('href', '#summary');
});

// Owner finding, phone widths: Starlight's mobile TOC (`mobile-starlight-toc`) is its own element whose
// setter also writes the "On this page" summary; the tail rule must reach it too.
test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mobile TOC end of page: the summary shows the last heading at the bottom', async ({ page }) => {
    await page.goto('/docs/probe/long/');
    const toc = page.locator('mobile-starlight-toc');
    const last = (await toc.locator('a').last().textContent())?.trim() ?? '';
    expect(last).not.toBe('');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(toc.locator('.display-current')).toHaveText(last);
    await expect(toc.locator('a[aria-current="true"]')).toHaveAttribute('href', '#summary');
  });
});
