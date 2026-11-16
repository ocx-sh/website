// ShellSession: command and output fences as one terminal surface. Axe in both schemes, one fused box,
// a `$` prompt on commands and a comment-coloured `>` on outputs (neither copied), a command copies
// only itself, an output has no copy button, and web fonts never resize the session.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settle } from './helpers/settle.ts';

const STORIES = ['default', 'languages', 'title', 'collapsed', 'markers', 'continuation'] as const;
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
      // target-size (WCAG 2.5.8) is off in axe's default set but is in Lighthouse's: a copy button beside the fold toggle failed it.
      const { violations } = await new AxeBuilder({ page })
        .include(SESSION)
        .options({ rules: { 'target-size': { enabled: true } } })
        .analyze();
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
      // Measured where the click will leave the page: a button below the fold is scrolled to by the click.
      await button.scrollIntoViewIfNeeded();
      const [entry, box] = await Promise.all([command.boundingBox(), button.boundingBox()]);
      expect(box?.y).toBeGreaterThanOrEqual((entry?.y ?? NaN) - 0.5);
      // The button is 24px (WCAG 2.5.8) on a 22.75px line: it may reach 1.25px into the next entry, no further.
      expect((box?.y ?? NaN) + (box?.height ?? NaN)).toBeLessThanOrEqual(
        (entry?.y ?? NaN) + (entry?.height ?? NaN) + 1.5,
      );
      const code = await button.getAttribute('data-code');
      await button.click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(code?.replace(/\u007f/g, '\n'));
      expect(code).not.toMatch(/^[$>]/);
      // The theme's copied pill, on stories too, sits on the button and stays inside the entry.
      const pill = command.locator('.copy .feedback.show');
      expect(await pill.evaluate((el) => getComputedStyle(el, '::before').content)).toContain('copied');
      expect(await pill.boundingBox()).toMatchObject({ y: box?.y, height: box?.height });
      const first = code?.split('\u007f').find((l) => l.trim()) ?? '';
      await expect(
        page.locator('[data-zag-root="toast"] [data-part="title"]', {
          hasText: `Copied — ${first.length > 40 ? `${first.slice(0, 39)}…` : first}`,
        }),
      ).toBeVisible();
    }
  }
  await page.goto(story('default'));
  const outputs = page.locator(`${SESSION} > [data-ocx-session="output"]`);
  await expect(outputs.nth(0).getByRole('button')).toHaveCount(0);
  await expect(outputs.nth(0).locator('.copy button')).toBeHidden();
  await expect(outputs.nth(1).locator('.copy button')).toBeHidden();
});

const FOLD = `${SESSION} .ocx-shell-session-fold`;

test('ShellSession collapsed: outputs start folded behind Output toggles, commands stay visible', async ({ page }) => {
  await page.goto(story('collapsed'));
  const toggles = page.locator(`${FOLD} > button`);
  await expect(toggles).toHaveCount(2);
  for (const toggle of await toggles.all()) {
    await expect(toggle).toHaveText('Output');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
  await expect(page.locator(`${SESSION} > [data-ocx-session="command"]`)).toHaveCount(2);
  await expect(page.locator(`${SESSION} > [data-ocx-session="command"]`).first()).toBeVisible();
  await expect(page.locator(`${FOLD} [data-ocx-session="output"]`).first()).toBeHidden();
});

test('ShellSession collapsed: a toggle opens and closes its own output from the keyboard', async ({ page }) => {
  await page.goto(story('collapsed'));
  const first = page.locator(`${FOLD} > button`).first();
  const second = page.locator(`${FOLD} > button`).nth(1);
  const outputs = page.locator(`${FOLD} [data-ocx-session="output"]`);
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await expect(outputs.first()).toBeVisible();
  await expect(outputs.first()).toContainText('locked 3 tools in ocx.lock');
  await expect(second).toHaveAttribute('aria-expanded', 'false');
  await expect(outputs.nth(1)).toBeHidden();
  await page.keyboard.press('Space');
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await expect(outputs.first()).toBeHidden();
});

test('ShellSession collapsed: an opened output keeps the > marker and has no copy button', async ({ page }) => {
  await page.goto(story('collapsed'));
  await page.locator(`${FOLD} > button`).first().click();
  const line = page.locator(`${FOLD} [data-ocx-session="output"] .code`).first();
  await expect(line).toBeVisible();
  expect(await line.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"> "');
  await expect(page.locator(`${FOLD} .copy button`).first()).toBeHidden();
});

test('ShellSession collapsed: opening is instant under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(story('collapsed'));
  await page.locator(`${FOLD} > button`).first().click();
  const content = page.locator(`${FOLD} > [data-part="content"]`).first();
  await expect(content).toBeVisible();
  expect(await content.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s(, 0s)*$/);
});

// Marked lines and badges: the `markers` story holds a plain session, one under `play` and one `collapsed`.
const MARKERS = story('markers');
const PLAIN = `${SESSION}:not([data-ocx-play]):not(:has(.ocx-shell-session-fold))`;
/** The text a `content` value draws: `"1" / ""` (with its empty alt text) reads `1`, `none` reads null. */
const drawn = (content: string) => /^"([^"]*)"/.exec(content)?.[1] ?? null;
/** Computed pieces of a line: its prompt, the left edge of its text, the badge box against the line box. */
const lineBox = (line: import('@playwright/test').Locator) =>
  line.evaluate((el) => {
    const code = el.querySelector('.code') as HTMLElement;
    const before = getComputedStyle(code, '::before');
    const after = getComputedStyle(code, '::after');
    const box = el.getBoundingClientRect();
    const text = document.createRange();
    text.selectNodeContents(code);
    // The badge is a pseudo-element: no box to measure, so its geometry is computed from the same properties.
    const codeBox = code.getBoundingClientRect();
    const inset = parseFloat(after.insetInlineEnd);
    const width = parseFloat(after.width);
    return {
      prompt: before.content,
      promptPosition: before.position,
      textLeft: text.getBoundingClientRect().left - box.left,
      textRight: text.getBoundingClientRect().right,
      badge: after.content,
      badgeRight: codeBox.right - inset,
      badgeLeft: codeBox.right - inset - width,
      lineRight: box.right,
      lineWidth: box.width,
    };
  });

test('ShellSession markers: a marked line keeps its prompt and the text column stays aligned', async ({ page }) => {
  await page.goto(MARKERS);
  const lines = page.locator(`${PLAIN} .ec-line`);
  const boxes = await Promise.all((await lines.all()).map(lineBox));
  expect(boxes).toHaveLength(8);
  // Prompts: `$` on commands, `>` on outputs, marked or not, drawn in the flow.
  expect(boxes.map((b) => b.prompt)).toEqual(['"$ "', '"$ "', '"> "', '"> "', '"> "', '"> "', '"$ "', '"> "']);
  for (const b of boxes) expect(b.promptPosition).toBe('static');
  // One text column for every line of the session, plain, mark, ins, del or labelled.
  for (const b of boxes) expect(Math.abs(b.textLeft - (boxes[0]?.textLeft ?? NaN))).toBeLessThanOrEqual(1);
  // A highlight is visible: the marked line's background differs from the unmarked one's.
  const bg = await lines.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  expect(bg[2]).toBe('rgba(0, 0, 0, 0)');
  for (const i of [0, 3, 4, 5, 6]) expect(bg[i]).not.toBe('rgba(0, 0, 0, 0)');
});

test('ShellSession markers: a labelled marker is a badge at the line end, clear of the text and of the copy button', async ({
  page,
}) => {
  await page.goto(MARKERS);
  const lines = page.locator(`${PLAIN} .ec-line`);
  const labelled = [0, 1, 7];
  const boxes = await Promise.all(labelled.map((i) => lineBox(lines.nth(i))));
  expect(boxes.map((b) => drawn(b.badge))).toEqual(['1', '2', 'A']);
  const unlabelled = await lineBox(lines.nth(3));
  expect(drawn(unlabelled.badge)).toBeNull();
  const button = await page.locator(`${PLAIN} .copy button`).first().boundingBox();
  for (const b of boxes) {
    expect(b.badgeRight, 'inside the line box').toBeLessThanOrEqual(b.lineRight);
    expect(b.badgeRight, 'at the inline end: within 48px of the edge').toBeGreaterThan(b.lineRight - 48);
    expect(b.badgeLeft, 'after the text').toBeGreaterThan(b.textRight);
  }
  expect(boxes[0]?.badgeRight, "left of the first line's copy button").toBeLessThanOrEqual(button?.x ?? NaN);
  // The same column on every line.
  expect(Math.abs((boxes[0]?.badgeRight ?? NaN) - (boxes[2]?.badgeRight ?? NaN))).toBeLessThanOrEqual(1);
});

test('ShellSession markers: a long marked line stops before its badge when it wraps', async ({ page }) => {
  await page.goto(MARKERS);
  const wrapped = await page
    .locator(`${PLAIN} .ec-line.tm-label`)
    .first()
    .evaluate((el) => {
      const code = el.querySelector('.code') as HTMLElement;
      const end = parseFloat(getComputedStyle(code).paddingInlineEnd);
      const after = getComputedStyle(code, '::after');
      return { end, badge: parseFloat(after.insetInlineEnd) + parseFloat(after.width) };
    });
  expect(wrapped.end, "the line reserves the badge's room").toBeGreaterThanOrEqual(wrapped.badge);
});

test('ShellSession markers: the copy button copies the command, never the badge', async ({ page }) => {
  await page.goto(MARKERS);
  const button = page.locator(`${PLAIN} [data-ocx-session="command"] .copy button`).first();
  // Expressive Code joins the lines of data-code with U+007F.
  expect(await button.getAttribute('data-code')).toBe('ocx install cmake:3.31\x7focx select cmake:3.31');
  await button.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'ocx install cmake:3.31\nocx select cmake:3.31',
  );
  // Nothing in the DOM carries the label: it is generated content.
  const dom = await page
    .locator(`${PLAIN} .ec-line.tm-label .code`)
    .evaluateAll((els) => els.map((e) => e.textContent));
  expect(dom).toEqual(['ocx install cmake:3.31', 'ocx select cmake:3.31', 'cmake version 3.31.1']);
});

test('ShellSession markers: the badge text meets contrast, and no label is exposed to assistive technology', async ({
  page,
}) => {
  await page.goto(MARKERS);
  const info = await page
    .locator(`${PLAIN} .ec-line.tm-label .code`)
    .first()
    .evaluate((el) => {
      const after = getComputedStyle(el, '::after');
      return {
        color: after.color,
        bg: after.backgroundColor,
        size: parseFloat(after.fontSize),
        content: after.content,
      };
    });
  expect(info.size).toBeGreaterThanOrEqual(12);
  expect(info.color).not.toBe(info.bg);
  // Decorative: the empty alt text after the slash keeps the label out of the accessibility tree; the legend in
  // the prose carries the meaning.
  expect(info.content).toMatch(/^"1" \/ ""$/);
});

test('ShellSession markers under play: the badge is never typed and gives the line end to the cursor', async ({
  page,
}) => {
  await page.goto(MARKERS);
  const play = page.locator(`${SESSION}[data-ocx-play]`);
  await play.scrollIntoViewIfNeeded();
  // While the labelled command is typed (`data-cur`) its end is the cursor's: no badge there.
  const typing = await page.waitForFunction(() => {
    const code = document.querySelector('.ocx-shell-session[data-ocx-play] .ec-line.tm-label .code[data-cur]');
    return code ? { badge: getComputedStyle(code, '::after').content, text: code.textContent } : null;
  });
  const during = (await typing.jsonValue()) as { badge: string; text: string };
  expect(during.badge).toBe('none');
  expect('ocx lock').toContain(during.text ?? '');
  // Typed out, the line shows its badge, and the text nodes never held the label.
  await page.waitForFunction(() => {
    const code = document.querySelector('.ocx-shell-session[data-ocx-play] .ec-line.tm-label .code');
    return (
      code &&
      !code.hasAttribute('data-cur') &&
      code.textContent === 'ocx lock' &&
      getComputedStyle(code, '::after').content.startsWith('"1"')
    );
  });
});

test('ShellSession markers under collapsed: a marked line renders its prompt and badge once the output is opened', async ({
  page,
}) => {
  await page.goto(MARKERS);
  const fold = page.locator(`${SESSION} .ocx-shell-session-fold`);
  await fold.locator('> button').click();
  const lines = fold.locator('.ec-line');
  await expect(lines.first()).toBeVisible();
  const [first, second] = await Promise.all([lineBox(lines.nth(0)), lineBox(lines.nth(1))]);
  expect(first.prompt).toBe('"> "');
  expect(drawn(first.badge)).toBeNull();
  expect(drawn(second.badge)).toBe('1');
  expect(second.badgeRight).toBeLessThanOrEqual(second.lineRight);
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

test('ShellSession: the lines inside an open quote draw no `$`, the next command does', async ({ page }) => {
  await page.goto(story('continuation'));
  const lines = page.locator(`${SESSION}:nth-of-type(2) [data-ocx-session="command"] .ec-line`);
  await expect(lines).toHaveCount(4);
  const shown = await lines.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el.querySelector('.code') as Element, '::before').visibility),
  );
  expect(shown).toEqual(['visible', 'hidden', 'hidden', 'visible']);
});
