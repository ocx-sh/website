// C-270 Slider on Zag slider (C-130 a-h) on its story pages (stories/slider/{default,states}): lazy start (C-113), first paint
// (C-130c), APG slider keys (C-130d), drag, range thumbs that cannot cross, form values before and
// after the machine starts, axe (C-130e), events (C-130g) and leaks (C-114, C-130h). SSR markup
// equality and the page shape are unit tests (ui-slider.test.ts, showcase-shape.test.ts).
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoLeak } from './helpers/leak.ts';
import { repaint } from './helpers/repaint.ts';

// Behaviour is viewport-independent and CDP (leak) is chromium-only: one desktop pass.
test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

const DEFAULT = '/docs/stories/slider/default/';
const STATES_PAGE = '/docs/stories/slider/states/';
const ZAG_CHUNK = /\/_astro\/[^/]*\.zag\.[^/]*\.js$/;
const STATES = ['single', 'range', 'with marks', 'step 5, marks with labels', 'disabled', 'formatted value'];

const demo = (page: Page) => page.locator('#story');
const demoSlider = (page: Page) => demo(page).locator('[data-zag-root="slider"]');
const state = (page: Page, name: string) => page.locator(`.showcase-state:has(figcaption:text-is("${name}"))`);
const thumbs = (root: Locator) => root.locator('[role="slider"]');
const live = (root: Locator) => expect(root).toHaveAttribute('data-zag-state', 'live');
const now = (thumb: Locator) => thumb.getAttribute('aria-valuenow');
/** Hover a root and wait until its machine runs. */
async function start(root: Locator) {
  await root.hover();
  await live(root);
}
/** Focus a thumb (which starts the machine) and wait until it runs, so the next key reaches it. */
async function focusLive(root: Locator, thumb: Locator) {
  await thumb.focus();
  await live(root);
}
const lastEvent = (page: Page) => page.locator('.showcase-log__items > li').first();
/** The EventLog grows by design; leak cycles measure the component, so it goes first. */
const dropLogs = (page: Page) =>
  page.evaluate(() => document.querySelectorAll('.showcase-log').forEach((l) => l.remove()));
/** Form data of the fields inside `root`, read through a <form> wrapped around it. */
const formData = (root: Locator) =>
  root.evaluate((el) => {
    const form = document.createElement('form');
    el.before(form);
    form.append(el);
    const data = [...new FormData(form)].map(([k, v]) => `${k}=${typeof v === 'string' ? v : v.name}`);
    form.before(el);
    form.remove();
    return data;
  });

test.describe('C-130b SSR roots', () => {
  test.use({ javaScriptEnabled: false });
  test('C-130b every root is idle with data-zag-props, no data-focus, hidden inputs carry the values', async ({
    page,
  }) => {
    for (const path of [DEFAULT, STATES_PAGE]) {
      await page.goto(path);
      const roots = page.locator('[data-zag-root="slider"]');
      expect(await roots.count()).toBeGreaterThanOrEqual(path === DEFAULT ? 1 : STATES.length);
      for (const root of await roots.all()) {
        await expect(root).toHaveAttribute('data-zag-state', 'idle');
        expect(JSON.parse((await root.getAttribute('data-zag-props')) ?? 'x')).toBeInstanceOf(Object);
      }
      expect(await page.locator('[data-zag-root] [data-focus], [data-zag-root] [data-focus-visible]').count()).toBe(0);
    }
    expect(await formData(state(page, 'range').locator('[data-zag-root]'))).toEqual(['price[]=20', 'price[]=80']);
  });
});

test.describe('C-113 lazy start', () => {
  test('C-113 nothing loads without input; a hover starts the machine', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (r) => ZAG_CHUNK.test(new URL(r.url()).pathname) && chunks.push(r.url()));
    await page.goto(DEFAULT);
    await page.waitForTimeout(2000);
    for (const root of await page.locator('[data-zag-root="slider"]').all())
      await expect(root).toHaveAttribute('data-zag-state', 'idle');
    expect(chunks.filter((c) => /slider/.test(c))).toEqual([]);
    await start(demoSlider(page));
    expect(chunks.some((c) => /slider/.test(c))).toBe(true);
  });
});

test.describe('C-130c first paint is final', () => {
  for (const name of STATES)
    test(`C-130c ${name}: looks the same before the machine loads and once it runs`, async ({ page }) => {
      await page.route(ZAG_CHUNK, (route) => route.abort());
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(STATES_PAGE);
      await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
      await page.mouse.move(0, 0);
      const stage = state(page, name).locator('.showcase-state__stage');
      const before = await stage.screenshot();
      await page.unroute(ZAG_CHUNK);
      await start(stage.locator('[data-zag-root]'));
      await page.mouse.move(0, 0);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await repaint(page);
      expect(await stage.screenshot()).toEqual(before);
    });

  test('C-130c the demo looks the same before and after start', async ({ page }) => {
    await page.route(ZAG_CHUNK, (route) => route.abort());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(DEFAULT);
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
    await page.mouse.move(0, 0);
    const stage = demo(page).locator('.showcase-demo__stage');
    const before = await stage.screenshot();
    await page.unroute(ZAG_CHUNK);
    await start(demoSlider(page));
    await page.mouse.move(0, 0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await repaint(page);
    expect(await stage.screenshot()).toEqual(before);
  });
});

test.describe('C-130d keyboard (APG slider)', () => {
  test('C-130d arrows step by one, PageUp/PageDown by the large step, Home/End jump to the ends', async ({ page }) => {
    await page.goto(DEFAULT);
    // The demo: min 1, max 16, value 4.
    const root = demoSlider(page);
    const thumb = thumbs(root).first();
    await focusLive(root, thumb);
    expect(await now(thumb)).toBe('4');
    await page.keyboard.press('ArrowRight');
    expect(await now(thumb)).toBe('5');
    await page.keyboard.press('ArrowUp');
    expect(await now(thumb)).toBe('6');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowDown');
    expect(await now(thumb)).toBe('4');
    await page.keyboard.press('PageUp');
    expect(Number(await now(thumb))).toBeGreaterThan(10);
    await page.keyboard.press('PageDown');
    expect(Number(await now(thumb))).toBeLessThan(6);
    await page.keyboard.press('End');
    expect(await now(thumb)).toBe('16');
    await page.keyboard.press('ArrowRight');
    expect(await now(thumb)).toBe('16');
    await page.keyboard.press('Home');
    expect(await now(thumb)).toBe('1');
  });

  test('C-130d the value text, the hidden input and the events follow the key', async ({ page }) => {
    await page.goto(DEFAULT);
    const root = demoSlider(page);
    const thumb = thumbs(root).first();
    await focusLive(root, thumb);
    await page.keyboard.press('ArrowRight');
    await expect(root.locator('[data-part="value-text"]')).toHaveText('5');
    await expect(root.locator('input')).toHaveValue('5');
    await expect(lastEvent(page)).toHaveText('ocx:slider:change {"value":5}');
  });

  test('C-130d a disabled slider is not focusable and ignores clicks', async ({ page }) => {
    await page.goto(STATES_PAGE);
    const root = state(page, 'disabled').locator('[data-zag-root]');
    const thumb = thumbs(root).first();
    await expect(thumb).not.toHaveAttribute('tabindex', /.*/);
    await expect(thumb).toHaveAttribute('aria-disabled', 'true');
    await root.hover();
    await live(root);
    const box = await root.locator('[data-part="control"]').boundingBox();
    await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) * 0.1, (box?.y ?? 0) + (box?.height ?? 0) / 2);
    expect(await now(thumb)).toBe('60');
  });
});

test.describe('C-270 pointer', () => {
  test('dragging the thumb moves the value; input fires while dragging and change ends it', async ({ page }) => {
    await page.goto(DEFAULT);
    const root = demoSlider(page);
    await start(root);
    const thumb = thumbs(root).first();
    const control = (await root.locator('[data-part="control"]').boundingBox())!;
    const at = (await thumb.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(control.x + control.width + 20, at.y + at.height / 2, { steps: 8 });
    await expect(thumb).toHaveAttribute('data-dragging', '');
    await page.mouse.up();
    expect(await now(thumb)).toBe('16');
    await expect(lastEvent(page)).toHaveText('ocx:slider:change {"value":16}');
    await expect(page.locator('.showcase-log__items > li', { hasText: 'ocx:slider:input' }).first()).toBeVisible();
    await expect(thumb).not.toHaveAttribute('data-dragging', /.*/);
  });

  test('clicking the track jumps the nearest thumb there', async ({ page }) => {
    await page.goto(STATES_PAGE);
    const root = state(page, 'single').locator('[data-zag-root]');
    await start(root);
    const box = (await root.locator('[data-part="control"]').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
    expect(await now(thumbs(root).first())).toBe('75');
  });

  test('range: thumbs cannot cross, by key or by drag', async ({ page }) => {
    await page.goto(STATES_PAGE);
    const root = state(page, 'range').locator('[data-zag-root]');
    const [lo, hi] = [thumbs(root).nth(0), thumbs(root).nth(1)];
    await focusLive(root, lo);
    await page.keyboard.press('End');
    expect([await now(lo), await now(hi)]).toEqual(['80', '80']);
    await page.keyboard.press('Home');
    expect([await now(lo), await now(hi)]).toEqual(['0', '80']);
    const control = (await root.locator('[data-part="control"]').boundingBox())!;
    const at = (await hi.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(control.x - 40, at.y + at.height / 2, { steps: 8 });
    await page.mouse.up();
    expect(Number(await now(hi))).toBeGreaterThanOrEqual(Number(await now(lo)));
    await expect(root.locator('[data-part="value-text"]')).toHaveText(`${await now(lo)} – ${await now(hi)}`);
  });

  test('range thumbs are named Minimum and Maximum', async ({ page }) => {
    await page.goto(STATES_PAGE);
    const root = state(page, 'range').locator('[data-zag-root]');
    await expect(page.getByRole('slider', { name: 'Minimum Price' })).toHaveCount(1);
    await expect(page.getByRole('slider', { name: 'Maximum Price' })).toHaveCount(1);
    await start(root);
    await expect(page.getByRole('slider', { name: 'Minimum Price' })).toHaveCount(1);
  });

  test('formatted: the value text and aria-valuetext use the format, before and after start', async ({ page }) => {
    await page.goto(STATES_PAGE);
    const root = state(page, 'formatted value').locator('[data-zag-root]');
    await expect(root.locator('[data-part="value-text"]')).toHaveText('$200 – $800');
    await expect(thumbs(root).first()).toHaveAttribute('aria-valuetext', '$200');
    await focusLive(root, thumbs(root).first());
    await page.keyboard.press('ArrowRight');
    await expect(root.locator('[data-part="value-text"]')).toHaveText('$250 – $800');
    await expect(thumbs(root).first()).toHaveAttribute('aria-valuetext', '$250');
  });
});

test.describe('C-270 form', () => {
  test('the form carries the values before the machine starts and after it moved them', async ({ page }) => {
    await page.goto(DEFAULT);
    const root = demoSlider(page);
    await expect(root).toHaveAttribute('data-zag-state', 'idle');
    expect(await formData(root)).toEqual(['downloads=4']);
    await focusLive(root, thumbs(root).first());
    await page.keyboard.press('ArrowRight');
    expect(await formData(root)).toEqual(['downloads=5']);
    await page.goto(STATES_PAGE);
    const range = state(page, 'range').locator('[data-zag-root]');
    expect(await formData(range)).toEqual(['price[]=20', 'price[]=80']);
    await focusLive(range, thumbs(range).first());
    await page.keyboard.press('ArrowRight');
    expect(await formData(range)).toEqual(['price[]=21', 'price[]=80']);
  });
});

test.describe('C-130e axe', () => {
  for (const name of STATES)
    test(`C-130e ${name}: no violations, idle and live`, async ({ page }) => {
      await page.goto(STATES_PAGE);
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
        expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      };
      await scan();
      await start(state(page, name).locator('[data-zag-root]'));
      await scan();
    });

  test('C-130e the demo: no violations, idle and live', async ({ page }) => {
    await page.goto(DEFAULT);
    const scan = async () => {
      const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    };
    await scan();
    await start(demoSlider(page));
    await scan();
  });
});

test.describe('C-114 leak', () => {
  test('C-114 C-130h slider.zag: stepping a started slider to both ends and back leaks nothing', async ({ page }) => {
    await page.goto(DEFAULT);
    const root = demoSlider(page);
    await focusLive(root, thumbs(root).first());
    await dropLogs(page);
    await expectNoLeak(page, async () => {
      await page.keyboard.press('End');
      await page.keyboard.press('Home');
    });
  });
});

test('C-270 forced colours: the range paints in system ink, not the page canvas', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto(DEFAULT);
  const range = demoSlider(page).locator('[data-part="range"]');
  const bg = await range.evaluate((el) => getComputedStyle(el).backgroundColor);
  const canvas = await range.evaluate((el) => getComputedStyle(el.closest('main')!).backgroundColor);
  expect(bg).not.toBe(canvas);
});
