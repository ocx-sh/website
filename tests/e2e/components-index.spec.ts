// C-120 / D-SB9: the components gallery. Its groups (an h2 plus its card list) are the example
// sidebar's groups, every page is a card, a thumbnail iframe exists only once its box is on screen
// (inert, never focusable), the static title box covers JS-off and docs-only pages, and the filter
// hides a group left empty.
import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const INDEX = '/docs/components/';
const HEADINGS = 'main h2:has(+ .showcase-index)';
const pagesDir = new URL('../../examples/starlight/src/content/docs/components/', import.meta.url);
const storiesDir = new URL('../../examples/starlight/src/stories/', import.meta.url);

/** Every page under components/ as its link, e.g. `/docs/components/iconography/icon/`. */
const slugs = readdirSync(pagesDir, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.mdx?$/.test(f))
  .map((f) => f.replace(/\.mdx?$/, '').replace(/(^|\/)index$/, ''))
  .filter(Boolean);
const withStory = new Set(
  readdirSync(storiesDir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('/default.mdx'))
    .map((f) => f.slice(0, -'/default.mdx'.length)),
);

test.describe('components gallery', () => {
  test('groups match the sidebar groups under Components, each with an h2', async ({ page }) => {
    await page.goto(INDEX);
    // The theme's sidebar: a top-level group is a `.group-label` span plus a list; its nested groups
    // are collapsible roots whose content lists the links (collapsed, so read attributes, not text).
    const sidebarGroups = await page.locator('#starlight__sidebar .group-label').evaluateAll((labels) => {
      const top = labels.find((l) => l.textContent?.trim() === 'Components')?.nextElementSibling;
      return [...(top?.querySelectorAll(':scope > li[data-part="root"]') ?? [])].map((li) => ({
        label: li.querySelector('[data-part="trigger"]')?.textContent?.trim() ?? '',
        links: [...li.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? ''),
      }));
    });
    expect(sidebarGroups.length).toBeGreaterThan(3);
    const headings = (await page.locator(HEADINGS).allInnerTexts()).map((t) => t.trim());
    // Sidebar order; ungrouped pages (Typography) land in one final group.
    expect(headings.slice(0, sidebarGroups.length)).toEqual(sidebarGroups.map((g) => g.label));
    expect(headings.length).toBeLessThanOrEqual(sidebarGroups.length + 1);
    for (const { label, links } of sidebarGroups) {
      const list = page.locator(HEADINGS, { hasText: label }).locator('xpath=following-sibling::ul[1]');
      const cards = await list.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      expect(new Set(cards), label).toEqual(new Set(links.filter((h) => h !== INDEX)));
      expect(cards, label).toHaveLength(new Set(cards).size);
    }
  });

  test('every component page is linked once, with a thumbnail box', async ({ page }) => {
    expect(slugs.length).toBeGreaterThan(10);
    await page.goto(INDEX);
    for (const slug of slugs) {
      const card = page.locator(`main .showcase-index a[href="${INDEX}${slug}/"]`);
      await expect(card, slug).toHaveCount(1);
      const box = card.locator('.showcase-index__thumb');
      await expect(box, slug).toHaveAttribute('aria-hidden', 'true');
      if (withStory.has(slug)) await expect(box, slug).toHaveAttribute('data-story');
      else await expect(box, slug).not.toHaveAttribute('data-story');
    }
  });

  test('thumbnails in view load, those below do not, and none is focusable', async ({ page }) => {
    await page.goto(INDEX);
    const boxes = page.locator('main .showcase-index__thumb[data-story]');
    const frames = page.locator('main .showcase-index__thumb iframe');
    // On a short viewport the first row may sit below the fold: bring it up, nothing above it.
    await boxes.first().scrollIntoViewIfNeeded();
    const inView = () =>
      boxes.evaluateAll(
        (els) =>
          els.filter((el) => {
            const r = el.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight;
          }).length,
      );
    await expect(frames).toHaveCount(await inView());
    expect(await frames.count()).toBeGreaterThan(0);
    expect(await frames.count()).toBeLessThan(await boxes.count());
    const last = boxes.last();
    await expect(last.locator('iframe')).toHaveCount(0);

    const first = frames.first();
    await expect(first).toHaveAttribute('src', /\/docs\/stories\/.+\/default\/\?thumb$/);
    await expect(first).toHaveAttribute('inert', '');
    await expect(first).toHaveAttribute('tabindex', '-1');
    await expect(first).toHaveAttribute('aria-hidden', 'true');
    await expect(first).toHaveAttribute('title', / preview$/);
    await expect(first).toHaveAttribute('data-ready', '');
    await expect(first).toBeVisible();

    // Tabbing from the filter reaches card links only, never a thumbnail frame.
    await page.getByRole('searchbox', { name: 'Filter components' }).focus();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('IFRAME');
    }

    await last.scrollIntoViewIfNeeded();
    await expect(last.locator('iframe')).toHaveAttribute('src', /\?thumb$/);
  });

  test('the filter hides a group whose cards are all hidden', async ({ page }) => {
    await page.goto(INDEX);
    const headings = page.locator(HEADINGS);
    const total = await headings.count();
    const input = page.getByRole('searchbox', { name: 'Filter components' });
    await input.fill('dialog');
    await expect(page.locator(`${HEADINGS}:visible`)).not.toHaveCount(total);
    for (const heading of await headings.all()) {
      const list = heading.locator('xpath=following-sibling::ul[1]');
      if (await list.locator(':scope > li:visible').count()) {
        await expect(heading).toBeVisible();
        await expect(list).toBeVisible();
      } else {
        await expect(heading).toBeHidden();
        await expect(list).toBeHidden();
      }
    }
    await input.fill('');
    await expect(page.locator(`${HEADINGS}:visible`)).toHaveCount(total);
  });
});

test.describe('without JS', () => {
  test.use({ javaScriptEnabled: false });

  test('no iframe exists and every box shows its title', async ({ page }) => {
    await page.goto(INDEX);
    await expect(page.locator('main iframe')).toHaveCount(0);
    const box = page.locator('main .showcase-index__thumb').first();
    await expect(box).toBeVisible();
    await expect(box).not.toBeEmpty();
    await expect(page.locator(HEADINGS).first()).toBeVisible();
  });
});
