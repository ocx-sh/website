// ShellSession: command and output fences as one frame. Axe in both schemes, one fused box, a
// command copies only itself, an output has no copy button, and web fonts never resize the session.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settle } from './helpers/settle.ts';

const STORIES = ['default', 'languages', 'title'] as const;
const story = (name: string) => `/docs/stories/shell-session/${name}/`;
// The component page holds one live session inside Starlight's content, where starlight.css applies.
const PAGE = '/docs/components/shell-session/';
const SESSION = '.ocx-shell-session';
const ENTRY = `${SESSION} > [data-ocx-session]`;

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

for (const theme of ['light', 'dark']) {
  test(`ShellSession: axe reports no violations on the stories (${theme})`, async ({ page }) => {
    for (const path of [...STORIES.map(story), PAGE]) {
      await page.goto(path);
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      await settle(page); // axe must read final colours, not a theme crossfade
      const { violations } = await new AxeBuilder({ page }).include(SESSION).analyze();
      expect(violations.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual(
        [],
      );
    }
  });
}

test('ShellSession: entries are one fused frame, an output starting where its command ends', async ({ page }) => {
  await page.goto(story('default'));
  const boxes = await page.locator(ENTRY).evaluateAll((els) =>
    els.map((el) => {
      const { top, bottom } = el.getBoundingClientRect();
      return { kind: el.getAttribute('data-ocx-session'), top, bottom };
    }),
  );
  expect(boxes.map((b) => b.kind)).toEqual(['command', 'output', 'command', 'output']);
  for (const [i, box] of boxes.entries()) {
    if (i) expect(Math.abs(box.top - (boxes[i - 1]?.bottom ?? NaN))).toBeLessThanOrEqual(1);
  }
  // One outer border: the entries' own frames carry none.
  await expect(page.locator(`${ENTRY} pre`).first()).toHaveCSS('border-top-width', '0px');
  await expect(page.locator(SESSION)).toHaveCSS('border-top-width', '1px');
});

test('ShellSession: a command copies only itself; an output has no visible copy button', async ({ page }) => {
  await page.goto(story('default'));
  const entries = page.locator(ENTRY);
  const command = entries.nth(2);
  await command.hover();
  await command.getByRole('button', { name: 'Copy to clipboard' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('ocx exec -- node --version');
  await expect(entries.nth(1).getByRole('button')).toHaveCount(0);
  await expect(entries.nth(1).locator('.copy button')).toBeHidden();
  await expect(entries.nth(3).locator('.copy button')).toBeHidden();
});

/** Heights of every session on a story, and how many web fonts the page loaded. */
const measure = (page: Page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    return {
      // The metric fallbacks are local() faces: they count as loaded without a download.
      fonts: [...document.fonts].filter((f) => f.status === 'loaded' && !f.family.includes('Fallback')).length,
      heights: [...document.querySelectorAll('.ocx-shell-session')].map((el) => el.getBoundingClientRect().height),
    };
  });

for (const [name, path] of [...STORIES.map((n) => [n, story(n)] as const), ['component page', PAGE] as const]) {
  test(`ShellSession: the ${name}${path === PAGE ? '' : ' story'} is as tall with web fonts blocked as with them loaded`, async ({
    page,
  }) => {
    await page.route('**/*.woff2', (route) => route.abort());
    await page.goto(path);
    const blocked = await measure(page);
    await page.unroute('**/*.woff2');
    await page.goto(path);
    await page.evaluate(() => document.fonts.load('1em "IBM Plex Mono"'));
    const loaded = await measure(page);
    expect(blocked.fonts, 'no font loaded while blocked').toBe(0);
    expect(loaded.fonts, 'fonts loaded').toBeGreaterThan(0);
    expect(blocked.heights.length).toBeGreaterThan(0);
    for (const [i, h] of loaded.heights.entries())
      expect(Math.abs(h - (blocked.heights[i] ?? NaN))).toBeLessThanOrEqual(0.5);
  });
}
