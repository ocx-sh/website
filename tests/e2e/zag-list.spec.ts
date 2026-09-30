// Z14 List on its showcase stories: C-250 (listbox.zag), C-251 and S-111 (async-list.zag), and C-130
// (c) first paint, (d) keyboard, (e) axe, (g) events in the log, (h) no leak over change and
// load/abort cycles.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoLeak } from './helpers/leak.ts';
import { activate } from './helpers/zag.ts';
import { repaint } from './helpers/repaint.ts';

const PAGE = '/docs/stories/list/default/';
const STATES = '/docs/stories/list/states/';
const ASYNC = '/docs/stories/list/demo/';

// CDP (leaks) is chromium-only, and the keyboard paths are desktop; one desktop pass is the gate.
test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

const demo = (page: Page) => page.locator('#story [data-zag-root="listbox"]');
const catalog = (page: Page) => page.locator('#story [data-zag-root="listbox"]');
const content = (root: Locator) => root.locator('[data-part="content"]');
const row = (root: Locator, value: string) => root.locator(`[role="option"][data-value="${value}"]`);
const values = (root: Locator) =>
  root.locator('[role="option"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-value')));
const live = (root: Locator) => expect(root).toHaveAttribute('data-zag-state', 'live');
const active = (root: Locator) =>
  content(root).evaluate((el) => el.getAttribute('aria-activedescendant')?.replace(/^.*:/, '') ?? null);
const log = (page: Page, id: string) => page.locator(`[data-showcase-log="#${id}"] ol`);
const control = (page: Page, name: string) => page.locator(`#story [data-list="${name}"]`);
/** Event logs keep up to 50 entries by design; a leak cycle must not count them. */
const dropLogs = (page: Page) =>
  page.locator('[data-showcase-log]').evaluateAll((els) => els.forEach((e) => e.remove()));

/** Screenshot of `pick(page)` with its chunk blocked, and again after it went live, blurred. */
async function firstPaint(page: Page, chunk: RegExp, pick: (p: Page) => Locator, path = PAGE) {
  await page.route(chunk, (r) => r.abort());
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  const before = await pick(page).screenshot({ animations: 'disabled' });
  await page.unroute(chunk);
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  const root = pick(page);
  await activate(root);
  await live(root);
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await repaint(page);
  const after = await root.screenshot({ animations: 'disabled' });
  expect(Buffer.compare(before, after), 'first paint differs from the live default state').toBe(0);
}

test.describe('C-250 List', () => {
  test('C-130c first paint is final: SSR with listbox.zag blocked equals the live default state', async ({ page }) => {
    await firstPaint(page, /listbox\.zag/, demo);
  });

  test('C-130d APG listbox keys: the key pressed while loading is replayed, arrows skip disabled rows, Home/End, typeahead, Enter', async ({
    page,
  }) => {
    await page.goto(PAGE);
    const root = demo(page);
    await content(root).focus();
    await page.keyboard.press('ArrowDown');
    await live(root);
    // One tab stop: focus stays on the listbox, rows are active descendants.
    await expect(content(root)).toBeFocused();
    expect(await active(root)).not.toBeNull();
    await page.keyboard.press('Home');
    expect(await active(root)).toBe('gcc');
    await page.keyboard.press('c');
    expect(await active(root)).toBe('clang');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await active(root)).toBe('ninja');
    await page.keyboard.press('ArrowDown');
    expect(await active(root)).toBe('ninja');
    await page.keyboard.press('Enter');
    await expect(row(root, 'ninja')).toHaveAttribute('aria-selected', 'true');
    await expect(row(root, 'clang')).toHaveAttribute('aria-selected', 'false');
    await expect(log(page, 'story')).toContainText('ocx:list:change {"value":["ninja"]}');
    await page.keyboard.press('Tab');
    await expect(root.locator(':focus')).toHaveCount(0);
  });

  test('C-250 horizontal and grid lists move with Left/Right, a grid with Up/Down by row', async ({ page }) => {
    await page.goto(STATES);
    const horizontal = page.locator('[data-zag-root="listbox"]:has([data-orientation="horizontal"][role="listbox"])');
    await content(horizontal).focus();
    await live(horizontal);
    await expect.poll(() => active(horizontal)).toBe('linux');
    await page.keyboard.press('ArrowRight');
    expect(await active(horizontal)).toBe('darwin');
    await page.keyboard.press('ArrowLeft');
    expect(await active(horizontal)).toBe('linux');

    const grid = page.locator('[data-zag-root="listbox"]:has([data-layout="grid"])');
    await content(grid).focus();
    await live(grid);
    await expect.poll(() => active(grid)).toBe('amd64');
    await page.keyboard.press('ArrowDown');
    expect(await active(grid)).toBe('riscv64');
    await page.keyboard.press('ArrowRight');
    expect(await active(grid)).toBe('s390x');
  });

  test('C-130g a click on a row logs ocx:list:change', async ({ page }) => {
    await page.goto(PAGE);
    await row(demo(page), 'gcc').click();
    await expect(row(demo(page), 'gcc')).toHaveAttribute('aria-selected', 'true');
    await expect(log(page, 'story')).toContainText('ocx:list:change {"value":["gcc"]}');
  });

  test('C-130g a multiple list toggles its rows', async ({ page }) => {
    await page.goto(STATES);
    const multiple = page.locator('[data-zag-root="listbox"]:has([aria-multiselectable="true"])');
    await row(multiple, 'darwin').click();
    await expect(row(multiple, 'darwin')).toHaveAttribute('aria-selected', 'true');
    await expect(row(multiple, 'linux')).toHaveAttribute('aria-selected', 'true');
    await row(multiple, 'linux').click();
    await expect(row(multiple, 'linux')).toHaveAttribute('aria-selected', 'false');
  });

  test('C-130h listbox.zag: selection change cycles leak nothing', async ({ page }) => {
    await page.goto(PAGE);
    await dropLogs(page);
    const root = demo(page);
    await expectNoLeak(page, async () => {
      await row(root, 'gcc').click();
      await expect(row(root, 'gcc')).toHaveAttribute('aria-selected', 'true');
      await row(root, 'zig').click();
      await expect(row(root, 'zig')).toHaveAttribute('aria-selected', 'true');
    });
  });
});

test.describe('C-251 / S-111 async List', () => {
  const more = (root: Locator) => root.locator('.ocx-list__more');
  const retry = (root: Locator) => root.locator('.ocx-list__retry');
  const status = (root: Locator) => root.locator('[role="status"]');

  test('C-130c first paint is final: SSR with async-list.zag blocked equals the live default state', async ({
    page,
  }) => {
    await firstPaint(page, /async-list\.zag/, catalog, ASYNC);
  });

  test('S-111 the first page is SSR, "Load more" pages through to the end with a loading state', async ({ page }) => {
    await page.goto(ASYNC);
    const root = catalog(page);
    expect(await values(root)).toEqual(['cmake', 'ninja', 'bazel', 'clang']);
    // Clicked before the machine is live: replayed once it is (C-104).
    await more(root).click();
    await expect(content(root)).toHaveAttribute('aria-busy', 'true');
    await expect(status(root)).toHaveText('Loading…');
    await expect(root.locator('[role="option"]')).toHaveCount(8);
    await expect(log(page, 'story')).toContainText('ocx:list:load {"count":8,"hasMore":true}');
    await more(root).click();
    await expect(root.locator('[role="option"]')).toHaveCount(10);
    await expect(more(root)).toBeHidden();
    await expect(log(page, 'story')).toContainText('ocx:list:load {"count":10,"hasMore":false}');
    await expect(row(root, 'zig')).toContainText('Compiler and toolchain for Zig and C');
  });

  test('S-111 a failed load shows the error and Retry; Retry loads the page', async ({ page }) => {
    await page.goto(ASYNC);
    const root = catalog(page);
    await control(page, 'fail').click();
    await more(root).click();
    await expect(status(root)).toHaveText('Could not load items.');
    await expect(retry(root)).toBeVisible();
    await expect(more(root)).toBeHidden();
    await expect(log(page, 'story')).toContainText('ocx:list:error {"message":"The catalog is offline (demo)."}');
    const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    await retry(root).click();
    await expect(root.locator('[role="option"]')).toHaveCount(8);
    await expect(retry(root)).toBeHidden();
    await expect(status(root)).toHaveText('');
  });

  test('C-251 filter before the list is live starts it; sort reloads from the first page', async ({ page }) => {
    await page.goto(ASYNC);
    const root = catalog(page);
    await control(page, 'filter').fill('z');
    await expect.poll(() => values(root)).toEqual(['bazel', 'zig']);
    await expect(more(root)).toBeHidden();
    await control(page, 'filter').fill('');
    await expect.poll(() => values(root)).toEqual(['cmake', 'ninja', 'bazel', 'clang']);
    await control(page, 'sort').click();
    await expect.poll(() => values(root)).toEqual(['zig', 'rust', 'python', 'node']);
    await control(page, 'filter').fill('nothing');
    await expect(root.locator('.ocx-list__empty')).toBeVisible();
  });

  test('S-111 keyboard selection works on card rows, loaded ones included', async ({ page }) => {
    await page.goto(ASYNC);
    const root = catalog(page);
    await more(root).click();
    await expect(root.locator('[role="option"]')).toHaveCount(8);
    await content(root).focus();
    await page.keyboard.press('End');
    expect(await active(root)).toBe('python');
    await page.keyboard.press('Enter');
    await expect(row(root, 'python')).toHaveAttribute('aria-selected', 'true');
    await expect(log(page, 'story')).toContainText('ocx:list:change {"value":["python"]}');
  });

  test('C-130h async-list.zag: load/abort cycles leak nothing', async ({ page }) => {
    await page.goto(ASYNC);
    await dropLogs(page);
    const root = catalog(page);
    await page.locator('#story [data-list-controls]').evaluate((el) => (el.dataset['delay'] = '20'));
    await activate(root);
    await live(root);
    const send = (text: string) =>
      root.evaluate((el, t) => el.dispatchEvent(new CustomEvent('ocx:list:filter', { detail: { text: t } })), text);
    await expectNoLeak(page, async () => {
      // The second filter aborts the first load in flight.
      await send('c');
      await send('');
      await expect(content(root)).not.toHaveAttribute('aria-busy', 'true');
      await expect(root.locator('[role="option"]')).toHaveCount(4);
    });
  });
});

for (const route of [PAGE, STATES, ASYNC])
  test(`C-130e axe clean on ${route}, before and after every list is live`, async ({ page }) => {
    await page.goto(route);
    const check = async (when: string) => {
      const { violations } = await new AxeBuilder({ page }).include('main').analyze();
      expect(violations.map((v) => `${when} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual(
        [],
      );
    };
    await check('ssr');
    for (const root of await page.locator('[data-zag-root="listbox"]').all()) {
      await activate(root);
      await live(root);
    }
    await check('live');
  });
