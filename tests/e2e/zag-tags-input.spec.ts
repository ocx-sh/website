// C-273 TagsInput (tags-input.zag + combobox child) on its story pages: S-112 end to end, every
// keyboard rule of C-273, paste, blur, the form value before and after start, lazy start (C-113),
// first paint (C-130c), axe (C-130e), the chunk failing (S-112 error) and leaks (C-130h). SSR
// equality (C-130a) and the rules' pure helpers are unit tests (ui-tags-input*.test.ts).
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoLeak } from './helpers/leak.ts';
import { settle } from './helpers/settle.ts';

// Behaviour is viewport-independent and CDP (leak) is chromium-only: one desktop pass.
test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

// `default`: the Topics demo with its EventLog. `states`: allowCreate with suggestions, free text,
// prefilled, max, disabled, error and hint.
const PATH = '/docs/stories/tags-input/default/';
const MORE = '/docs/stories/tags-input/states/';
const ZAG_CHUNK = /\/_astro\/[^/]*\.zag\.[^/]*\.js$/;
const TAGS_CHUNK = /\/_astro\/tags-input\.zag\.[^/]*\.js$/;

const demo = (page: Page) => page.locator('#story');
const root = (page: Page, name = 'Topics') =>
  page.locator('[data-zag-root="tags-input"]').filter({ has: page.getByRole('combobox', { name, exact: true }) });
const field = (page: Page, name = 'Topics') => page.getByRole('combobox', { name, exact: true });
const freeRoot = (page: Page) =>
  page.locator('[data-zag-root="tags-input"]').filter({ has: page.getByLabel('Keywords', { exact: true }) });
const listbox = (page: Page, name = 'Topics') => page.getByRole('listbox', { name, exact: true });
/** A suggestion row by value (its name also holds the marked label and the meta). */
const option = (page: Page, value: string) => root(page).locator(`[role="option"][data-value="${value}"]`);
/** The chip texts of a root, in order. */
const chips = (r: Locator) => r.locator('.ocx-ui-input-group > [data-part="item"] [data-part="item-text"]');
const highlightedChip = (r: Locator) => r.locator('[data-part="item-preview"][data-highlighted]');
const live = (r: Locator) => expect(r).toHaveAttribute('data-zag-state', 'live');
/** Every EventLog line, newest first. */
const log = (page: Page) => demo(page).locator('.showcase-log__items > li');
const dropLogs = (page: Page) =>
  page.evaluate(() => document.querySelectorAll('.showcase-log').forEach((l) => l.remove()));
async function axe(page: Page) {
  // axe blends colours through the popup's opacity, so a fading popup fails contrast it passes at rest.
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).include('main').analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}
/** Form data of the fields inside `el`, read through a <form> wrapped around it. */
const formData = (el: Locator) =>
  el.evaluate((node) => {
    const form = document.createElement('form');
    node.before(form);
    form.append(node);
    const data = [...new FormData(form)].map(([k, v]) => `${k}=${typeof v === 'string' ? v : v.name}`);
    form.before(node);
    form.remove();
    return data;
  });
/** Focus the demo field and wait for both machines. */
async function start(page: Page, name = 'Topics') {
  await field(page, name).focus();
  await live(root(page, name));
}

test.describe('C-130b C-113 lazy start', () => {
  test.describe('JS off', () => {
    test.use({ javaScriptEnabled: false });
    test('C-130b every root is idle with data-zag-props, chips and the closed popup in the HTML', async ({ page }) => {
      await page.goto(PATH);
      await expectIdle(page);
      await expect(chips(root(page))).toHaveText(['cli', 'rust']);
      await expect(listbox(page)).toBeHidden();
    });
    test('C-130b every root of the states story is idle with data-zag-props in the HTML', async ({ page }) => {
      await page.goto(MORE);
      await expectIdle(page);
    });
    async function expectIdle(page: Page) {
      const roots = page.locator('[data-zag-root="tags-input"]');
      expect(await roots.count()).toBeGreaterThan(0);
      for (const r of await roots.all()) {
        await expect(r).toHaveAttribute('data-zag-state', 'idle');
        expect(JSON.parse((await r.getAttribute('data-zag-props')) ?? 'x')).toBeInstanceOf(Object);
      }
      expect(await page.locator('[data-zag-root] [data-focus], [data-zag-root] [data-focus-visible]').count()).toBe(0);
    }
  });

  test('C-113 idle 2 s after load with no input; a hover starts it', async ({ page }) => {
    await page.goto(PATH);
    await page.waitForTimeout(2000);
    for (const r of await page.locator('[data-zag-root="tags-input"]').all())
      await expect(r).toHaveAttribute('data-zag-state', 'idle');
    await root(page).hover();
    await live(root(page));
  });

  // Lighthouse: a stylesheet of the page was the request that queued LCP a round trip later.
  test('C-113 the popup styles come with the machine: not a stylesheet of the page, linked on the first hover', async ({
    page,
  }) => {
    const overlay = page.locator('link[rel="stylesheet"][href*="overlay"]');
    await page.goto(PATH);
    await expect(overlay).toHaveCount(0);
    await start(page);
    await expect(overlay).toHaveCount(1);
    await page.keyboard.type('kub');
    await expect(listbox(page)).toBeVisible();
    const popup = page.locator('.ocx-ui-tags-input__popup').first();
    await expect(popup).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  });
});

for (const path of [PATH, MORE])
  test(`C-130c first paint is final on ${path}: the page looks the same before the chunk loads and once every root runs`, async ({
    page,
  }) => {
    await page.route(ZAG_CHUNK, (route) => route.abort());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
    await page.mouse.move(0, 0);
    const content = page.locator('#story');
    const before = await content.screenshot();
    await page.unroute(ZAG_CHUNK);
    for (const r of await page.locator('[data-zag-root="tags-input"]').all()) {
      await r.hover();
      await live(r);
    }
    await page.mouse.move(0, 0);
    // Hovering the lower roots scrolled the page: back to the top, or the fixed site header lands
    // over the content in the second shot.
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      scrollTo(0, 0);
    });
    expect(await content.screenshot()).toEqual(before);
  });

test.describe('S-112 C-273 behaviour', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PATH);
  });

  test('S-112 tag an entry: "kub" highlights kubernetes, Enter adds it and keeps the list open, Backspace twice removes it, unknown text stays', async ({
    page,
  }) => {
    const r = root(page);
    await start(page);
    await page.keyboard.type('kub');
    await expect(listbox(page)).toBeVisible();
    await expect(option(page, 'k8s')).toHaveAttribute('data-highlighted', '');
    await expect(field(page)).toHaveAttribute('aria-activedescendant', /option:k8s$/);
    await page.keyboard.press('Enter');
    await expect(chips(r)).toHaveText(['cli', 'rust', 'kubernetes']);
    await expect(field(page)).toHaveValue('');
    await expect(listbox(page)).toBeVisible();
    await expect(option(page, 'k8s')).toBeHidden();
    await expect(log(page).first()).toHaveText('ocx:tags-input:change {"value":["cli","rust","k8s"]}');
    await page.keyboard.press('Backspace');
    await expect(highlightedChip(r)).toHaveText('kubernetes');
    await expect(listbox(page)).toBeHidden();
    await page.keyboard.press('Backspace');
    await expect(chips(r)).toHaveText(['cli', 'rust']);
    await page.keyboard.type('foo');
    await page.keyboard.press('Enter');
    await expect(field(page)).toHaveValue('foo');
    await expect(chips(r)).toHaveText(['cli', 'rust']);
    await expect(log(page).first()).toHaveText('ocx:tags-input:invalid {"value":"foo","reason":"unknown"}');
  });

  test('C-273 ↓ opens the list and ↑/↓ move the highlight; Enter adds the highlighted row', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ArrowDown');
    await expect(listbox(page)).toBeVisible();
    await expect(option(page, 'k8s')).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowDown');
    await expect(option(page, 'docker')).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowUp');
    await expect(option(page, 'k8s')).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(chips(root(page))).toHaveText(['cli', 'rust', 'docker']);
  });

  test('C-273 Enter with the list closed adds text naming a suggestion by label, any case, as its value', async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type('Kubernetes');
    await page.keyboard.press('Escape');
    await expect(listbox(page)).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(chips(root(page))).toHaveText(['cli', 'rust', 'kubernetes']);
    expect(await formData(root(page))).toEqual(['topics=cli, rust, k8s']);
  });

  test('C-273 the delimiter adds by the same rule; a duplicate is rejected and stays', async ({ page }) => {
    await start(page);
    await page.keyboard.type('python,');
    await expect(chips(root(page))).toHaveText(['cli', 'rust', 'python']);
    await expect(field(page)).toHaveValue('');
    await page.keyboard.type('rust,');
    await expect(field(page)).toHaveValue('rust');
    await expect(log(page).first()).toHaveText('ocx:tags-input:invalid {"value":"rust","reason":"duplicate"}');
  });

  test('C-273 ←/→ from the input start walk the chips; Delete removes the highlighted one', async ({ page }) => {
    const r = root(page);
    await start(page);
    await page.keyboard.press('ArrowLeft');
    await expect(highlightedChip(r)).toHaveText('rust');
    await page.keyboard.press('ArrowLeft');
    await expect(highlightedChip(r)).toHaveText('cli');
    await page.keyboard.press('ArrowRight');
    await expect(highlightedChip(r)).toHaveText('rust');
    // The chip is the preview's parent. Not `{ has: highlightedChip(r) }`: `has` runs the inner
    // locator's whole chain (root included) inside the chip, which never matches.
    const border = await highlightedChip(r)
      .locator('xpath=..')
      .evaluate((el) => getComputedStyle(el).borderColor);
    const focus = await page.evaluate(() => {
      const probe = document.createElement('i');
      probe.style.color = 'var(--ocx-color-focus)';
      document.body.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    expect(border).toBe(focus);
    await page.keyboard.press('Delete');
    await expect(chips(r)).toHaveText(['cli']);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(highlightedChip(r)).toHaveCount(0);
  });

  test('C-273 Escape closes the list, a second Escape clears the text', async ({ page }) => {
    await start(page);
    await page.keyboard.type('do');
    await expect(listbox(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(listbox(page)).toBeHidden();
    await expect(field(page)).toHaveValue('do');
    await page.keyboard.press('Escape');
    await expect(field(page)).toHaveValue('');
  });

  test('C-273 a remove button deletes its chip on click', async ({ page }) => {
    await start(page);
    await root(page).getByRole('button', { name: 'Remove cli', exact: true }).click();
    await expect(chips(root(page))).toHaveText(['rust']);
    await expect(log(page).first()).toHaveText('ocx:tags-input:change {"value":["rust"]}');
  });

  test('C-273 paste splits on the delimiter: known pieces are added, the rest stays as the text', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await start(page);
    await page.evaluate(() => navigator.clipboard.writeText('docker, nope, security'));
    await page.keyboard.press('ControlOrMeta+V');
    await expect(chips(root(page))).toHaveText(['cli', 'rust', 'docker', 'security']);
    await expect(field(page)).toHaveValue('nope');
    await expect(log(page)).toContainText(['ocx:tags-input:invalid {"value":"nope","reason":"unknown"}']);
  });

  test('C-273 leaving the field clears text that was not added', async ({ page }) => {
    await start(page);
    await page.keyboard.type('foo');
    await page.keyboard.press('Tab');
    await expect(field(page)).toHaveValue('');
    await expect(chips(root(page))).toHaveText(['cli', 'rust']);
  });

  test('C-273 allowCreate: the create row offers new text, Enter creates it and reports ocx:tags-input:create', async ({
    page,
  }) => {
    await page.goto(MORE);
    const name = 'Topics, open list';
    await start(page, name);
    await page.keyboard.type('zig');
    const create = listbox(page, name).getByRole('option', { name: 'Create "zig"' });
    await expect(create).toHaveAttribute('data-highlighted', '');
    await expect(create.locator('[data-icon="plus"]')).toHaveCount(1);
    const events: unknown[] = [];
    await page.exposeFunction('recordCreate', (d: unknown) => events.push(d));
    await page.evaluate(() =>
      document.addEventListener('ocx:tags-input:create', (e) =>
        (window as unknown as { recordCreate: (d: unknown) => void }).recordCreate((e as CustomEvent).detail),
      ),
    );
    await page.keyboard.press('Enter');
    await expect(chips(root(page, name))).toHaveText(['zig']);
    await expect.poll(() => events).toEqual([{ value: 'zig' }]);
  });

  test('C-273 free field: Enter and the delimiter create; no popup', async ({ page }) => {
    await page.goto(MORE);
    const r = freeRoot(page);
    await page.getByLabel('Keywords', { exact: true }).focus();
    await live(r);
    await page.keyboard.type('wasm');
    await page.keyboard.press('Enter');
    await page.keyboard.type('zot,');
    await expect(chips(r)).toHaveText(['ocx', 'oci', 'wasm', 'zot']);
    await expect(r.getByRole('listbox')).toHaveCount(0);
  });

  test('C-273 max: the input takes no text while full, data-max on the root; removing a chip frees it', async ({
    page,
  }) => {
    await page.goto(MORE);
    const name = 'Topics, at most 2';
    const r = root(page, name);
    await start(page, name);
    await expect(r).toHaveAttribute('data-max', '');
    await page.keyboard.type('x');
    await expect(field(page, name)).toHaveValue('');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(chips(r)).toHaveText(['cli']);
    await expect(r).not.toHaveAttribute('data-max');
    await page.keyboard.type('py');
    await expect(field(page, name)).toHaveValue('py');
  });

  test('C-273 the form carries the tags before and after the machine starts', async ({ page }) => {
    expect(await formData(root(page))).toEqual(['topics=cli, rust']);
    await start(page);
    await page.keyboard.type('kub');
    await page.keyboard.press('Enter');
    await expect(chips(root(page))).toHaveText(['cli', 'rust', 'kubernetes']);
    expect(await formData(root(page))).toEqual(['topics=cli, rust, k8s']);
  });
});

test.describe('C-130e axe', () => {
  test('axe clean with the popup closed (every root running) and open', async ({ page }) => {
    await page.goto(PATH);
    for (const r of await page.locator('main [data-zag-root="tags-input"]').all()) {
      await r.hover();
      await live(r);
    }
    await axe(page);
    await start(page);
    await page.keyboard.press('ArrowDown');
    await expect(listbox(page)).toBeVisible();
    await axe(page);
  });

  // The disabled, error, max, hint and allowCreate states.
  test('axe clean on the states story with every root running', async ({ page }) => {
    await page.goto(MORE);
    for (const r of await page.locator('main [data-zag-root="tags-input"]').all()) {
      await r.scrollIntoViewIfNeeded();
      await r.hover();
      await live(r);
    }
    await axe(page);
  });
});

test('S-112 the chunk fails: SSR chips stay, the input stays typeable, one console error', async ({ page }) => {
  await page.route(TAGS_CHUNK, (route) => route.abort());
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(PATH);
  await field(page).focus();
  await expect(root(page)).toHaveAttribute('data-zag-state', 'error');
  await expect(chips(root(page))).toHaveText(['cli', 'rust']);
  await page.keyboard.type('abc');
  await expect(field(page)).toHaveValue('abc');
  expect(errors.filter((e) => e.includes('[ocx] Zag failed to start'))).toHaveLength(1);
});

// Keyboard only, no typing: Chromium's editing keeps one node per typed-then-cleared input (a plain
// <input> does the same), which a leak count would blame on the component.
test('C-130h tags-input.zag: adding, removing, opening and closing leaks nothing', async ({ page }) => {
  await page.goto(PATH);
  const r = root(page);
  await start(page);
  await dropLogs(page);
  await expectNoLeak(page, async () => {
    await page.keyboard.press('ArrowDown');
    await expect(option(page, 'k8s')).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Enter');
    await expect(chips(r)).toHaveText(['cli', 'rust', 'kubernetes']);
    await page.keyboard.press('Escape');
    await expect(listbox(page)).toBeHidden();
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(chips(r)).toHaveText(['cli', 'rust']);
  });
});
