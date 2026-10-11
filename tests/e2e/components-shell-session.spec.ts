// ShellSession: command and output fences as one terminal surface. Axe in both schemes, one fused box,
// a `$` prompt on commands and a comment-coloured `>` on outputs (neither copied), a command copies
// only itself, an output has no copy button, and web fonts never resize the session.
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

test('ShellSession: entries are one terminal surface: contiguous, one background, no rail or separator', async ({
  page,
}) => {
  await page.goto(story('default'));
  const boxes = await page.locator(ENTRY).evaluateAll((els) =>
    els.map((el) => {
      const { top, bottom } = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      return {
        kind: el.getAttribute('data-ocx-session'),
        top,
        bottom,
        bg: getComputedStyle(el.querySelector('pre') as Element).backgroundColor,
        seam:
          (el.querySelector('figure') as Element).getBoundingClientRect().height -
          (el.querySelector('pre') as Element).getBoundingClientRect().height,
        rail: css.borderInlineStartWidth,
        rule: css.borderBlockStartWidth,
      };
    }),
  );
  expect(boxes.map((b) => b.kind)).toEqual(['command', 'output', 'command', 'output']);
  for (const [i, box] of boxes.entries()) {
    if (i) expect(Math.abs(box.top - (boxes[i - 1]?.bottom ?? NaN))).toBeLessThanOrEqual(1);
    expect(box.bg).toBe(boxes[0]?.bg);
    expect([box.rail, box.rule]).toEqual(['0px', '0px']);
    expect(box.seam, 'no frame area outside its code background').toBeLessThanOrEqual(0.5);
  }
  // One outer border: the entries' own frames carry none.
  await expect(page.locator(`${ENTRY} pre`).first()).toHaveCSS('border-top-width', '0px');
  await expect(page.locator(SESSION)).toHaveCSS('border-top-width', '1px');
});

for (const [name, path] of [
  ['story', story('languages')],
  ['component page', PAGE],
] as const) {
  test(`ShellSession: commands show a $ prompt, outputs a > in the comment colour, and neither is text (${name})`, async ({
    page,
  }) => {
    await page.goto(path);
    const lines = await page.locator(`${ENTRY} .code`).evaluateAll((els) => {
      const colour = (token: string) => {
        const probe = document.body.appendChild(document.createElement('i'));
        probe.style.color = `var(${token})`;
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      return {
        accent: colour('--ocx-color-accent-fg'),
        comment: colour('--ocx-color-code-comment'),
        lines: els.map((el) => {
          const before = getComputedStyle(el, '::before');
          return {
            kind: el.closest('[data-ocx-session]')?.getAttribute('data-ocx-session'),
            marker: before.content,
            markerColour: before.color,
            userSelect: before.userSelect,
            text: (el as HTMLElement).innerText,
            colours: [el, ...el.querySelectorAll('span')].map((n) => getComputedStyle(n).color),
          };
        }),
      };
    });
    expect(lines.lines.length).toBeGreaterThan(1);
    for (const line of lines.lines) {
      expect(line.userSelect).toBe('none');
      if (line.kind === 'command') {
        expect([line.marker, line.markerColour]).toEqual(['"$ "', lines.accent]);
      } else {
        // json and log token colours do not show: the whole line, marker included, is the comment colour.
        expect([line.marker, line.markerColour]).toEqual(['"> "', lines.comment]);
        expect(new Set(line.colours)).toEqual(new Set([lines.comment]));
      }
      expect(line.text).not.toMatch(/^[$>]/);
    }
  });
}

test('ShellSession: every command has a visible copy button inside its own entry, copying only that command', async ({
  page,
}) => {
  for (const path of [story('default'), PAGE]) {
    await page.goto(path);
    const entries = page.locator(ENTRY);
    const commands = entries.filter({ has: page.getByRole('button', { name: 'Copy to clipboard' }) });
    const n = await commands.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const command = commands.nth(i);
      const button = command.getByRole('button', { name: 'Copy to clipboard' });
      await expect(button).toHaveCSS('opacity', '1');
      const [entry, box] = await Promise.all([command.boundingBox(), button.boundingBox()]);
      expect(box?.y).toBeGreaterThanOrEqual((entry?.y ?? NaN) - 0.5);
      expect((box?.y ?? NaN) + (box?.height ?? NaN)).toBeLessThanOrEqual(
        (entry?.y ?? NaN) + (entry?.height ?? NaN) + 0.5,
      );
      const code = await button.getAttribute('data-code');
      await button.click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(code?.replace(/\u007f/g, '\n'));
      expect(code).not.toMatch(/^[$>]/);
    }
  }
  await page.goto(story('default'));
  const outputs = page.locator(`${SESSION} > [data-ocx-session="output"]`);
  await expect(outputs.nth(0).getByRole('button')).toHaveCount(0);
  await expect(outputs.nth(0).locator('.copy button')).toBeHidden();
  await expect(outputs.nth(1).locator('.copy button')).toBeHidden();
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
